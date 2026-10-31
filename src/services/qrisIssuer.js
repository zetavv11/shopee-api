'use strict';

/**
 * Penerbitan invoice QRIS. Dipakai bersama oleh POST /create-qris (API) dan menu "Uji QRIS" di dashboard,
 * sehingga aturan nominal, kode unik, dan penanganan konflik selalu sama.
 */

const crypto = require('crypto');
const config = require('../config');
const provider = require('./paymentProvider');
const invoices = require('./invoices');
const telegram = require('./telegram');
const { ProviderError } = provider;
const { AppError } = require('../utils/errors');

/**
 * Batas kode unik untuk nominal tertentu:
 * - 0 (nonaktif) bila UNIQUE_CODE_MAX = 0 atau nominal di bawah UNIQUE_CODE_MIN_AMOUNT
 *   (supaya Rp1 tidak berubah menjadi Rp99),
 * - tidak pernah membuat total bayar melewati MAX_AMOUNT.
 */
function uniqueCodeLimit(amount) {
  if (config.uniqueCodeMax <= 0 || amount < config.uniqueCodeMinAmount) return 0;
  return Math.max(0, Math.min(config.uniqueCodeMax, config.maxAmount - amount));
}

async function issue({ amount, orderId }) {
  if (!provider.capabilities().canCreateInvoice) {
    throw new ProviderError('NOT_CONFIGURED', 'QRIS_STATIC belum dikonfigurasi, pembuatan QRIS dinonaktifkan.', 501);
  }

  await invoices.expireStale();

  if (config.replacePendingSameAmount && (await invoices.getByOrderId(orderId))) {
    throw new AppError(409, 'DUPLICATE_ORDER_ID', 'order_id sudah digunakan.');
  }

  const codeLimit = uniqueCodeLimit(amount);
  const attempts = codeLimit > 0 ? 8 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const uniqueCode = codeLimit > 0 ? 1 + crypto.randomInt(codeLimit) : 0;
    const payable = amount + uniqueCode;
    const issued = await provider.createInvoice({ amount: payable, orderId });

    if (config.replacePendingSameAmount) {
      await invoices.expirePendingByPayable(payable);
    }

    let row;
    try {
      row = await invoices.insert({
        orderId,
        amount,
        uniqueCode,
        payableAmount: payable,
        provider: provider.capabilities().provider,
        providerInvoiceId: issued.providerInvoiceId,
        qrisPayload: issued.qrisPayload,
        qrisKind: issued.qrisKind,
        expiresAt: issued.expiresAt,
      });
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'invoices_order_id_key') {
        throw new AppError(409, 'DUPLICATE_ORDER_ID', 'order_id sudah digunakan.');
      }
      if (err.code === '23505' && err.constraint === 'invoices_pending_payable_amount_uidx') {
        if (attempt < attempts - 1) continue;
        throw new AppError(
          409,
          'AMOUNT_IN_USE',
          'Masih ada invoice PENDING dengan nominal yang sama. Aktifkan UNIQUE_CODE_MAX atau gunakan nominal lain.'
        );
      }
      throw err;
    }

    await telegram.notifyInvoiceCreated(row);
    return row;
  }
  throw new AppError(409, 'AMOUNT_IN_USE', 'Tidak dapat mengalokasikan nominal unik, coba lagi.');
}

module.exports = { issue, uniqueCodeLimit };
