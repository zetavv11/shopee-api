'use strict';

/**
 * Statistik untuk dashboard. Semua perhitungan dibaca dari database lokal gateway.
 * Hari dihitung menurut WIB (UTC+7). "Total masuk" = jumlah payable_amount invoice PAID
 * (nominal yang benar-benar dibayar pelanggan, termasuk kode unik bila ada).
 */

const db = require('../database/db');
const config = require('../config');

const DAY = 24 * 3600 * 1000;
const WIB = 7 * 3600 * 1000;
const ts = (v) => new Date(v).getTime();
const dayKey = (t) => new Date(t + WIB).toISOString().slice(0, 10);
const hourOf = (t) => new Date(t + WIB).getUTCHours();

const BUCKETS = [
  { label: '≤ 10rb', max: 10000 },
  { label: '10–50rb', max: 50000 },
  { label: '50–100rb', max: 100000 },
  { label: '100–500rb', max: 500000 },
  { label: '500rb–1jt', max: 1000000 },
  { label: '> 1jt', max: Infinity },
];

function isLivePending(i, now) {
  return i.status === 'PENDING' && ts(i.expires_at) + config.invoiceGraceMinutes * 60000 >= now;
}

function brief(i) {
  return {
    invoice_id: i.id,
    order_id: i.order_id,
    amount: Number(i.amount),
    unique_code: i.unique_code || 0,
    payable_amount: Number(i.payable_amount),
    status: i.status,
    created_at: i.created_at,
    paid_at: i.paid_at,
    expires_at: i.expires_at,
  };
}

function pct(now, before) {
  if (!before) return now > 0 ? null : 0; // null = tidak terhingga (dari nol)
  return Math.round(((now - before) / before) * 1000) / 10;
}

async function overview({ days = 30, now = Date.now() } = {}) {
  days = Math.max(1, Math.min(Number(days) || 30, 365));
  return db.read((d) => {
    const rows = d.invoices;
    const startKey = dayKey(now - (days - 1) * DAY);
    const todayKey = dayKey(now);
    const yesterdayKey = dayKey(now - DAY);

    const series = [];
    const index = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKey(now - i * DAY);
      const row = { date: key, paid_amount: 0, paid_count: 0, created: 0, expired: 0 };
      index.set(key, row);
      series.push(row);
    }

    const status = { PAID: 0, PENDING: 0, EXPIRED: 0, FAILED: 0 };
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, amount: 0 }));
    const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    let paidSum = 0;
    let paidCount = 0;
    let biggest = 0;
    let payMsTotal = 0;
    let payMsN = 0;
    let pendingNow = 0;
    let allTimePaid = 0;
    let allTimeCount = 0;
    let uniqueCodeSum = 0;

    for (const i of rows) {
      const payable = Number(i.payable_amount);
      if (i.status === 'PAID') {
        allTimePaid += payable;
        allTimeCount++;
      }
      if (isLivePending(i, now)) pendingNow++;

      const createdKey = dayKey(ts(i.created_at));
      if (createdKey >= startKey && createdKey <= todayKey) {
        status[i.status] = (status[i.status] || 0) + 1;
        const s = index.get(createdKey);
        if (s) {
          s.created++;
          if (i.status === 'EXPIRED' || i.status === 'FAILED') s.expired++;
        }
      }

      if (i.status === 'PAID' && i.paid_at) {
        const paidKey = dayKey(ts(i.paid_at));
        if (paidKey >= startKey && paidKey <= todayKey) {
          const s = index.get(paidKey);
          if (s) {
            s.paid_amount += payable;
            s.paid_count++;
          }
          paidSum += payable;
          paidCount++;
          uniqueCodeSum += Number(i.unique_code || 0);
          if (payable > biggest) biggest = payable;
          const h = hours[hourOf(ts(i.paid_at))];
          h.count++;
          h.amount += payable;
          const bi = BUCKETS.findIndex((b) => payable <= b.max);
          buckets[bi].count++;
          const took = ts(i.paid_at) - ts(i.created_at);
          if (took >= 0) {
            payMsTotal += took;
            payMsN++;
          }
        }
      }
    }

    const resolved = status.PAID + status.EXPIRED + status.FAILED;
    const today = index.get(todayKey) || { paid_amount: 0, paid_count: 0 };
    const yesterday = index.get(yesterdayKey) || { paid_amount: 0, paid_count: 0 };
    const recent = [...rows].sort((a, b) => ts(b.created_at) - ts(a.created_at)).slice(0, 8).map(brief);

    return {
      range_days: days,
      generated_at: new Date(now).toISOString(),
      totals: {
        paid_amount: paidSum,
        paid_count: paidCount,
        created_count: status.PAID + status.PENDING + status.EXPIRED + status.FAILED,
        success_rate: resolved ? Math.round((status.PAID / resolved) * 1000) / 10 : null,
        average_ticket: paidCount ? Math.round(paidSum / paidCount) : 0,
        biggest_ticket: biggest,
        avg_pay_seconds: payMsN ? Math.round(payMsTotal / payMsN / 1000) : null,
        unique_code_total: uniqueCodeSum,
        pending_now: pendingNow,
        all_time_paid_amount: allTimePaid,
        all_time_paid_count: allTimeCount,
      },
      today: {
        paid_amount: today.paid_amount,
        paid_count: today.paid_count,
        vs_yesterday_amount: pct(today.paid_amount, yesterday.paid_amount),
        vs_yesterday_count: pct(today.paid_count, yesterday.paid_count),
      },
      status,
      series,
      hours,
      amount_buckets: buckets,
      recent,
    };
  });
}

/** Pencarian transaksi untuk tabel dashboard. q cocok ke order_id, nominal, id invoice, atau id transaksi provider. */
async function search({ status, q, from, to, page = 1, limit = 20 } = {}) {
  const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const digits = needle.replace(/[.\s,]/g, '');
  return db.read((d) => {
    const rows = d.invoices
      .filter((i) => {
        if (status && i.status !== status) return false;
        if (from && ts(i.created_at) < from.getTime()) return false;
        if (to && ts(i.created_at) >= to.getTime()) return false;
        if (needle) {
          const hit =
            i.order_id.toLowerCase().includes(needle) ||
            i.id.toLowerCase().startsWith(needle) ||
            (i.provider_txn_id && String(i.provider_txn_id).toLowerCase().includes(needle)) ||
            (/^\d+$/.test(digits) && (String(i.amount).includes(digits) || String(i.payable_amount).includes(digits)));
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => ts(b.created_at) - ts(a.created_at) || (a.id < b.id ? -1 : 1));

    const paid = rows.filter((i) => i.status === 'PAID');
    return {
      items: rows.slice((page - 1) * limit, page * limit).map(brief),
      total: rows.length,
      paid_count: paid.length,
      paid_amount: paid.reduce((s, i) => s + Number(i.payable_amount), 0),
    };
  });
}

// Mencegah CSV/formula injection saat dibuka di Excel/Sheets: nilai berawalan = + - @ diberi tanda petik.
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(items) {
  const head = ['dibuat_wib', 'order_id', 'nominal', 'kode_unik', 'total_bayar', 'status', 'dibayar_wib', 'invoice_id'];
  const wib = (v) => (v ? new Date(ts(v) + WIB).toISOString().replace('T', ' ').slice(0, 19) : '');
  const lines = [head.join(',')];
  for (const i of items) {
    lines.push(
      [wib(i.created_at), i.order_id, i.amount, i.unique_code, i.payable_amount, i.status, wib(i.paid_at), i.invoice_id].map(csvCell).join(',')
    );
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

module.exports = { overview, search, toCsv, brief, dayKey };
