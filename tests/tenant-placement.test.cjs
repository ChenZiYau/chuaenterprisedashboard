const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { hookHost, find } = require('./helpers/hook-host.cjs');

test('Add Tenant saves unassigned and selects Whole Unit only for whole-unit properties', async (t) => {
  const host = hookHost();
  const oldWindow = global.window, oldDocument = global.document;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = { body: { style: {} } };
  t.after(() => { global.window = oldWindow; global.document = oldDocument; });
  const { AddTenantModal } = loadTs('components/AddTenantModal.tsx', {
    react: host.react, 'react-dom': { createPortal: (node) => node },
    '@/components/ui': { DateField() {} },
  });
  const saved = [];
  const props = { open: true, onClose() {}, onAdd: async (value) => { saved.push(value); return false; }, tenants: [],
    properties: [{ id: 'whole', name: 'Whole House', rentalModel: 'whole_unit' },
      { id: 'rooms', name: 'Rooms', rentalModel: 'room_rental' },
      { id: 'empty', name: 'Missing Unit', rentalModel: 'whole_unit' }],
    units: [{ id: 'w1', propertyId: 'whole', name: 'Whole Unit' }, { id: 'r1', propertyId: 'rooms', name: 'Room A' }],
  };
  let tree;
  const render = () => { tree = host.render(() => AddTenantModal(props)); };
  const field = (label) => find(tree, (n) => n.props?.label === label);
  const select = (label) => find(field(label), (n) => n.type === 'select');
  render();
  for (const [label, value] of [['Full name', 'Alice'], ['IC / Passport No.', 'ABC'], ['Phone', '0123456789'], ['Email (optional)', 'alice@example.com']]) {
    find(field(label), (n) => n.type === 'input').props.onChange({ target: { value } });
  }
  render();
  await find(tree, (n) => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].unitId, '');

  select('Property (optional)').props.onChange({ target: { value: 'whole' } });
  render();
  assert.equal(select('Room / Unit (optional)').props.value, 'w1');
  await find(tree, (n) => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved[1].unitId, 'w1');

  select('Property (optional)').props.onChange({ target: { value: 'rooms' } });
  render();
  assert.equal(select('Room / Unit (optional)').props.value, '');
  await find(tree, (n) => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved[2].unitId, '');

  select('Property (optional)').props.onChange({ target: { value: 'empty' } });
  render();
  assert.equal(select('Room / Unit (optional)').props.value, '');
  select('Property (optional)').props.onChange({ target: { value: '' } });
  render();
  assert.equal(select('Room / Unit (optional)').props.disabled, true);
});
