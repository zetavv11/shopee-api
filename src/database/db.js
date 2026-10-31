'use strict';

/**
 * Penyimpanan berbasis berkas JSON (pengganti PostgreSQL), dengan cermin remote OPSIONAL.
 *
 * - Lokasi berkas: env DATABASE_FILE, atau ./database.json (lokal), atau /tmp/database.json di Vercel
 *   (satu-satunya folder yang bisa ditulis di Vercel).
 * - Semua perubahan lewat transaction(): diserialkan (antre), dikerjakan pada salinan data, lalu
 *   ditulis atomik (tulis ke berkas sementara -> rename). Bila fungsi melempar error, data tidak berubah.
 * - Bila UPSTASH_REDIS_REST_URL/TOKEN diisi, data juga disimpan di Redis (lihat remote.js) sehingga
 *   tidak hilang saat Vercel cold start dan konsisten antar-instance. Tanpa itu, /tmp bersifat sementara
 *   (lihat README bagian "Batasan Vercel").
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const remote = require('./remote');

const COLLECTIONS = ['invoices', 'payment_events', 'webhook_events', 'callback_deliveries'];
const DAY = 24 * 3600 * 1000;
const WRITE_RETRIES = 4;

function emptyData() {
  const d = {};
  for (const c of COLLECTIONS) d[c] = [];
  return d;
}

function resolveFile() {
  if (config.databaseFile) return path.resolve(config.databaseFile);
  if (config.isVercel) return '/tmp/database.json';
  return path.resolve(process.cwd(), 'database.json');
}

let cache = null;
let cacheMtime = 0;
let cacheRev = '0'; // versi data remote yang tercermin di `cache`
let lastPullAt = 0;
let chain = Promise.resolve();

function normalize(parsed) {
  const d = emptyData();
  if (parsed && typeof parsed === 'object') {
    for (const c of COLLECTIONS) if (Array.isArray(parsed[c])) d[c] = parsed[c];
  }
  return d;
}

function load() {
  const file = resolveFile();
  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (!stat) {
    // Berkas belum ada: mulai kosong dan buat berkas.
    cache = emptyData();
    persist(cache);
    return cache;
  }
  if (cache && stat.mtimeMs === cacheMtime) return cache;

  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) {
    cache = emptyData();
  } else {
    try {
      cache = normalize(JSON.parse(text));
    } catch (err) {
      // Jangan menimpa berkas yang rusak: berhenti dan minta manusia memeriksanya.
      throw new Error(`database.json rusak dan tidak bisa dibaca (${err.message}). Perbaiki atau hapus berkas ${file}.`);
    }
  }
  cacheMtime = stat.mtimeMs;
  return cache;
}

function persist(data) {
  const file = resolveFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, remote.enabled() ? 0 : 2));
  fs.renameSync(tmp, file);
  cacheMtime = fs.statSync(file).mtimeMs;
}

/**
 * Merapikan data sebelum disimpan ke remote: membuang payload QR yang sudah tidak terpakai dan
 * riwayat lama yang tidak lunas, agar ukuran tetap kecil. Invoice PAID TIDAK pernah dihapus.
 */
function compact(d) {
  const keepMs = Date.now() - 60 * DAY;
  const ts = (v) => new Date(v).getTime();
  d.invoices = d.invoices.filter((i) => i.status === 'PENDING' || i.status === 'PAID' || ts(i.updated_at || i.created_at) >= keepMs);
  for (const i of d.invoices) if (i.status !== 'PENDING') i.qris_payload = null;
  const alive = new Set(d.invoices.map((i) => i.id));
  d.payment_events = d.payment_events.filter((e) => alive.has(e.invoice_id));
  d.callback_deliveries = d.callback_deliveries.filter(
    (c) => alive.has(c.invoice_id) && (c.status !== 'DELIVERED' || ts(c.delivered_at || c.updated_at) >= Date.now() - 30 * DAY)
  );
  d.webhook_events = d.webhook_events.filter((w) => ts(w.created_at || Date.now()) >= Date.now() - 30 * DAY);
}

/** Tarik versi terbaru dari remote bila lebih baru dari cache. Gagal baca = tetap pakai cache lokal. */
async function pull({ force = false, strict = false } = {}) {
  if (!remote.enabled()) return;
  if (!force && cache && Date.now() - lastPullAt < config.remoteStore.readTtlMs) return;
  try {
    const snap = await remote.load();
    lastPullAt = Date.now();
    if (!snap) return; // remote masih kosong: akan diisi pada penulisan berikutnya
    if (snap.rev !== cacheRev) {
      cache = normalize(snap.data);
      cacheRev = snap.rev;
      persist(cache);
    }
  } catch (err) {
    if (strict) throw err;
    logger.warn('Gagal membaca penyimpanan remote, memakai salinan lokal', { error: err.message });
  }
}

/** Baca saja. `fn` menerima data hidup: JANGAN dimodifikasi; salin baris sebelum dikembalikan. */
async function read(fn) {
  await chain.catch(() => {});
  await pull();
  return fn(load());
}

/** Ubah data secara atomik. `fn(data)` memodifikasi salinan; hasil return-nya diteruskan. */
function transaction(fn) {
  const run = chain.catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
      await pull({ force: true, strict: true });
      const draft = structuredClone(load());
      const result = await fn(draft);

      if (remote.enabled()) {
        compact(draft);
        const nextRev = remote.newRev();
        const saved = await remote.save(cacheRev, nextRev, draft);
        if (!saved) {
          lastPullAt = 0; // instance lain menulis lebih dulu: ambil versinya lalu ulangi perubahan ini
          continue;
        }
        cacheRev = nextRev;
        lastPullAt = Date.now();
      }

      persist(draft); // gagal menulis => error, cache lama tetap utuh
      cache = draft;
      return result;
    }
    throw new Error('Penyimpanan sedang sibuk (konflik tulis berulang). Coba lagi sebentar.');
  });
  chain = run;
  return run;
}

async function ping() {
  await pull({ force: true });
  load();
}

async function close() {
  await chain.catch(() => {});
}

function filePath() {
  return resolveFile();
}

function mode() {
  if (remote.enabled()) return 'remote';
  return config.isVercel && !config.databaseFile ? 'ephemeral' : 'file';
}

// Hanya untuk pengujian.
function _reset() {
  cache = null;
  cacheMtime = 0;
  cacheRev = '0';
  lastPullAt = 0;
  chain = Promise.resolve();
}

module.exports = { read, transaction, ping, close, filePath, mode, COLLECTIONS, _reset };
