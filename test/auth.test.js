'use strict';

process.env.API_KEY = 'test_api_key_1234567890';
process.env.DASH_USER = 'zeetasi';
process.env.DASH_PASS = 'zeetasi@124';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/utils/auth');

test('kredensial benar diterima, salah ditolak', () => {
  assert.equal(auth.checkCredentials('zeetasi', 'zeetasi@124'), true);
  assert.equal(auth.checkCredentials('zeetasi', 'zeetasi@125'), false);
  assert.equal(auth.checkCredentials('admin', 'zeetasi@124'), false);
  assert.equal(auth.checkCredentials(undefined, null), false);
  assert.equal(auth.checkCredentials({ $ne: 1 }, ['x']), false);
});

test('token sesi valid lolos, dimanipulasi atau kedaluwarsa ditolak', () => {
  const t = auth.issueToken('zeetasi');
  assert.equal(auth.verifyToken(t).user, 'zeetasi');

  const [body, sig] = t.split('.');
  assert.equal(auth.verifyToken(`${body}.${sig.slice(0, -2)}xx`), null);
  const forged = Buffer.from(JSON.stringify({ u: 'zeetasi', exp: Date.now() + 1e9, n: 'x' })).toString('base64url');
  assert.equal(auth.verifyToken(`${forged}.${sig}`), null);
  assert.equal(auth.verifyToken(auth.issueToken('zeetasi', -1000)), null);
  assert.equal(auth.verifyToken(''), null);
  assert.equal(auth.verifyToken('abc'), null);
  assert.equal(auth.verifyToken('x'.repeat(2000)), null);
});

test('parseCookies membaca beberapa cookie dan mengabaikan sampah', () => {
  const c = auth.parseCookies('a=1; zp_session=abc.def; ; =x; b=2=3');
  assert.equal(c.a, '1');
  assert.equal(c.zp_session, 'abc.def');
  assert.equal(c.b, '2=3');
  assert.deepEqual(auth.parseCookies(undefined), {});
});
