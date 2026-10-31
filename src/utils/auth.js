'use strict';

/**
 * Login dashboard: cookie sesi bertanda tangan HMAC (tanpa state di server, cocok untuk Vercel).
 *
 * - Token = base64url(JSON{u, exp, n}) + "." + HMAC-SHA256.
 * - Kunci tanda tangan diturunkan dari SESSION_SECRET (atau API_KEY) DAN password,
 *   sehingga mengganti password otomatis mencabut semua sesi yang sedang aktif.
 * - Perbandingan kredensial memakai hash + timingSafeEqual.
 */

const crypto = require('crypto');
const config = require('../config');

const COOKIE_NAME = 'zp_session';

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signingKey() {
  const base = config.dashboard.secret || `dashboard:${config.apiKey}`;
  return crypto.createHmac('sha256', base).update(`pw:${config.dashboard.pass}`).digest();
}

function mac(body) {
  return crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
}

function checkCredentials(user, pass) {
  // Kedua perbandingan selalu dijalankan agar waktu respons tidak membocorkan mana yang salah.
  const okUser = safeEqual(typeof user === 'string' ? user : '', config.dashboard.user);
  const okPass = safeEqual(typeof pass === 'string' ? pass : '', config.dashboard.pass);
  return okUser && okPass;
}

function issueToken(user, ttlMs = config.dashboard.sessionHours * 3600 * 1000) {
  const body = b64url(JSON.stringify({ u: user, exp: Date.now() + ttlMs, n: crypto.randomBytes(6).toString('hex') }));
  return `${body}.${mac(body)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = mac(body);
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  if (payload.u !== config.dashboard.user) return null;
  return { user: payload.u, expiresAt: new Date(payload.exp) };
}

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

function sessionFromRequest(req) {
  return verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function cookieAttrs(req, maxAgeSec) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

function setSessionCookie(req, res, token) {
  res.append('Set-Cookie', `${COOKIE_NAME}=${token}; ${cookieAttrs(req, config.dashboard.sessionHours * 3600)}`);
}

function clearSessionCookie(req, res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttrs(req, 0)}`);
}

module.exports = {
  COOKIE_NAME,
  checkCredentials,
  issueToken,
  verifyToken,
  parseCookies,
  sessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
};
