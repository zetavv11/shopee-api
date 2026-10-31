'use strict';

/**
 * Penyimpanan remote OPSIONAL lewat REST API Upstash Redis (juga dipakai Vercel KV).
 *
 * Tujuannya satu: data invoice/grafik tidak hilang saat Vercel cold start (folder /tmp bersifat sementara).
 * Seluruh database disimpan sebagai satu nilai (JSON dikompres gzip+base64) dengan penguncian optimistis:
 * penulisan hanya berhasil bila versi (rev) yang dibaca belum berubah (compare-and-set lewat skrip Lua).
 *
 * Token TIDAK pernah ikut ke pesan error / log.
 */

const axios = require('axios');
const zlib = require('zlib');
const crypto = require('crypto');
const config = require('../config');

// Mengembalikan {rev, blob} secara atomik.
const READ_SCRIPT = "return {redis.call('GET', KEYS[2]), redis.call('GET', KEYS[1])}";

// Tulis hanya bila rev saat ini == rev yang diharapkan ('0' = belum pernah ditulis).
const CAS_SCRIPT = [
  "local cur = redis.call('GET', KEYS[2])",
  "if (not cur and ARGV[1] == '0') or cur == ARGV[1] then",
  "  redis.call('SET', KEYS[1], ARGV[2])",
  "  redis.call('SET', KEYS[2], ARGV[3])",
  '  return 1',
  'end',
  'return 0',
].join('\n');

const http = axios.create({ timeout: 8000, validateStatus: () => true });

function cfg() {
  return config.remoteStore;
}

function enabled() {
  return Boolean(cfg().url && cfg().token);
}

function keys() {
  return [cfg().key, `${cfg().key}:rev`];
}

// Titik ganti untuk pengujian: menerima array perintah Redis, mengembalikan `result`.
const transport = {
  async send(args) {
    const res = await http.post(cfg().url, args, { headers: { Authorization: `Bearer ${cfg().token}` } });
    if (res.status !== 200 || (res.data && res.data.error)) {
      throw new Error(`Penyimpanan remote menolak permintaan (HTTP ${res.status}).`);
    }
    return res.data ? res.data.result : null;
  },
};

function encode(data) {
  return 'gz:' + zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8'), { level: 9 }).toString('base64');
}

function decode(blob) {
  if (typeof blob !== 'string' || !blob.startsWith('gz:')) throw new Error('Format data remote tidak dikenali.');
  return JSON.parse(zlib.gunzipSync(Buffer.from(blob.slice(3), 'base64')).toString('utf8'));
}

function newRev() {
  return crypto.randomBytes(8).toString('hex');
}

async function load() {
  const [dataKey, revKey] = keys();
  const out = await transport.send(['EVAL', READ_SCRIPT, '2', dataKey, revKey]);
  const [rev, blob] = Array.isArray(out) ? out : [null, null];
  if (blob === null || blob === undefined || blob === false) return null;
  return { rev: String(rev || '0'), data: decode(blob) };
}

/** @returns {Promise<boolean>} true bila tersimpan, false bila ada instance lain yang menulis lebih dulu. */
async function save(expectedRev, nextRev, data) {
  const [dataKey, revKey] = keys();
  const out = await transport.send(['EVAL', CAS_SCRIPT, '2', dataKey, revKey, String(expectedRev), encode(data), String(nextRev)]);
  return Number(out) === 1;
}

module.exports = { enabled, load, save, newRev, encode, decode, transport, READ_SCRIPT, CAS_SCRIPT };
