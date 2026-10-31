'use strict';

process.env.API_KEY = 'test_api_key_1234567890';
process.env.UNIQUE_CODE_MAX = '99';
process.env.UNIQUE_CODE_MIN_AMOUNT = '1000';
process.env.MAX_AMOUNT = '10000000';

const test = require('node:test');
const assert = require('node:assert/strict');
const { uniqueCodeLimit } = require('../src/services/qrisIssuer');
const { validateAmount } = require('../src/utils/validate');
const { AppError } = require('../src/utils/errors');

test('rentang nominal bawaan: Rp1 sampai Rp10.000.000', () => {
  assert.equal(validateAmount(1), 1);
  assert.equal(validateAmount(10000000), 10000000);
  for (const bad of [0, -5, 10000001, 1.5, '1000', null, NaN]) {
    assert.throws(() => validateAmount(bad), AppError);
  }
});

test('kode unik tidak dipakai untuk nominal kecil dan tak pernah melewati batas maksimum', () => {
  assert.equal(uniqueCodeLimit(1), 0);
  assert.equal(uniqueCodeLimit(999), 0);
  assert.equal(uniqueCodeLimit(1000), 99);
  assert.equal(uniqueCodeLimit(9999990), 10);
  assert.equal(uniqueCodeLimit(10000000), 0);
});
