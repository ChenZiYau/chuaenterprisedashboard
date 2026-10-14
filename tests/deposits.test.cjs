const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const unit = { id: 'u1', propertyId: 'p1', name: 'Room A', rentalRate: 800, depositMonths: 2, depositAmount: 1650, electricityFreeUnits: 45 };
const property = { id: 'p1', name: 'Garden House', shortName: 'Garden', city: 'KL', rentalModel: 'room_rental' };

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function depositHost(saveResult) {
  let slots = [], cursor = 0, pending = [], dirty = false, tree, current = { ...unit }, refreshes = 0;
  const calls = [];
  const react = {
    useState(seed) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof seed === 'function' ? seed() : seed;
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(slots[i], next)) { slots[i] = next; dirty = true; }
      }];
    },
    useMemo(fn) { return fn(); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, n) => !Object.is(dep, slots[i][n]))) { slots[i] = deps; pending.push(effect); }
    },
  };
  const { default: Page } = loadTs('app/deposits/page.tsx', {
    react,
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
    '@/components/Toast': { useToast: () => ({ updated() {} }) },
    '@/lib/DataContext': { useData: () => ({ properties: [property], getUnitsForProperty: () => [current], updateUnit: (saved) => { current = saved; } }) },
    '@/lib/clientApi': { saveResource: async (path, method, body) => {
      calls.push({ path, method, body });
      return saveResult ? await saveResult(body) : { ok: true, data: { unit: { ...current, ...body } } };
    } },
  });
  const page = Page();
  const section = find(page, (node) => node.type?.name === 'PropertyDepositSection');
  const card = find(section.type(section.props), (node) => node.type?.name === 'DepositRoomCard');
  slots = [];
  function render() {
    for (let i = 0; i < 8; i++) {
      cursor = 0; pending = []; dirty = false;
      tree = card.type({ unit: current });
      pending.forEach((effect) => effect());
      if (!dirty) return;
    }
    throw new Error('Deposit form did not settle');
  }
  render();
  return {
    render, calls,
    get current() { return current; },
    get refreshes() { return refreshes; },
    find: (predicate) => find(tree, predicate),
    button: (label) => find(tree, (node) => node.type === 'button' && node.props.children === label),
    input: (step) => find(tree, (node) => node.type === 'input' && node.props.step === step),
    page() { slots = []; cursor = 0; return Page(); },
  };
}

test('deposit Save persists both fields and updates shared totals', async () => {
  const host = depositHost();
  host.button('Edit').props.onClick(); host.render();
  host.input('0.5').props.onChange({ target: { value: '3' } }); host.render();
  assert.equal(host.input('0.01').props.value, '2400');
  host.input('0.01').props.onChange({ target: { value: '2500' } }); host.render();
  await host.button('Save').props.onClick(); host.render();
  assert.deepEqual(host.calls, [{ path: '/api/units/u1', method: 'PUT', body: { depositMonths: 3, depositAmount: 2500 } }]);
  assert.equal(host.current.depositAmount, 2500);
  assert.equal(host.current.rentalRate, 800);
  assert.equal(host.current.electricityFreeUnits, 45);
  assert.ok(host.button('Edit'));
  assert.equal(host.refreshes, 1);
  assert.ok(find(host.page(), (node) => typeof node.props?.children === 'string' && node.props.children.includes('2,500.00')));
});

test('Cancel restores saved deposits without calling the API', () => {
  const host = depositHost();
  host.button('Edit').props.onClick(); host.render();
  host.input('0.5').props.onChange({ target: { value: '7' } }); host.render();
  host.button('Cancel').props.onClick(); host.render();
  host.button('Edit').props.onClick(); host.render();
  assert.equal(host.input('0.5').props.value, '2');
  assert.equal(host.input('0.01').props.value, '1650');
  assert.equal(host.calls.length, 0);
});

test('failed deposit save keeps the draft editable and shared data unchanged', async () => {
  const host = depositHost(async () => ({ ok: false, error: 'Connection failed' }));
  host.button('Edit').props.onClick(); host.render();
  host.input('0.01').props.onChange({ target: { value: '900' } }); host.render();
  await host.button('Save').props.onClick(); host.render();
  assert.equal(host.input('0.01').props.value, '900');
  assert.equal(host.current.depositAmount, 1650);
  assert.equal(host.refreshes, 0);
  assert.equal(host.find((node) => node.props?.role === 'alert').props.children, 'Connection failed');
});

test('explicit zero deposit overrides the calculated deposit in card and total', async () => {
  const host = depositHost();
  host.button('Edit').props.onClick(); host.render();
  host.input('0.01').props.onChange({ target: { value: '0' } }); host.render();
  await host.button('Save').props.onClick(); host.render();
  assert.equal(host.current.depositMonths, 2);
  assert.equal(host.current.depositAmount, 0);
  assert.ok(host.find((node) => typeof node.props?.children === 'string' && node.props.children.includes('0.00')));
  assert.ok(find(host.page(), (node) => typeof node.props?.children === 'string' && node.props.children.includes('0.00')));
});

test('pending deposit save disables Save, Cancel and fields', async () => {
  let finish;
  const host = depositHost((body) => new Promise((resolve) => { finish = () => resolve({ ok: true, data: { unit: { ...unit, ...body } } }); }));
  host.button('Edit').props.onClick(); host.render();
  const saving = host.button('Save').props.onClick(); host.render();
  assert.equal(host.button('Saving...').props.disabled, true);
  assert.equal(host.button('Cancel').props.disabled, true);
  assert.equal(host.input('0.01').props.disabled, true);
  await host.button('Saving...').props.onClick();
  assert.equal(host.calls.length, 1);
  finish(); await saving;
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
