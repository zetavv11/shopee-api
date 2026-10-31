'use strict';

const config = require('../config');
const { AppError } = require('../utils/errors');
const { sessionFromRequest } = require('../utils/auth');

/** Halaman HTML: belum login -> arahkan ke /login (membawa tujuan semula). */
function requirePage(req, res, next) {
  if (!config.dashboard.enabled) return next(new AppError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));
  const session = sessionFromRequest(req);
  if (session) {
    req.dashUser = session.user;
    return next();
  }
  const target = req.originalUrl.split('?')[0];
  const to = target && target !== '/dashboard' ? `?next=${encodeURIComponent(target)}` : '';
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, `/login${to}`);
}

/** API dashboard: JSON 401 + proteksi CSRF dasar untuk metode yang mengubah data. */
function requireApi(req, res, next) {
  if (!config.dashboard.enabled) return next(new AppError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));
  const session = sessionFromRequest(req);
  if (!session) return next(new AppError(401, 'LOGIN_REQUIRED', 'Sesi login berakhir. Silakan login lagi.'));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch (_) {
        /* origin tidak valid */
      }
      if (host !== req.get('host')) return next(new AppError(403, 'BAD_ORIGIN', 'Origin request tidak diizinkan.'));
    }
  }
  req.dashUser = session.user;
  res.set('Cache-Control', 'no-store');
  return next();
}

module.exports = { requirePage, requireApi };
