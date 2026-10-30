const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { withScheduledRent, tenantForMonth } = loadTs('lib/tenantRent.ts');
const units = [{ id: 'u1', propertyId: 'p1', rentalRate: 900 }];
const tenant = { id: 't1', unitId: 'u1', baseRent: 800, depositAmount: 1600, leaseStart: '2026-02-15', leaseEnd: '2026-04-10' };

test('scheduled rent saves through POST, while recorded rent uses PUT', async (t) => {
  const { hookHost, find } = require('./helpers/hook-host.cjs');
  const oldWindow = global.window, oldDocument = global.document;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = { body: { style: {} } };
  t.after(() => { global.window = oldWindow; global.document = oldDocument; });
  for (const scheduled of [true, false]) {
    const host = hookHost(), calls = [];
    const entry = { ...withScheduledRent([], [tenant], units, '2026-03-01', '2026-03-31')[0], scheduled };
    const { QuickEntryModal } = loadTs('components/QuickEntryModal.tsx', {
      react: host.react, 'react-dom': { createPortal: n => n },
      'next/navigation': { useRouter: () => ({ refresh() {} }) },
      '@/lib/DataContext': { useData: () => ({ tenants: [tenant], revenueEntries: [], expenseEntries: [] }) },
      '@/components/Toast': { useToast: () => ({ info() {}, created() {}, updated() {} }) },
      '@/lib/clientApi': { saveResource: async (path, method) => { calls.push({ path, method }); return { ok: true, data: { entry: { ...entry, id: 'saved' } } }; } },
    });
    const tree = host.render(() => QuickEntryModal({ open: true, onClose() {}, initialTab: 'revenue',
      initialRevenueEntry: entry, property: { id: 'p1', name: 'House' }, units }));
    await find(tree, n => n.type?.name === 'RevenueForm').props.onSave(entry, false);
    assert.equal(calls[0].method, scheduled ? 'POST' : 'PUT');
    assert.equal(calls[0].path, scheduled ? '/api/revenue' : `/api/revenue/${encodeURIComponent(entry.id)}`);
  }
});

test('tenant deposits appear once, including unassigned tenants, without counting the room deposit again', () => {
  const { hookHost, find } = require('./helpers/hook-host.cjs');
  const host = hookHost();
  const { default: Page } = loadTs('app/deposits/page.tsx', {
    react: host.react,
    '@/lib/DataContext': { useData: () => ({ properties: [{ id: 'p1' }], units,
      tenants: [tenant, { ...tenant, id: 't2', unitId: '', depositAmount: 200 }],
      getUnitsForProperty: () => [{ ...units[0], depositAmount: 999 }] }) },
  });
  const tree = host.render(() => Page());
  assert.equal(find(tree, n => n.type?.name === 'PropertyDepositSection'), null);
  const text = JSON.stringify(tree);
  assert.match(text, /1,800\.00/);
  assert.match(text, /Unassigned/);
});

test('saved tenant rent repeats only in lease months, without recurring deposit or payment claims', () => {
  const rows = withScheduledRent([], [tenant], units, '2026-01-01', '2026-12-31');
  assert.deepEqual(rows.map(r => r.month), [2, 3, 4]);
  assert.equal(rows[0].paymentDate, '2026-02-15');
  for (const row of rows) {
    assert.equal(row.rental, 800);
    assert.equal(row.other, null);
    assert.equal(row.status, 'pending');
    assert.equal(row.invoiceGenerated, false);
  }
});

test('recorded months remain untouched and replace scheduled rent', () => {
  const saved = { id: 'saved', unitId: 'u1', year: 2026, month: 3, rental: 700, status: 'paid' };
  const rows = withScheduledRent([saved], [tenant], units, '2026-01-01', '2026-12-31');
  assert.equal(rows.length, 3);
  assert.equal(rows.find(r => r.month === 3), saved);
});

test('unassigned, legacy and rent-free tenants create no scheduled charges', () => {
  for (const change of [{ unitId: '' }, { baseRent: null }, { baseRent: 0 }]) {
    assert.deepEqual(withScheduledRent([], [{ ...tenant, ...change }], units, '2026-01-01', '2026-12-31'), []);
  }
});

test('renewals use the applicable lease and work across year boundaries', () => {
  const renewed = { ...tenant, id: 't2', baseRent: 850, leaseStart: '2026-12-01', leaseEnd: '2027-02-28' };
  assert.equal(tenantForMonth([tenant, renewed], 'u1', 2027, 1), renewed);
  assert.deepEqual(withScheduledRent([], [tenant, renewed], units, '2026-12-01', '2027-03-01').map(r => [r.year, r.month, r.rental]), [[2026, 12, 850], [2027, 1, 850], [2027, 2, 850]]);
});
