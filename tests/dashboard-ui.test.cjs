const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { hookHost, find } = require('./helpers/hook-host.cjs');

const property = { id: 'p1', name: 'Fixture house', shortName: 'Fixture', rentalModel: 'room_rental' };
const unit = { id: 'u1', propertyId: 'p1', name: 'Room A', rentalRate: 800, tenantName: 'Fixture tenant' };
const year = new Date().getFullYear();
const entry = { id: 'r1', propertyId: 'p1', unitId: 'u1', month: 10, year, paymentDate: `${year}-10-14`, rental: 800,
  electricity: 20, other: 0, method: 'cash', status: 'paid', invoiceGenerated: false, invoiceNumber: 'INV-TEST' };

test('shared property and deposit updates propagate; hiding and undo preserve related records', () => {
  const host = hookHost();
  const { DataProvider } = loadTs('lib/DataContext.tsx', { react: host.react });
  let value = { properties: [property], units: [unit], tenants: [{ id: 't1', unitId: 'u1' }], revenueEntries: [entry], expenseEntries: [{ id: 'e1', propertyId: 'p1' }] };
  const render = () => host.render(() => DataProvider({ value, children: null })).props.value;
  let ctx = render();
  ctx.upsertProperty({ ...property, id: 'p2' }, [{ ...unit, id: 'u2', propertyId: 'p2' }]);
  ctx = render();
  assert.ok(ctx.getProperty('p2'));
  assert.equal(ctx.getUnitsForProperty('p2')[0].id, 'u2');
  ctx.updateUnit({ ...unit, depositAmount: 1200 });
  ctx = render();
  assert.equal(ctx.getUnit('u1').depositAmount, 1200);
  ctx.hideProperty('p1'); ctx = render();
  assert.equal(ctx.getUnit('u1'), undefined);
  assert.equal(ctx.tenants.length, 0);
  assert.equal(ctx.revenueEntries.length, 0);
  assert.equal(ctx.expenseEntries.length, 0);
  ctx.unhideProperty('p1'); ctx = render();
  assert.equal(ctx.getUnit('u1').depositAmount, 1200);
  assert.equal(ctx.tenants.length, 1);
  assert.equal(ctx.revenueEntries.length, 1);
  value = { ...value, revenueEntries: [{ ...entry, rental: 900 }] };
  assert.equal(render().revenueEntries[0].rental, 900);
});

function ledgerHost(modulePath, exportName, { expenses = false, noProperties = false, save = null } = {}) {
  const host = hookHost();
  let refreshes = 0;
  const messages = [], calls = [];
  let data = {
    properties: noProperties ? [] : [property], units: [unit], revenueEntries: [entry],
    expenseEntries: [{ id: 'e1', propertyId: 'p1', unitId: null, year, month: 10, expenseDate: `${year}-10-14`, category: 'maintenance', amount: 120 }],
    getUnit: () => unit, getUnitsForProperty: () => [unit],
  };
  function ActionMenu() {}
  function QuickEntryModal() {}
  function ConfirmDialog() {}
  const module = loadTs(modulePath, {
    react: host.react,
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
    '@/components/ui': { ActionMenu, Pagination() {}, usePagination: (items) => ({ page: 1, setPage() {}, totalPages: 1, total: items.length, pageSize: 10, pageItems: items }) },
    '@/components/QuickEntryModal': { QuickEntryModal },
    '@/components/ConfirmDialog': { ConfirmDialog },
    '@/components/Toast': { useToast: () => ({ info: (m) => messages.push(m), updated: (m) => messages.push(m), deleted() {} }) },
    '@/lib/DataContext': { useData: () => data },
    '@/lib/clientApi': { saveResource: async (...args) => { calls.push(args); return save ?? { ok: true, data: { entry: { ...entry, invoiceGenerated: true } } }; }, deleteResource: async () => ({ ok: true }) },
    '@/lib/receipt': { buildReceiptData: (entry) => entry, openReceiptWindow() {} },
  });
  const render = () => host.render(() => module[exportName]({ property }));
  render();
  return { host, render, calls, messages, ActionMenu, QuickEntryModal, ConfirmDialog,
    get refreshes() { return refreshes; },
    refreshData() { data = { ...data, [expenses ? 'expenseEntries' : 'revenueEntries']: [] }; render(); },
  };
}

for (const [file, exported, expenses] of [
  ['app/revenue/page.tsx', 'default', false], ['app/expenses/page.tsx', 'default', true],
  ['components/PropertyRevenueTab.tsx', 'PropertyRevenueTab', false], ['components/PropertyExpensesTab.tsx', 'PropertyExpensesTab', true],
  ['app/invoices/page.tsx', 'default', false],
]) {
  test(`${file}: Edit opens the selected record and refreshed data replaces stale rows`, () => {
    const page = ledgerHost(file, exported, { expenses });
    const menu = page.host.find((n) => n.type === page.ActionMenu);
    menu.props.items.find((item) => item.label === 'Edit').onClick();
    page.render();
    const modal = page.host.find((n) => n.type === page.QuickEntryModal);
    assert.equal((expenses ? modal.props.initialExpenseEntry : modal.props.initialRevenueEntry).id, expenses ? 'e1' : 'r1');
    page.refreshData();
    assert.equal(page.host.find((n) => n.type === page.ActionMenu), null);
  });
}

for (const file of ['app/revenue/page.tsx', 'app/expenses/page.tsx']) {
  test(`${file}: empty properties cannot open an invalid entry form`, () => {
    const page = ledgerHost(file, 'default', { noProperties: true });
    const button = page.host.find((n) => n.type === 'button' && /Add|Enter/.test(JSON.stringify(n.props.children)));
    assert.equal(button.props.disabled, true);
    assert.equal(page.host.find((n) => n.type === page.QuickEntryModal), null);
  });
}

for (const [file, exported] of [['app/invoices/page.tsx', 'default'], ['components/PropertyInvoiceTab.tsx', 'PropertyInvoiceTab']]) {
  test(`${file}: Gen persists status, reserves popup before awaiting, and Delete asks for confirmation`, async () => {
    const page = ledgerHost(file, exported);
    const previous = global.window;
    let opened = false;
    global.window = { open() { opened = true; assert.equal(page.calls.length, 0); return { close() {} }; } };
    try {
      await page.host.find((n) => n.type === 'button' && n.props.title === 'Generate receipt').props.onClick();
      assert.equal(opened, true);
      assert.deepEqual(page.calls[0], ['/api/revenue/r1', 'PATCH', { invoiceGenerated: true }]);
      assert.equal(page.refreshes, 1);
      page.host.find((n) => n.type === page.ActionMenu).props.items.find((item) => item.label === 'Delete').onClick();
      page.render();
      assert.match(page.host.find((n) => n.type === page.ConfirmDialog).props.message, /revenue entry/);
    } finally { global.window = previous; }
  });
}

test('failed gallery retrieval blocks editing/saving, and Retry restores the saved gallery', async () => {
  const host = hookHost();
  const { PropertyImagesTab } = loadTs('components/PropertyImagesTab.tsx', {
    react: host.react, '@/components/VaultCropModal': { VaultCropModal() {} },
    '@/components/Toast': { useToast: () => ({ created() {}, info() {} }) },
  });
  const outer = PropertyImagesTab({ property });
  assert.equal(outer.key, 'p1');
  assert.equal(PropertyImagesTab({ property: { ...property, id: 'p2' } }).key, 'p2');
  const previous = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return Response.json({ error: 'offline' }, { status: 503 }); };
  const render = () => host.render(() => outer.type(outer.props));
  try {
    render(); await new Promise((resolve) => setImmediate(resolve)); render();
    assert.ok(host.find((n) => n.props?.role === 'alert'));
    assert.equal(host.find((n) => n.type === 'button' && n.props.children === 'Save all'), null);
    assert.equal(calls, 1);
    global.fetch = async () => Response.json({ images: [{ id: 'image-1', imageUrl: 'https://example.test/photo.jpg', title: 'Saved photo' }] });
    host.find((n) => n.type === 'button' && n.props.children === 'Retry loading photos').props.onClick();
    render(); await new Promise((resolve) => setImmediate(resolve)); render();
    assert.equal(host.find((n) => n.type?.name === 'ImageCard').props.card.title, 'Saved photo');
    assert.ok(host.find((n) => n.type === 'button' && n.props.children === 'Save all'));
  } finally { global.fetch = previous; }
});
