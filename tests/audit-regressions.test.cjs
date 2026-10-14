const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { mockDb } = require('./helpers/mock-db.cjs');
const { hookHost, find } = require('./helpers/hook-host.cjs');

test('property routes reject malformed text and enums before database access', async () => {
  const db = mockDb({ properties: [], units: [] });
  const { POST } = loadTs('app/api/properties/route.ts', db.mocks);
  const { PUT } = loadTs('app/api/properties/[id]/route.ts', db.mocks);
  const property = { name: 'Test', rentalModel: 'room_rental' };
  const unit = { id: 'u1', name: 'Room', rentalRate: 0, electricityFreeUnits: 0 };
  for (const patch of [{ shortName: 42 }, { city: {} }, { address: [] }, { slug: true },
    { imageUrl: {} }, { description: 7 }, { rentalModel: 'typo' }, { propertyType: 'typo' },
    { propertyType: ['house'] }, { status: 'typo' }]) {
    const req = { json: async () => ({ property: { ...property, ...patch }, units: [unit] }) };
    assert.equal((await POST(req)).status, 400);
    assert.equal((await PUT(req, { params: Promise.resolve({ id: 'p1' }) })).status, 400);
  }
  assert.equal(db.calls.length, 0);
});

test('property deletion removes only the selected property and related fixture records', async () => {
  const db = mockDb({
    properties: [{ id: 'p1' }, { id: 'p2' }],
    units: [{ id: 'u1', property_id: 'p1' }, { id: 'u2', property_id: 'p2' }],
    tenants: [{ id: 't1', unit_id: 'u1' }, { id: 't2', unit_id: 'u2' }],
    revenue: [{ id: 'r1', property_id: 'p1' }, { id: 'r2', property_id: 'p2' }],
    expenses: [{ id: 'e1', property_id: 'p1' }, { id: 'e2', property_id: 'p2' }],
  });
  const { DELETE } = loadTs('app/api/properties/[id]/route.ts', db.mocks);
  assert.equal((await DELETE({}, { params: Promise.resolve({ id: 'p1' }) })).status, 200);
  for (const [table, id] of [['properties', 'p2'], ['units', 'u2'], ['tenants', 't2'], ['revenue', 'r2'], ['expenses', 'e2']]) {
    assert.deepEqual(db.state[table].map((row) => row.id), [id]);
  }
});

test('login only redirects to local paths after successful authentication', async () => {
  const { login } = loadTs('app/login/actions.ts', {
    'next/headers': { headers: async () => new Headers(), cookies: async () => ({ set() {} }) },
    'next/navigation': { redirect: (path) => { throw new Error(`redirect:${path}`); } },
    '@/lib/auth': { SESSION_COOKIE: 'test', createSessionToken: async () => 'test-token' },
    '@/lib/verifyLogin': { verifyCredentials: async () => true },
  });
  for (const from of ['//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example']) {
    const form = new FormData(); form.set('from', from);
    await assert.rejects(login({}, form), { message: 'redirect:/properties' });
  }
  const form = new FormData(); form.set('from', '/revenue?year=2026');
  await assert.rejects(login({}, form), { message: 'redirect:/revenue?year=2026' });
});

test('gallery summaries distinguish empty, populated, failed and malformed responses', async () => {
  const { GET } = loadTs('app/api/vault/summary/route.ts', {
    '@/lib/db': { getProperties: async () => ['empty', 'full', 'failed', 'malformed'].map((id) => ({ id })) },
    '@/lib/vaultServer': { vaultFetch: async (path) => {
      if (path.endsWith('failed')) return Response.json({ error: 'offline' }, { status: 502 });
      if (path.endsWith('malformed')) return Response.json({});
      return Response.json({ images: path.endsWith('full') ? [{ imageUrl: 'https://example.com/photo.jpg' }] : [] });
    } },
  });
  const { summaries } = await (await GET()).json();
  assert.equal(summaries.empty.count, 0);
  assert.equal(summaries.full.count, 1);
  for (const id of ['failed', 'malformed']) {
    assert.equal(summaries[id].count, null);
    assert.equal(summaries[id].unavailable, true);
  }
});

test('Quick Entry blocks duplicate saves and closing while a request is pending, then allows retry', async (t) => {
  const host = hookHost();
  const oldWindow = global.window, oldDocument = global.document;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = { body: { style: {} } };
  t.after(() => { global.window = oldWindow; global.document = oldDocument; });
  let resolveSave, requests = 0, closes = 0;
  const data = { tenants: [], revenueEntries: [], expenseEntries: [] };
  const { QuickEntryModal } = loadTs('components/QuickEntryModal.tsx', {
    react: host.react, 'react-dom': { createPortal: (node) => node },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/lib/DataContext': { useData: () => data },
    '@/components/Toast': { useToast: () => ({ info() {}, created() {}, updated() {} }) },
    '@/lib/clientApi': { saveResource: () => { requests++; return new Promise((resolve) => { resolveSave = resolve; }); } },
  });
  const props = { open: true, onClose: () => { closes++; }, initialTab: 'expense',
    property: { id: 'p1', name: 'Test', rentalModel: 'room_rental' }, units: [] };
  const render = () => host.render(() => QuickEntryModal(props));
  let tree = render();
  const form = find(tree, (n) => n.type?.name === 'ExpenseForm');
  const save = form.props.onSave([{ amount: 10 }]);
  assert.equal(await form.props.onSave([{ amount: 10 }]), false);
  tree = render();
  assert.equal(find(tree, (n) => n.type === 'fieldset').props.disabled, true);
  find(tree, (n) => n.props?.['aria-label'] === 'Close').props.onClick();
  assert.equal(closes, 0);
  assert.equal(requests, 1);
  resolveSave({ ok: false, error: 'offline' });
  assert.equal(await save, false);
  tree = render();
  assert.equal(find(tree, (n) => n.type === 'fieldset').props.disabled, false);
  const retry = find(tree, (n) => n.type?.name === 'ExpenseForm').props.onSave([{ amount: 10 }]);
  resolveSave({ ok: true, data: { entries: [{ id: 'e1', amount: 10 }] } });
  assert.equal(await retry, true);
  assert.equal(requests, 2);
  assert.equal(closes, 1);
});

test('gallery crop editor restores saved natural-pixel geometry', (t) => {
  const host = hookHost();
  const oldWindow = global.window, oldDocument = global.document;
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.document = { body: {} };
  t.after(() => { global.window = oldWindow; global.document = oldDocument; });
  function ReactCrop() {}
  const { VaultCropModal } = loadTs('components/VaultCropModal.tsx', {
    react: host.react, 'react-dom': { createPortal: (node) => node },
    'react-image-crop': { __esModule: true, default: ReactCrop },
    'react-image-crop/dist/ReactCrop.css': {},
  });
  const props = { src: 'https://example.com/image.jpg', initial: { x: 100, y: 50, width: 400, height: 200, aspect: 'free' }, onCancel() {}, onApply() {} };
  let tree = host.render(() => VaultCropModal(props));
  const img = find(tree, (n) => n.type === 'img');
  const element = { width: 500, height: 250, naturalWidth: 1000, naturalHeight: 500 };
  img.props.ref.current = element;
  img.props.onLoad({ currentTarget: element });
  tree = host.render(() => VaultCropModal(props));
  assert.deepEqual(find(tree, (n) => n.type === ReactCrop).props.crop, { unit: 'px', x: 50, y: 25, width: 200, height: 100 });
});

test('failed gallery upload response cannot replace the saved gallery', async (t) => {
  const host = hookHost();
  let writes = 0;
  const messages = [];
  t.mock.method(global, 'fetch', async (_url, init) => {
    if (init?.method === 'POST') return Response.json({});
    if (init?.method === 'PUT') { writes++; return Response.json({ ok: true }); }
    return Response.json({ images: [] });
  });
  const { PropertyImagesTab } = loadTs('components/PropertyImagesTab.tsx', {
    react: host.react, '@/components/VaultCropModal': { VaultCropModal() {} },
    '@/components/Toast': { useToast: () => ({ info: (s) => messages.push(s), created: (s) => messages.push(s) }) },
  });
  const editor = PropertyImagesTab({ property: { id: 'p1' } });
  const render = () => host.render(() => editor.type(editor.props));
  render(); await new Promise(setImmediate); let tree = render();
  find(tree, (n) => n.type?.name === 'ImageCard').props.onSelectFile(new Blob(['image']));
  tree = render();
  await find(tree, (n) => n.type === 'button' && n.props.children === 'Save all').props.onClick();
  assert.equal(writes, 0);
  assert.ok(messages.some((s) => s.includes('valid image URL')));
  assert.equal(messages.includes('Gallery saved'), false);
});
