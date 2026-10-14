const test = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const { mockDb } = require('./helpers/mock-db.cjs');

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function layoutFixture(authed, fail = false) {
  let reads = 0;
  const secretData = { properties: [{ id: 'private-property' }], units: [], tenants: [{ name: 'PRIVATE TENANT' }], revenueEntries: [], expenseEntries: [] };
  function DataProvider() {}
  function DashboardShell() {}
  const layout = loadTs('app/layout.tsx', {
    './globals.css': {},
    'next/font/google': { Inter: () => ({ className: 'test' }) },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'test-session' }) }) },
    '@/lib/auth': { SESSION_COOKIE: 'ce_session', verifySessionToken: async () => authed },
    '@/lib/db': { getDashboardData: async () => { reads++; if (fail) throw new Error('Unavailable'); return secretData; } },
    '@/lib/DataContext': { DataProvider },
    '@/components/DashboardShell': { DashboardShell },
    '@/components/ThemeProvider': { ThemeProvider() {}, themeInitScript: '' },
    '@/components/Toast': { ToastProvider() {} },
  });
  return { layout: layout.default, get reads() { return reads; }, DataProvider, DashboardShell, secretData };
}

test('public login layout does not fetch or serialize private dashboard records', async () => {
  const host = layoutFixture(false);
  const tree = await host.layout({ children: 'login' });
  assert.equal(host.reads, 0);
  const value = find(tree, (node) => node.type === host.DataProvider).props.value;
  assert.ok(Object.values(value).every((rows) => rows.length === 0));
  assert.equal(JSON.stringify(tree).includes('PRIVATE TENANT'), false);
});

test('authenticated layout receives data, while database failure displays a load error', async () => {
  const host = layoutFixture(true);
  const tree = await host.layout({ children: 'dashboard' });
  assert.equal(host.reads, 1);
  assert.deepEqual(find(tree, (node) => node.type === host.DataProvider).props.value, host.secretData);
  const failed = layoutFixture(true, true);
  const log = console.error;
  console.error = () => {};
  try {
    const errorTree = await failed.layout({ children: 'dashboard' });
    assert.equal(find(errorTree, (node) => node.type === failed.DashboardShell).props.dataError, true);
  } finally { console.error = log; }
});

test('expired API sessions return JSON 401; pages still redirect and public endpoints remain available', async () => {
  const { proxy } = loadTs('proxy.ts', { '@/lib/auth': { SESSION_COOKIE: 'ce_session', verifySessionToken: async () => false } });
  const api = await proxy(new NextRequest('http://localhost/api/revenue'));
  assert.equal(api.status, 401);
  assert.match((await api.json()).error, /sign in/i);
  assert.equal((await proxy(new NextRequest('http://localhost/revenue'))).status, 307);
  assert.equal((await proxy(new NextRequest('http://localhost/login'))).status, 200);
  assert.equal((await proxy(new NextRequest('http://localhost/api/keepalive'))).status, 200);
  assert.equal((await proxy(new NextRequest('http://localhost/api/vault/properties'))).status, 200);
});

test('API paths with image extensions cannot bypass the session proxy', () => {
  const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
  const { config } = loadTs('proxy.ts', { '@/lib/auth': {} });
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/api/vault/images/property.png' }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/favicon.ico' }), false);
});

test('dashboard fetches every row even when PostgREST caps responses below requested page size', async () => {
  const initial = {};
  for (const table of ['properties', 'units', 'tenants', 'revenue', 'expenses']) {
    initial[table] = Array.from({ length: 1107 }, (_, i) => ({ id: `${table}-${String(i).padStart(4, '0')}`, name: 'same name', year: 2026, month: 10, rental_amount: '10', amount: '2' }));
  }
  const db = mockDb(initial, { cap: 113 });
  const result = await loadTs('lib/db.ts', db.mocks).getDashboardData();
  for (const rows of Object.values(result)) {
    assert.equal(rows.length, 1107);
    assert.equal(new Set(rows.map((row) => row.id)).size, 1107);
  }
  assert.equal(result.revenueEntries.reduce((sum, row) => sum + row.rental, 0), 11070);
  assert.ok(db.calls.every((call) => call.orders.at(-1)[0] === 'id'));
});

test('later-page retrieval failure rejects instead of returning misleading partial totals', async () => {
  const db = mockDb({ revenue: Array.from({ length: 600 }, (_, id) => ({ id })) }, { fail: (q) => q.range?.[0] > 0 });
  await assert.rejects(loadTs('lib/db.ts', db.mocks).getRevenue(), /Simulated/);
});

test('save/delete helpers reject redirected HTML and network failures and preserve warning responses', async () => {
  const { saveResource, deleteResource } = loadTs('lib/clientApi.ts');
  const previous = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, redirected: true, status: 200, json: async () => { throw new Error('HTML login'); } });
    assert.equal((await saveResource('/test', 'POST', {})).ok, false);
    assert.equal((await deleteResource('/test')).ok, false);
    global.fetch = async () => Response.json({ error: 'Please sign in' }, { status: 401 });
    assert.deepEqual(await saveResource('/test', 'PUT', {}), { ok: false, error: 'Please sign in' });
    global.fetch = async () => { throw new Error('Offline'); };
    assert.equal((await saveResource('/test', 'PATCH', {})).ok, false);
    assert.equal((await deleteResource('/test')).ok, false);
    global.fetch = async () => Response.json({ ok: true, warning: 'Occupancy needs refresh' });
    assert.deepEqual(await deleteResource('/test'), { ok: true, warning: 'Occupancy needs refresh' });
    global.fetch = async () => Response.json({ error: 'Tenant not found.' }, { status: 404 });
    assert.deepEqual(await deleteResource('/test'), { ok: true });
  } finally { global.fetch = previous; }
});
