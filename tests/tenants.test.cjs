const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const input = {
  name: 'Alice', icNumber: 'ABC123', phone: '0123456789', email: null,
  unitId: 'unit-1', leaseStart: '2026-01-01', leaseEnd: '2026-12-31',
};

function tenant(id, name, unitId) {
  return {
    id, name, unit_id: unitId, ic_number: 'ABC123', phone: '0123456789', email: null,
    lease_start: input.leaseStart, lease_end: input.leaseEnd,
  };
}

// A database double with actual row mutations lets occupancy reads observe the
// tenant mutation, while keeping every test disconnected from Supabase.
function fixture(initial = {}, fail = () => false) {
  const state = {
    tenants: structuredClone(initial.tenants ?? []),
    units: structuredClone(initial.units ?? [{ id: 'unit-1', tenant_name: null, is_rented: false }]),
  };
  const calls = [];
  const supabaseAdmin = {
    from(table) {
      const query = { table, action: 'select', filters: [] };
      const builder = {
        select() { return builder; },
        insert(row) { query.action = 'insert'; query.row = row; return builder; },
        update(row) { query.action = 'update'; query.row = row; return builder; },
        delete() { query.action = 'delete'; return builder; },
        eq(key, value) { query.filters.push([key, value]); return builder; },
        order(key) { query.order = key; return builder; },
        limit(count) { query.limit = count; return builder; },
        single() { query.single = true; return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push(query);
            if (fail(query)) return { data: null, error: new Error('Simulated database failure') };
            const matches = (row) => query.filters.every(([key, value]) => row[key] === value);
            let rows = state[table].filter(matches);
            if (query.action === 'insert') {
              const row = { id: 'new-tenant', ...query.row };
              state[table].push(row);
              rows = [row];
            } else if (query.action === 'update') {
              rows.forEach((row) => Object.assign(row, query.row));
            } else if (query.action === 'delete') {
              state[table] = state[table].filter((row) => !matches(row));
            }
            if (query.order) rows.sort((a, b) => String(a[query.order]).localeCompare(String(b[query.order])));
            if (query.limit !== undefined) rows = rows.slice(0, query.limit);
            return { data: structuredClone(query.single ? rows[0] ?? null : rows), error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const mocks = { '@/lib/supabaseServer': { supabaseAdmin } };
  const create = loadTs('app/api/tenants/route.ts', mocks);
  const item = loadTs('app/api/tenants/[id]/route.ts', mocks);
  return { state, calls, POST: create.POST, PUT: item.PUT, DELETE: item.DELETE };
}

const request = (body) => ({ json: async () => body });
const params = (id = 'tenant-1') => ({ params: Promise.resolve({ id }) });

test('tenant payload normalizes required text and allows equal lease dates', () => {
  const { parseTenantInput } = loadTs('lib/tenantInput.ts');
  const result = parseTenantInput({ ...input, name: ' Alice ', phone: ' 123 ', email: ' ', leaseEnd: input.leaseStart });
  assert.equal(result.row.name, 'Alice');
  assert.equal(result.row.phone, '123');
  assert.equal(result.row.email, null);
  assert.equal(result.row.lease_end, input.leaseStart);
});

test('POST and PUT reject invalid types, incomplete records and invalid lease dates before database access', async () => {
  const db = fixture();
  const invalid = [null, [], 10, { ...input, name: 4 }, { ...input, icNumber: '' },
    { ...input, phone: null }, { ...input, unitId: ' ' }, { ...input, email: {} },
    { ...input, leaseStart: '2026-02-30' }, { ...input, leaseEnd: '2025-12-31' },
    { ...input, leaseStart: '2026-1-1' }, { name: 'Alice' }];
  for (const body of invalid) {
    assert.equal((await db.POST(request(body))).status, 400);
    assert.equal((await db.PUT(request(body), params())).status, 400);
  }
  assert.equal(db.calls.length, 0);
});

test('POST and PUT report malformed JSON as a client error', async () => {
  const db = fixture();
  const malformed = { json: async () => { throw new SyntaxError('Invalid JSON'); } };
  assert.equal((await db.POST(malformed)).status, 400);
  assert.equal((await db.PUT(malformed, params())).status, 400);
  assert.equal(db.calls.length, 0);
});

test('creating a tenant returns the saved ID and marks the unit rented', async () => {
  const db = fixture();
  const response = await db.POST(request(input));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.tenant.id, 'new-tenant');
  assert.equal(saved.tenant.unitId, 'unit-1');
  assert.equal(db.state.tenants.length, 1);
  assert.deepEqual(db.state.units[0], { id: 'unit-1', tenant_name: 'Alice', is_rented: true });
});

test('moving a tenant preserves the old unit co-tenant and updates the destination', async () => {
  const db = fixture({
    tenants: [tenant('tenant-1', 'Alice', 'unit-1'), tenant('tenant-2', 'Bob', 'unit-1')],
    units: [{ id: 'unit-1', tenant_name: 'Alice', is_rented: true }, { id: 'unit-2', tenant_name: null, is_rented: false }],
  });
  const response = await db.PUT(request({ ...input, name: 'Alicia', unitId: 'unit-2' }), params());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tenant.name, 'Alicia');
  assert.equal(db.state.tenants[0].unit_id, 'unit-2');
  assert.deepEqual(db.state.units, [
    { id: 'unit-1', tenant_name: 'Bob', is_rented: true },
    { id: 'unit-2', tenant_name: 'Alicia', is_rented: true },
  ]);
});

test('editing the same unit synchronizes occupancy once and persists lease changes', async () => {
  const db = fixture({ tenants: [tenant('tenant-1', 'Alice', 'unit-1')] });
  const response = await db.PUT(request({ ...input, name: 'Alicia', leaseEnd: '2027-12-31' }), params());
  assert.equal(response.status, 200);
  assert.equal(db.state.tenants[0].lease_end, '2027-12-31');
  assert.equal(db.state.units[0].tenant_name, 'Alicia');
  assert.equal(db.calls.filter((call) => call.table === 'units' && call.action === 'update').length, 1);
});

test('deleting the last tenant clears the name and rented flag', async () => {
  const db = fixture({
    tenants: [tenant('tenant-1', 'Alice', 'unit-1')],
    units: [{ id: 'unit-1', tenant_name: 'Alice', is_rented: true }],
  });
  assert.equal((await db.DELETE({}, params())).status, 200);
  assert.equal(db.state.tenants.length, 0);
  assert.deepEqual(db.state.units[0], { id: 'unit-1', tenant_name: null, is_rented: false });
});

test('deleting one co-tenant keeps the remaining tenant occupancy', async () => {
  const db = fixture({ tenants: [tenant('tenant-1', 'Alice', 'unit-1'), tenant('tenant-2', 'Bob', 'unit-1')] });
  assert.equal((await db.DELETE({}, params())).status, 200);
  assert.deepEqual(db.state.units[0], { id: 'unit-1', tenant_name: 'Bob', is_rented: true });
});

test('missing tenant edits and deletes return 404 without touching occupancy', async () => {
  const db = fixture();
  assert.equal((await db.PUT(request(input), params())).status, 404);
  assert.equal((await db.DELETE({}, params())).status, 404);
  assert.equal(db.calls.filter((call) => call.table === 'units').length, 0);
});

test('occupancy failure after a committed mutation reports success plus a warning', async (t) => {
  t.mock.method(console, 'error', () => {});
  const failOccupancy = (query) => query.table === 'units' && query.action === 'update';
  const created = fixture({}, failOccupancy);
  const updated = fixture({ tenants: [tenant('tenant-1', 'Alice', 'unit-1')] }, failOccupancy);
  const deleted = fixture({ tenants: [tenant('tenant-1', 'Alice', 'unit-1')] }, failOccupancy);
  const responses = [await created.POST(request(input)),
    await updated.PUT(request({ ...input, name: 'Alicia' }), params()),
    await deleted.DELETE({}, params())];
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.match((await response.json()).warning, /occupancy could not be updated/);
  }
  assert.equal(created.state.tenants.length, 1);
  assert.equal(updated.state.tenants[0].name, 'Alicia');
  assert.equal(deleted.state.tenants.length, 0);
});

test('primary database failures return 500 and do not change unit occupancy', async (t) => {
  t.mock.method(console, 'error', () => {});
  const db = fixture({ tenants: [tenant('tenant-1', 'Alice', 'unit-1')] },
    (query) => query.table === 'tenants' && query.action !== 'select');
  assert.equal((await db.POST(request(input))).status, 500);
  assert.equal((await db.PUT(request(input), params())).status, 500);
  assert.equal((await db.DELETE({}, params())).status, 500);
  assert.equal(db.calls.filter((call) => call.table === 'units').length, 0);
  assert.equal(db.state.tenants.length, 1);
});
