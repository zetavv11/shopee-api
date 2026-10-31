'use strict';

/**
 * Pengecekan status pembayaran satu order. Dipakai POST /check-payment (API) dan dashboard.
 * Mengembalikan objek respons JSON yang sama persis dengan yang dulu dibuat di route.
 */

const config = require('../config');
const provider = require('./paymentProvider');
const invoices = require('./invoices');
const telegram = require('./telegram');
const watcher = require('./watcher');
const callbacks = require('./callbacks');
const { ProviderError } = provider;
const { AppError } = require('../utils/errors');

const lastCheck = new Map();

function paidResponse(inv) {
  return {
    success: true,
    paid: true,
    status: 'PAID',
    order_id: inv.order_id,
    transaction: { transaction_id: inv.provider_txn_id, amount: Number(inv.payable_amount), paid_at: inv.paid_at },
    data: invoices.serialize(inv),
  };
}

function pending(inv, extra = {}) {
  return { success: true, paid: false, status: 'PENDING', ...extra, order_id: inv.order_id, data: invoices.serialize(inv) };
}

async function checkOrder(orderId, { token } = {}) {
  await invoices.expireStale();
  const inv = await invoices.getByOrderId(orderId);
  if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');

  if (inv.status === 'PAID') return paidResponse(inv);
  if (inv.status !== 'PENDING') {
    return { success: true, paid: false, status: inv.status, order_id: inv.order_id, data: invoices.serialize(inv) };
  }

  // Watcher otomatis sehat: cukup baca database, tidak perlu menembak provider lagi.
  if (watcher.isActive()) return pending(inv, { watched: true });

  // Lindungi token dari polling berlebihan.
  const last = lastCheck.get(inv.id) || 0;
  if (Date.now() - last < config.minCheckIntervalMs) return pending(inv, { throttled: true });
  if (lastCheck.size > 5000) lastCheck.clear();
  lastCheck.set(inv.id, Date.now());

  let status;
  try {
    status = await provider.getPaymentStatus({
      orderId,
      providerInvoiceId: inv.provider_invoice_id,
      invoice: inv,
      token,
    });
  } catch (err) {
    if (err instanceof ProviderError && err.code !== 'NOT_CONFIGURED') {
      await telegram.notifyIntegrationError(err.code, err.message);
    }
    throw err;
  }

  for (const match of status.matches) {
    const r = await invoices.markPaid(
      inv.id,
      { id: match.id, amount: match.amount, currency: match.currency },
      'poll',
      { issuer: match.issuer, provider_time: match.time }
    );
    if (r.result === 'PAID') {
      await telegram.notifyPaymentVerified(r.invoice, { id: match.id, issuer: match.issuer });
      await callbacks.kick();
      return paidResponse(r.invoice);
    }
    if (r.result === 'ALREADY_PAID') return paidResponse(r.invoice);
    if (r.result === 'TXN_ALREADY_CLAIMED') continue;
    break;
  }

  return pending(inv);
}

module.exports = { checkOrder };
