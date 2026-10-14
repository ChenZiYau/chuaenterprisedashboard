const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { mockDb } = require('./helpers/mock-db.cjs');

const property = { id: 'p1', name: 'Garden House', slug: 'garden-house', shortName: 'Garden', city: 'KL', rentalModel: 'room_rental' };
const unit = { id: 'u1', propertyId: 'p1', name: 'Room A', rentalRate: 800, depositMonths: 2, depositAmount: 1650, electricityFreeUnits: 45 };

test('property editing cannot overwrite tenant occupancy or change tenant assignment', async () => {
  const db = mockDb({ properties: [{ id: 'p1', name: property.name, slug: property.slug }],
    units: [{ id: 'u1', property_id: 'p1', name: 'Room A', tenant_name: 'Alice', is_rented: true }],
    tenants: [{ id: 't1', name: 'Alice', unit_id: 'u1' }] });
  const { PUT } = loadTs('app/api/properties/[id]/route.ts', db.mocks);
  const response = await PUT({ json: async () => ({ property, units: [{ ...unit, tenantName: 'Bob' }] }) }, { params: Promise.resolve({ id: 'p1' }) });
  assert.equal(response.status, 200);
  assert.equal(db.state.units[0].tenant_name, 'Alice');
  assert.equal(db.state.units[0].is_rented, true);
  assert.equal(db.state.tenants[0].unit_id, 'u1');
  const update = db.calls.find((q) => q.table === 'units' && q.action === 'update');
  assert.equal(Object.hasOwn(update.row, 'tenant_name'), false);
});

test('new properties start vacant until a tenant record is assigned', async () => {
  const db = mockDb({ properties: [], units: [], tenants: [] });
  const { POST } = loadTs('app/api/properties/route.ts', db.mocks);
  const response = await POST({ json: async () => ({ property, units: [{ ...unit, tenantName: 'Alice' }] }) });
  assert.equal(response.status, 200);
  assert.equal(db.state.units[0].tenant_name, null);
  assert.equal(db.state.units[0].is_rented, false);
  assert.equal(db.state.properties[0].rented_units, 0);
});

// Exercise the actual form's initialization and submit handler with a small
// hook host. No browser, network, database or component snapshots are used.
function formHost(initial, onSubmit) {
  let slots = [], cursor = 0, pending = [], dirty = false, tree;
  const react = {
    useState(seed) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof seed === 'function' ? seed() : seed;
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(slots[i], next)) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(value) {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: value });
    },
    useCallback(fn) { return fn; },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, n) => !Object.is(dep, slots[i][n]))) {
        slots[i] = deps;
        pending.push(effect);
      }
    },
  };
  const { AddPropertyModal } = loadTs('components/AddPropertyModal.tsx', {
    react,
    'react-dom': { createPortal: (node) => node },
    '@/components/ImageCropperModal': { ImageCropperModal: () => null },
    '@/lib/DataContext': { useData: () => ({ tenants: [] }) },
  });
  const savedDocument = global.document, savedWindow = global.window;
  global.document = { body: { style: { overflow: '' } } };
  global.window = { addEventListener() {}, removeEventListener() {} };
  let props = { open: true, initial, onSubmit, onClose() {} };
  function render(nextProps = {}) {
    props = { ...props, ...nextProps };
    for (let i = 0; i < 8; i++) {
      cursor = 0; pending = []; dirty = false;
      tree = AddPropertyModal(props);
      pending.forEach((effect) => effect());
      if (!dirty) return tree;
    }
    throw new Error('Form did not settle');
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map((child) => find(predicate, child ?? null)).find(Boolean);
    return predicate(node) ? node : find(predicate, node.props?.children ?? null);
  }
  render();
  return {
    render, find,
    submit: () => find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    close: () => { global.document = savedDocument; global.window = savedWindow; },
  };
}

for (const rentalModel of ['room_rental', 'whole_unit']) {
  test(`editing ${rentalModel} preserves deposits and custom electricity allowance`, async () => {
    let saved;
    const host = formHost({ property: { ...property, rentalModel }, units: [unit] }, (p, units) => { saved = units; });
    try {
      await host.submit();
      assert.equal(saved[0].id, unit.id);
      assert.equal(saved[0].depositMonths, 2);
      assert.equal(saved[0].depositAmount, 1650);
      assert.equal(saved[0].electricityFreeUnits, 45);
    } finally { host.close(); }
  });
}

test('property edits preserve explicit zero settings', async () => {
  let saved;
  const host = formHost({ property, units: [{ ...unit, depositMonths: 0, depositAmount: 0, electricityFreeUnits: 0 }] }, (p, units) => { saved = units; });
  try {
    await host.submit();
    assert.equal(saved[0].depositMonths, 0);
    assert.equal(saved[0].depositAmount, 0);
    assert.equal(saved[0].electricityFreeUnits, 0);
  } finally { host.close(); }
});

test('failed save and parent refresh retain the unsaved property draft', async () => {
  let saved;
  const initial = { property, units: [unit] };
  const host = formHost(initial, (p) => { saved = p; return false; });
  try {
    host.find((node) => node.type === 'input' && node.props.value === property.name)
      .props.onChange({ target: { value: 'Changed Property Name' } });
    host.render();
    await host.submit();
    host.render({ initial: { property: { ...property }, units: [{ ...unit }] } });
    await host.submit();
    assert.equal(saved.name, 'Changed Property Name');
    // Reopening deliberately starts with the persisted values again.
    host.render({ open: false });
    host.render({ open: true });
    await host.submit();
    assert.equal(saved.name, property.name);
  } finally { host.close(); }
});

function guardApi(linkedTable) {
  const writes = [], reads = [];
  const supabaseAdmin = { from(table) {
    let column;
    const query = {
      select(value) { column = value; return query; },
      eq() { return query; }, neq() { return query; }, ilike() { return query; },
      in(key, ids) { reads.push({ table, key, ids }); return query; },
      limit() { return query; },
      update(value) { writes.push({ table, value }); throw new Error('Unexpected update'); },
      insert(value) { writes.push({ table, value }); throw new Error('Unexpected insert'); },
      delete() { writes.push({ table }); throw new Error('Unexpected delete'); },
      then(resolve) {
        const data = table === 'units' ? [{ id: 'u1' }, { id: 'u2' }] : table === linkedTable ? [{ id: 'linked' }] : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  } };
  const api = loadTs('app/api/properties/[id]/route.ts', {
    '@/lib/supabaseServer': { supabaseAdmin },
  });
  return { ...api, writes, reads };
}

for (const linkedTable of ['tenants', 'revenue', 'expenses']) {
  test(`removing a unit linked to ${linkedTable} is rejected before any mutation`, async () => {
    const api = guardApi(linkedTable);
    const response = await api.PUT({ json: async () => ({ property, units: [unit] }) }, { params: Promise.resolve({ id: 'p1' }) });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Cannot remove a unit/);
    assert.deepEqual(api.writes, []);
    assert.ok(api.reads.some((read) => read.table === linkedTable && read.key === 'unit_id' && read.ids[0] === 'u2'));
  });
}

for (const units of [undefined, [], [null], [{ ...unit, rentalRate: -1 }], [unit, unit]]) {
  test(`invalid unit payload ${JSON.stringify(units)} cannot trigger unit deletion`, async () => {
    const api = guardApi();
    const response = await api.PUT({ json: async () => ({ property, units }) }, { params: Promise.resolve({ id: 'p1' }) });
    assert.equal(response.status, 400);
    assert.deepEqual(api.writes, []);
    assert.deepEqual(api.reads, []);
  });
}
