'use strict';

/**
 * Dashboard pribadi + docs + halaman bayar.
 *   Publik : GET /docs, GET /pay/:id, GET /pay/:id/status, GET /assets/*, GET /login
 *   Login  : GET /dashboard, /admin/api/*   (cookie sesi bertanda tangan)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const pkg = require('../../package.json');
const db = require('../database/db');
const provider = require('../services/paymentProvider');
const invoices = require('../services/invoices');
const analytics = require('../services/analytics');
const callbacks = require('../services/callbacks');
const watcher = require('../services/watcher');
const issuer = require('../services/qrisIssuer');
const paymentCheck = require('../services/paymentCheck');
const pages = require('../ui/pages');
const auth = require('../utils/auth');
const { requirePage, requireApi } = require('../middleware/dashAuth');
const { AppError, asyncHandler } = require('../utils/errors');
const { validateAmount, validateUuid, parsePagination, parseStatus, parseDateParam } = require('../utils/validate');

const router = express.Router();

const baseUrl = (req) => config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
const limitsInfo = () => ({
  min: config.minAmount,
  max: config.maxAmount,
  ttl_minutes: config.invoiceTtlMinutes,
  grace_minutes: config.invoiceGraceMinutes,
  unique_code_max: config.uniqueCodeMax,
  unique_code_min_amount: config.uniqueCodeMinAmount,
  rate_limit: config.rateLimitPerMin,
});

function html(res, body, cache = 'no-store') {
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache });
  res.send(body);
}

// ---------------------------------------------------------------- aset statis
router.get('/assets/:name', (req, res, next) => {
  const a = pages.assets[req.params.name];
  if (!a) return next(new AppError(404, 'NOT_FOUND', 'Berkas tidak ditemukan.'));
  if (req.get('if-none-match') === a.etag) return res.status(304).end();
  res.set({ 'Content-Type': a.type, ETag: a.etag, 'Cache-Control': 'public, max-age=300, must-revalidate' });
  return res.send(a.body);
});

// ---------------------------------------------------------------- beranda & login
router.get('/', (req, res) => res.redirect(302, config.dashboard.enabled ? '/dashboard' : '/docs'));

router.get('/login', (req, res, next) => {
  if (!config.dashboard.enabled) return next(new AppError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));
  if (auth.sessionFromRequest(req)) return res.redirect(302, '/dashboard');
  return html(res, pages.loginPage({ brand: config.brandName }));
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' } },
});

router.post('/login', loginLimiter, (req, res, next) => {
  if (!config.dashboard.enabled) return next(new AppError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));
  const body = req.body || {};
  if (!auth.checkCredentials(body.username, body.password)) {
    return setTimeout(() => next(new AppError(401, 'INVALID_CREDENTIALS', 'Username atau password salah.')), 350);
  }
  auth.setSessionCookie(req, res, auth.issueToken(config.dashboard.user));
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true });
});

function logout(req, res) {
  auth.clearSessionCookie(req, res);
  res.set('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.redirect(302, '/login');
  return res.json({ success: true });
}
router.post('/logout', logout);
router.get('/logout', logout);

router.get('/dashboard', requirePage, (req, res) => {
  html(res, pages.dashboardPage({ brand: config.brandName, user: req.dashUser, limits: limitsInfo() }));
});

// ---------------------------------------------------------------- docs publik
router.get('/docs', (req, res) => {
  html(res, pages.docsPage({ brand: config.brandName, base: baseUrl(req), limits: limitsInfo() }), 'public, max-age=60');
});

// ---------------------------------------------------------------- halaman bayar publik
router.get(
  '/pay/:id',
  asyncHandler(async (req, res) => {
    const inv = validateUuid(req.params.id) ? await invoices.getById(req.params.id) : null;
    if (!inv) {
      res.status(404);
      return html(res, pages.payNotFoundPage({ brand: config.brandName }));
    }
    return html(res, pages.payPage({ brand: config.brandName, inv }));
  })
);

router.get(
  '/pay/:id/status',
  asyncHandler(async (req, res) => {
    if (!validateUuid(req.params.id)) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    await invoices.expireStale();
    let inv = await invoices.getById(req.params.id);
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    if (inv.status === 'PENDING') {
      // Halaman bayar yang terbuka ikut memicu pengecekan (dibatasi per invoice) — berguna di Vercel yang tanpa worker.
      try {
        await paymentCheck.checkOrder(inv.order_id);
      } catch (_) {
        /* gangguan provider tidak boleh merusak halaman pelanggan */
      }
      inv = (await invoices.getById(req.params.id)) || inv;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ status: inv.status, paid_at: inv.paid_at });
  })
);

// ---------------------------------------------------------------- API dashboard
const admin = express.Router();
admin.use(requireApi);

admin.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const days = [7, 14, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    res.json({ success: true, data: await analytics.overview({ days }) });
  })
);

function txFilters(req, { maxLimit }) {
  const { page, limit } = parsePagination(req.query, { defaultLimit: 15, maxLimit });
  return {
    page,
    limit,
    status: parseStatus(req.query.status),
    q: typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '',
    from: parseDateParam(req.query.from, 'from'),
    to: parseDateParam(req.query.to, 'to', { isEnd: true }),
  };
}

admin.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await analytics.search(txFilters(req, { maxLimit: 100 })) });
  })
);

admin.get(
  '/transactions.csv',
  asyncHandler(async (req, res) => {
    const r = await analytics.search(txFilters(req, { maxLimit: 5000 }));
    const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="transaksi-${stamp}.csv"` });
    res.send(analytics.toCsv(r.items));
  })
);

admin.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    if (!validateUuid(req.params.id)) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    const inv = await invoices.getById(req.params.id);
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    res.json({ success: true, data: { invoice: invoices.serialize(inv), events: await invoices.eventsFor(inv.id) } });
  })
);

admin.post(
  '/invoices/:id/cancel',
  asyncHandler(async (req, res) => {
    if (!validateUuid(req.params.id)) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    const r = await invoices.cancel(req.params.id);
    if (r.result === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    if (r.result === 'NOT_PENDING') throw new AppError(409, 'NOT_PENDING', `Invoice berstatus ${r.invoice.status}, tidak bisa dibatalkan.`);
    res.json({ success: true, data: invoices.serialize(r.invoice) });
  })
);

admin.post(
  '/invoices/:id/check',
  asyncHandler(async (req, res) => {
    if (!validateUuid(req.params.id)) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    const inv = await invoices.getById(req.params.id);
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
    try {
      const r = await paymentCheck.checkOrder(inv.order_id);
      return res.json({ success: true, data: { status: r.status, paid: r.paid } });
    } catch (err) {
      const fresh = (await invoices.getById(inv.id)) || inv;
      return res.json({ success: true, data: { status: fresh.status, paid: fresh.status === 'PAID', warning: err.code || 'CHECK_FAILED' } });
    }
  })
);

admin.post(
  '/test-qris',
  asyncHandler(async (req, res) => {
    const amount = validateAmount((req.body || {}).amount);
    const orderId = `TEST-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`;
    const row = await issuer.issue({ amount, orderId });
    res.status(201).json({ success: true, data: invoices.serialize(row) });
  })
);

admin.get(
  '/system',
  asyncHandler(async (req, res) => {
    const caps = provider.capabilities();
    const [cbPending, cbFailed, count] = await Promise.all([
      callbacks.list({ status: 'PENDING', page: 1, limit: 1 }).catch(() => ({ total: 0 })),
      callbacks.list({ status: 'FAILED', page: 1, limit: 1 }).catch(() => ({ total: 0 })),
      db.read((d) => d.invoices.length),
    ]);
    res.json({
      success: true,
      data: {
        version: pkg.version,
        node: process.version,
        vercel: config.isVercel,
        can_create: caps.canCreateInvoice,
        can_check: caps.canCheckPayment,
        qris_kind: 'static_injected',
        session: provider.sessionInfo(),
        limits: limitsInfo(),
        callback: callbacks.enabled(),
        callbacks: { pending: cbPending.total, failed: cbFailed.total },
        storage: db.mode(),
        invoice_count: count,
        watcher_active: watcher.isActive(),
        default_login: !process.env.DASH_USER || !process.env.DASH_PASS,
      },
    });
  })
);

admin.post(
  '/system/test-session',
  asyncHandler(async (req, res) => {
    const r = await provider.validateCredentials({});
    res.json({ success: true, data: { state: r.state, message: r.message, checked_at: r.checkedAt } });
  })
);

admin.post(
  '/system/session',
  asyncHandler(async (req, res) => {
    const curl = req.body && req.body.curl;
    if (typeof curl !== 'string' || curl.length < 20 || curl.length > 60000) {
      throw new AppError(400, 'INVALID_SESSION', 'Tempel hasil "Copy as cURL (bash)" yang lengkap.');
    }
    let applied;
    try {
      applied = provider.setSession({ curl });
    } catch (err) {
      if (err instanceof provider.ProviderError) throw err;
      throw new AppError(400, 'INVALID_SESSION', err.message);
    }
    res.json({ success: true, data: applied });
  })
);

router.use('/admin/api', admin);

module.exports = router;
