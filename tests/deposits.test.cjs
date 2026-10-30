const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const unit = { id: 'u1', propertyId: 'p1', name: 'Room A', rentalRate: 800, depositMonths: 2, depositAmount: 1650, electricityFreeUnits: 45 };
const property = { id: 'p1', name: 'Garden House', shortName: 'Garden', city: 'KL', rentalModel: 'room_rental' };

const { hookHost, find } = require('./helpers/hook-host.cjs');

function depositHost(tenants = []) {
  const host = hookHost();
  const { default: Page } = loadTs('app/deposits/page.tsx', {
    react: host.react,
    '@/lib/DataContext': { useData: () => ({ properties: [property], tenants, units: [unit,
      { ...unit, id: 'u2', depositAmount: null, depositMonths: 3 }] }) },
  });
  return { render: () => host.render(() => Page()) };
}

test('deposits display tenant amounts only without editable fields or room fallback totals', () => {
  const tree = depositHost([
    { id: 't1', name: 'Alice', unitId: 'u1', depositAmount: 1200 },
    { id: 't2', name: 'Bob', unitId: '', depositAmount: 200 },
    { id: 't3', name: 'Legacy Tenant', unitId: 'u2', depositAmount: null },
  ]).render();
  const text = JSON.stringify(tree);
  for (const expected of ['1,400.00', 'Alice', 'Bob', 'Garden House', 'Room A', 'Unassigned']) assert.ok(text.includes(expected));
  for (const excluded of ['1,650.00', '2,400.00', 'Legacy Tenant']) assert.ok(!text.includes(excluded));
  assert.equal(find(tree, n => n.type === 'input' || n.type === 'form'), null);
  assert.equal(find(tree, n => n.type === 'button'), null);
  assert.ok(find(tree, n => n.type === 'a' && n.props.href === '/tenants'));
});

test('property filtering updates totals and excludes unassigned tenant deposits', () => {
  const host = depositHost([
    { id: 't1', name: 'Alice', unitId: 'u1', depositAmount: 1200 },
    { id: 't2', name: 'Bob', unitId: '', depositAmount: 200 },
  ]);
  let tree = host.render();
  find(tree, n => n.props?.label === 'Garden').props.onClick();
  tree = host.render();
  assert.ok(JSON.stringify(tree).includes('1,200.00'));
  assert.ok(!JSON.stringify(tree).includes('Bob'));
  find(tree, n => n.props?.label === 'All Properties').props.onClick();
  assert.ok(JSON.stringify(host.render()).includes('1,400.00'));
});

test('legacy room deposits do not count as received tenant deposits', () => {
  const text = JSON.stringify(depositHost([{ id: 't1', name: 'Legacy', unitId: 'u1' }]).render());
  assert.ok(text.includes('No tenant deposits recorded'));
  assert.ok(text.includes('0.00'));
  assert.ok(!text.includes('1,650.00'));
  assert.ok(!text.includes('2,400.00'));
});

test('explicit zero tenant deposits are displayed without room defaults', () => {
  const text = JSON.stringify(depositHost([{ id: 't1', name: 'Zero Tenant', unitId: 'u1', depositAmount: 0 }]).render());
  assert.ok(text.includes('Zero Tenant'));
  assert.ok(text.includes('0.00'));
  assert.ok(!text.includes('No tenant deposits recorded'));
  assert.ok(!text.includes('1,650.00'));
});

function depositApi(result = {}) {
  const writes = [];
  const api = loadTs('app/api/units/[id]/route.ts', {
    '@/lib/supabaseServer': { supabaseAdmin: { from(table) {
      assert.equal(table, 'units');
      const query = {
        update(values) { writes.push(values); return query; },
        eq(field, id) { assert.equal(field, 'id'); assert.equal(id, 'u1'); return query; },
        select() { return query; },
        async maybeSingle() { return { data: { id: 'u1', property_id: 'p1', name: 'Room A', rental_rate: 800, electricity_free_units: 45, ...writes[0] }, error: null, ...result }; },
      };
      return query;
    } } },
  });
  return { ...api, writes };
}

test('deposit API writes only deposit columns and returns the persisted unit', async () => {
  const api = depositApi();
  const response = await api.PUT({ json: async () => ({ depositMonths: 2.5, depositAmount: 0, rentalRate: 1, tenantName: 'unrelated' }) }, { params: Promise.resolve({ id: 'u1' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(api.writes, [{ deposit_months: 2.5, deposit_amount: 0 }]);
  const data = await response.json();
  assert.equal(data.unit.depositAmount, 0);
  assert.equal(data.unit.rentalRate, 800);
  assert.equal(data.unit.electricityFreeUnits, 45);
});

test('deposit API accepts cleared overrides', async () => {
  const api = depositApi();
  const response = await api.PUT({ json: async () => ({ depositMonths: null, depositAmount: null }) }, { params: Promise.resolve({ id: 'u1' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(api.writes, [{ deposit_months: null, deposit_amount: null }]);
});

for (const body of [null, {}, { depositMonths: -1, depositAmount: null }, { depositMonths: 2, depositAmount: '100' }, { depositMonths: Infinity, depositAmount: 0 }]) {
  test(`invalid deposit ${JSON.stringify(body)} is rejected before writing`, async () => {
    const api = depositApi();
    const response = await api.PUT({ json: async () => body }, { params: Promise.resolve({ id: 'u1' }) });
    assert.equal(response.status, 400);
    assert.equal(api.writes.length, 0);
  });
}

test('deposit API reports missing units and database errors without success', async () => {
  for (const [result, status] of [[{ data: null }, 404], [{ error: new Error('offline') }, 500]]) {
    const api = depositApi(result);
    const response = await api.PUT({ json: async () => ({ depositMonths: 2, depositAmount: 1600 }) }, { params: Promise.resolve({ id: 'u1' }) });
    assert.equal(response.status, status);
  }
});
