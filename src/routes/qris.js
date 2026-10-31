'use strict';

const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');
const apiKey = require('../middleware/apiKey');
const invoices = require('../services/invoices');
const issuer = require('../services/qrisIssuer');
const paymentCheck = require('../services/paymentCheck');
const { AppError, asyncHandler } = require('../utils/errors');
const { validateAmount, validateOrderId, validateUuid } = require('../utils/validate');

const router = express.Router();

function baseUrl(req) {
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
}

router.post(
  '/create-qris',
  apiKey,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const amount = validateAmount(body.amount);
    const orderId = validateOrderId(body.order_id);

    const row = await issuer.issue({ amount, orderId });
    res.status(201).json({
      success: true,
      data: invoices.serialize(row, {
        includePayload: true,
        qrisUrl: `${baseUrl(req)}/qr/${row.id}`,
        payUrl: `${baseUrl(req)}/pay/${row.id}`,
      }),
    });
  })
);

router.post(
  '/check-payment',
  apiKey,
  asyncHandler(async (req, res) => {
    const orderId = validateOrderId(req.body && req.body.order_id);
    const tokenHeader = req.get('x-shopee-token');
    const token =
      tokenHeader && tokenHeader.length >= 10 && tokenHeader.length <= 4000 && !/\s/.test(tokenHeader) ? tokenHeader : undefined;
    res.json(await paymentCheck.checkOrder(orderId, { token }));
  })
);

// Publik: gambar QR untuk pelanggan. ID berupa UUID acak (tidak bisa ditebak).
router.get(
  '/qr/:id',
  asyncHandler(async (req, res) => {
    if (!validateUuid(req.params.id)) throw new AppError(404, 'NOT_FOUND', 'QR tidak ditemukan.');
    const inv = await invoices.getById(req.params.id);
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'QR tidak ditemukan.');
    if (inv.status !== 'PENDING' || new Date(inv.expires_at) < new Date() || !inv.qris_payload) {
      throw new AppError(410, 'INVOICE_INACTIVE', 'Invoice sudah tidak aktif.');
    }
    const png = await QRCode.toBuffer(inv.qris_payload, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(png);
  })
);

module.exports = router;
