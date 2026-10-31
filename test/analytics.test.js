'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-'));
process.env.DATABASE_FILE = path.join(tmp, 'database.json');
process.env.API_KEY = 'test_api_key_1234567890';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/database/db');
const analytics = require('../src/services/analytics');

const NOW = Date.parse('2026-10-31T05:00:00Z'); // 12:00 WIB
const iso = (ms) => new Date(ms).toISOString();

function inv(id, orderId, amount, status, createdMs, paidMs, uniqueCode = 0) {
  return {
    id,
    order_id: orderId,
    amount,
    unique_code: uniqueCode,
    payable_amount: amount + uniqueCode,
    currency: 'IDR',
    status,
    provider: 'x',
    provider_txn_id: paidMs ? `TX-${id}` : null,
    qris_payload: null,
    qris_kind: 'static_injected',
    expires_at: iso(createdMs + 15 * 60000),
    paid_at: paidMs ? iso(paidMs) : null,
    created_at: iso(createdMs),
    updated_at: iso(paidMs || createdMs),
  };
}

test.before(async () => {
  await db.transaction((d) => {
    // Hari ini 11:00 WIB lunas Rp1 (nominal minimum) dan Rp10.000.000 (maksimum).
    d.invoices.push(inv('a1', 'A-1', 1, 'PAID', NOW - 3600e3, NOW - 3500e3));
    d.invoices.push(inv('a2', 'A-2', 10000000, 'PAID', NOW - 3600e3 - 5, NOW - 3400e3));
    d.invoices.push(inv('a3', 'A-3', 25000, 'PAID', NOW - 86400e3, NOW - 86400e3 + 120e3, 7)); // kemarin
    d.invoices.push(inv('a4', 'A-4', 5000, 'EXPIRED', NOW - 2 * 86400e3, null));
    d.invoices.push(inv('a5', 'A-5', 5000, 'FAILED', NOW - 2 * 86400e3, null));
    d.invoices.push(inv('a6', '=cmd|x', 7000, 'PAID', NOW - 40 * 86400e3, NOW - 40 * 86400e3 + 60e3)); // di luar rentang 30 hari
  });
});

test('overview: total, rata-rata, rasio sukses, dan bucket nominal', async () => {
  const o = await analytics.overview({ days: 30, now: NOW });
  assert.equal(o.series.length, 30);
  assert.equal(o.totals.paid_count, 3);
  assert.equal(o.totals.paid_amount, 1 + 10000000 + 25007);
  assert.equal(o.totals.biggest_ticket, 10000000);
  assert.equal(o.totals.unique_code_total, 7);
  assert.equal(o.totals.all_time_paid_count, 4);
  assert.equal(o.totals.success_rate, 60); // 3 lunas dari (3 lunas + 1 kedaluwarsa + 1 gagal)
});

test('overview: hari ini vs kemarin dan jam ramai WIB', async () => {
  const o = await analytics.overview({ days: 7, now: NOW });
  assert.equal(o.today.paid_count, 2);
  assert.equal(o.today.paid_amount, 10000001);
  assert.equal(o.today.vs_yesterday_count, 100); // 2 vs 1
  assert.equal(o.hours[11].count, 2); // 11:xx WIB
  assert.equal(o.amount_buckets[0].count, 1); // Rp1 masuk bucket ≤ 10rb
  assert.equal(o.amount_buckets[5].count, 1); // Rp10jt masuk bucket > 1jt
});

test('search: cari order_id, nominal berformat, dan filter status', async () => {
  assert.equal((await analytics.search({ q: 'a-3' })).total, 1);
  assert.equal((await analytics.search({ q: '10.000.000' })).total, 1);
  assert.equal((await analytics.search({ status: 'EXPIRED' })).total, 1);
  const all = await analytics.search({ page: 1, limit: 2 });
  assert.equal(all.items.length, 2);
  assert.equal(all.total, 6);
});

test('toCsv menetralkan formula injection dan meng-escape koma/kutip', () => {
  const csv = analytics.toCsv([
    { created_at: iso(NOW), order_id: '=cmd|x', amount: 1, unique_code: 0, payable_amount: 1, status: 'PAID', paid_at: iso(NOW), invoice_id: 'i,d"1' },
  ]);
  assert.ok(csv.includes("'=cmd|x"));
  assert.ok(csv.includes('"i,d""1"'));
  assert.ok(csv.startsWith('\ufeffdibuat_wib,'));
});
