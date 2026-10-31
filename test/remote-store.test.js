'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
process.env.DATABASE_FILE = path.join(tmp, 'a.json');
process.env.API_KEY = 'test_api_key_1234567890';
process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake_token_value';
process.env.REMOTE_READ_TTL_MS = '0';

const test = require('node:test');
const assert = require('node:assert/strict');
const remote = require('../src/database/remote');
const db = require('../src/database/db');
const invoices = require('../src/services/invoices');

// Redis palsu di memori: memahami dua skrip Lua yang dipakai remote.js.
const store = new Map();
let sets = 0;
remote.transport.send = async (args) => {
  const [cmd, script, , k1, k2, ...rest] = args;
  assert.equal(cmd, 'EVAL');
  if (script === remote.READ_SCRIPT) return [store.get(k2) ?? null, store.get(k1) ?? null];
  if (script === remote.CAS_SCRIPT) {
    const [expected, blob, next] = rest;
    const cur = store.get(k2);
    if ((cur === undefined && expected === '0') || cur === expected) {
      store.set(k1, blob);
      store.set(k2, next);
      sets++;
      return 1;
    }
    return 0;
  }
  throw new Error('skrip tak dikenal');
};

const base = (over = {}) => ({
  orderId: 'R-1',
  amount: 1,
  uniqueCode: 0,
  payableAmount: 1,
  provider: 'x',
  qrisPayload: '000201...',
  qrisKind: 'static_injected',
  expiresAt: new Date(Date.now() + 15 * 60000),
  ...over,
});

test('data tersimpan terkompresi di remote dan bertahan setelah "cold start"', async () => {
  assert.equal(remote.enabled(), true);
  await invoices.insert(base());
  assert.ok(String(store.get('zeetasi-pay:db')).startsWith('gz:'));
  assert.equal(db.mode(), 'remote');

  // Cold start: memori & berkas lokal hilang.
  fs.rmSync(process.env.DATABASE_FILE);
  db._reset();
  const found = await invoices.getByOrderId('R-1');
  assert.equal(found.amount, 1);
});

test('dua instance menulis bersamaan: konflik dicoba ulang, tidak ada data hilang', async () => {
  // Instance B disimulasikan lewat penulisan langsung ke "Redis" di tengah transaksi A.
  let injected = false;
  const orig = remote.save;
  remote.save = async (expected, next, data) => {
    if (!injected) {
      injected = true;
      const snap = await remote.load();
      snap.data.invoices.push({ id: 'from-b', order_id: 'B-1', amount: 5, unique_code: 0, payable_amount: 5, currency: 'IDR', status: 'PAID', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), qris_payload: null });
      await orig(snap.rev, remote.newRev(), snap.data);
    }
    return orig(expected, next, data);
  };
  try {
    await invoices.insert(base({ orderId: 'A-1', amount: 2, payableAmount: 2 }));
  } finally {
    remote.save = orig;
  }
  const ids = (await db.read((d) => d.invoices.map((i) => i.order_id))).sort();
  assert.deepEqual(ids, ['A-1', 'B-1', 'R-1']);
});

test('compact membuang payload QR invoice yang sudah selesai tetapi tidak menghapus invoice lunas', async () => {
  const inv = await invoices.insert(base({ orderId: 'R-9', amount: 9, payableAmount: 9 }));
  await invoices.markPaid(inv.id, { id: 'TX-9', amount: 9, currency: 'IDR' }, 'poll');
  const row = await invoices.getById(inv.id);
  assert.equal(row.status, 'PAID');
  assert.equal(row.qris_payload, null);
});

test('error remote tidak membocorkan token', async () => {
  const orig = remote.transport.send;
  remote.transport.send = async () => {
    throw new Error('Penyimpanan remote menolak permintaan (HTTP 401).');
  };
  try {
    await assert.rejects(invoices.insert(base({ orderId: 'R-X', amount: 3, payableAmount: 3 })), (e) => !/fake_token_value/.test(e.message));
  } finally {
    remote.transport.send = orig;
  }
});
