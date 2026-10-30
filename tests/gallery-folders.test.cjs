const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { hookHost, find } = require('./helpers/hook-host.cjs');
const { galleryFolders, galleryLink } = loadTs('lib/galleryFolders.ts');
const property = { id: 'p1', name: 'Paramount', slug: 'paramount', rentalModel: 'room_rental' };
const units = [{ id: 'u1', propertyId: 'p1', name: 'Room A' }, { id: 'u2', propertyId: 'p1', name: 'Room B' }, { id: 'u3', propertyId: 'p2', name: 'Other room' }];

test('folders automatically follow property rooms and preserve property photos and room IDs', () => {
  const folders = galleryFolders(property, units);
  assert.equal(folders.length, 3);
  assert.equal(folders[0], property);
  assert.equal(folders[1].name, 'Paramount — Room A');
  assert.notEqual(folders[1].id, folders[2].id);
  assert.equal(folders[1].slug, undefined);
  assert.equal(galleryFolders(property, [{ ...units[0], name: 'Renamed' }])[1].id, folders[1].id);
  assert.equal(galleryFolders({ ...property, rentalModel: 'whole_unit' }, units).length, 1);
  assert.equal(galleryFolders(property, [...units, { id: 'u4', propertyId: 'p1', name: 'Room D' }]).length, 4);
  assert.ok(galleryLink(folders[1]).endsWith('/p/' + encodeURIComponent(folders[1].id)));
  assert.ok(galleryLink({ id: 'p%/1', slug: ' ' }).endsWith('/p/p%25%2F1'));
});

test('folder selection protects unsaved edits and uses a separate gallery and public link', t => {
  const host = hookHost();
  const prev = global.window;
  global.window = { confirm: () => false };
  t.after(() => { global.window = prev; });
  function PropertyImagesEditor() {}
  const { PropertyImageFolders } = loadTs('components/PropertyImageFolders.tsx', {
    react: host.react,
    '@/lib/DataContext': { useData: () => ({ units }) },
    '@/components/Toast': { useToast: () => ({ info() {} }) },
    '@/components/PropertyImagesTab': { PropertyImagesEditor },
  });
  const render = () => host.render(() => PropertyImageFolders({ property }));
  let tree = render();
  find(tree, n => n.type === PropertyImagesEditor).props.onDirtyChange(true);
  tree = render();
  const roomButton = () => find(tree, n => n.type === 'button' && n.props.children?.props?.children === 'Room A');
  roomButton().props.onClick();
  tree = render();
  assert.equal(find(tree, n => n.type === PropertyImagesEditor).props.property.id, 'p1');
  global.window.confirm = () => true;
  roomButton().props.onClick();
  tree = render();
  const editor = find(tree, n => n.type === PropertyImagesEditor);
  assert.equal(editor.props.property.id, galleryFolders(property, units)[1].id);
  assert.equal(find(tree, n => n.type === 'a').props.href, galleryLink(editor.props.property));
  editor.props.onSavingChange(true);
  tree = render();
  assert.equal(roomButton().props.disabled, true);
});

test('vault property directory automatically exposes room folders with no tenant details', async t => {
  const previous = process.env.VAULT_API_KEY;
  process.env.VAULT_API_KEY = 'test-key';
  t.after(() => { if (previous === undefined) delete process.env.VAULT_API_KEY; else process.env.VAULT_API_KEY = previous; });
  const { GET } = loadTs('app/api/vault/properties/route.ts', {
    '@/lib/db': { getProperties: async () => [property], getUnits: async () => units.map(u => ({ ...u, tenantName: 'Private name' })) },
  });
  const unauthorized = await GET({ headers: { get: () => null } });
  assert.equal(unauthorized.status, 401);
  const response = await GET({ headers: { get: () => 'Bearer test-key' } });
  const data = await response.json();
  assert.equal(data.properties.length, 3);
  assert.equal(data.properties[1].id, galleryFolders(property, units)[1].id);
  assert.equal(data.properties[1].name, 'Paramount — Room A');
  assert.ok(!JSON.stringify(data).includes('Private name'));
});
