const test = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { loadTs } = require('./helpers/load-ts.cjs');

test('keepalive authentication, safe responses, and cancellation', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'info', () => {});
  const originalSecret = process.env.CRON_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });
  let calls = 0;
  let outcome = 'success';
  let controller;
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    assert.equal(ms, 10_000);
    controller = new AbortController();
    return controller.signal;
  });
  const { GET, dynamic } = loadTs('app/api/keepalive/route.ts', {
    '@/lib/supabaseServer': { supabaseAdmin: { from(table) {
      calls++;
      assert.equal(table, 'properties');
      return { select(column, options) {
        assert.equal(column, 'id');
        assert.deepEqual(options, { head: true });
        return { limit(limit) {
          assert.equal(limit, 1);
          return { async abortSignal(signal) {
            assert.equal(signal, controller.signal);
            if (outcome === 'timeout') {
              controller.abort();
              return { error: { message: 'sensitive timeout details' } };
            }
            if (outcome === 'throw') throw new Error('sensitive transport details');
            return { error: outcome === 'database-error' ? { message: 'sensitive database details' } : null };
          } };
        } };
      } };
    } } },
  });
  assert.equal(dynamic, 'force-dynamic');
  function request(auth) {
    return new NextRequest('http://localhost/api/keepalive', { headers: auth ? { authorization: auth } : {} });
  }
  for (const secret of [undefined, '', '   ']) {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    assert.equal((await GET(request('Bearer undefined'))).status, 503);
  }
  process.env.CRON_SECRET = 'test-only-secret';
  for (const auth of [undefined, 'Bearer wrong', 'Basic test-only-secret', 'Bearer test-only-secret-extra']) {
    assert.equal((await GET(request(auth))).status, 401);
  }
  assert.equal(calls, 0, 'failed authentication must not query the database');
  for (const [mode, status] of [['success', 200], ['database-error', 500], ['throw', 500], ['timeout', 504]]) {
    outcome = mode;
    const response = await GET(request('Bearer test-only-secret'));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.ok, status === 200);
    assert.ok(Number.isFinite(Date.parse(body.at)));
    assert.doesNotMatch(JSON.stringify(body), /sensitive|test-only-secret/);
  }
});
