const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { tenantSaveError } = loadTs('lib/tenantSaveError.ts');

test('missing rent/deposit columns give an actionable migration error', () => {
  for (const code of ['42703', 'PGRST204']) {
    for (const column of ['base_rent', 'deposit_amount']) {
      const result = tenantSaveError({ code, message: `column tenants.${column} does not exist` }, 'Save failed');
      assert.equal(result.status, 503);
      assert.match(result.error, /tenant-rent-deposit.sql/);
    }
  }
});

test('unrelated errors retain the fallback without exposing database details', () => {
  for (const error of [null, new Error('private details'), { code: '23505', message: 'private details' }]) {
    assert.deepEqual(tenantSaveError(error, 'Save failed'), { error: 'Save failed', status: 500 });
  }
});
