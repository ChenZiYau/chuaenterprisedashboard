const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { loadTs } = require('./helpers/load-ts.cjs');
const { buildAccountsWorkbook } = loadTs('lib/accountsExport.ts');
const property = { id: 'p1', name: 'Paramount' };
const r = { id: 'r1', propertyId: 'p1', unitId: 'u1', rental: 600, electricity: 20.15, other: 0.1, paymentDate: '2026-01-01', year: 2026, month: 1, method: 'cash', status: 'paid', invoiceNumber: 'INV1' };
const e = { id: 'e1', propertyId: 'p1', unitId: null, expenseDate: '2026-01-31', year: 2026, month: 1, category: 'maintenance', amount: 3635, description: '=HYPERLINK("https://example.com")' };
const input = { properties: [property], units: [{ id: 'u1', name: 'Room A', tenantName: 'John' }], revenue: [r], expenses: [e], fromDate: '2026-01-01', toDate: '2026-01-31', displayed: [r], source: 'revenue', filters: 'All rooms' };

test('accounts includes both boundary dates, expenses, cents and negative property P/L', () => {
  const book = buildAccountsWorkbook({ ...input, revenue: [r, { ...r, id: 'outside', paymentDate: '2025-12-31' }, { ...r, id: 'next', paymentDate: '2026-02-01' }, { ...r, id: 'other', propertyId: 'p2' }] });
  assert.equal(book.getWorksheet('Revenue details').rowCount, 2);
  assert.equal(book.getWorksheet('Expense details').rowCount, 2);
  assert.deepEqual(book.getWorksheet('Property P&L').getRow(2).values.slice(1), ['Paramount', 620.25, 0, 3635, -3014.75, -3014.75]);
  assert.equal(book.getWorksheet('Room totals').getRow(3).getCell(2).value, 'Whole property');
});

test('scheduled rent is itemised but excluded from recorded profit', () => {
  const book = buildAccountsWorkbook({ ...input, revenue: [r, { ...r, id: 'scheduled', unitId: 'u2', scheduled: true, rental: 800, electricity: 0, other: 0 }] });
  assert.deepEqual(book.getWorksheet('Property P&L').getRow(2).values.slice(2), [620.25, 800, 3635, -3014.75, -2214.75]);
});

test('exports every displayed row beyond pagination without narrowing complete accounts', () => {
  const rows = Array.from({length: 15}, (_, i) => ({...r, id: 'r'+i}));
  const book = buildAccountsWorkbook({ ...input, revenue: rows, displayed: rows.slice(0,12) });
  assert.equal(book.getWorksheet('Displayed rows').rowCount, 13);
  assert.equal(book.getWorksheet('Revenue details').rowCount, 16);
  assert.equal(book.getWorksheet('Expense details').rowCount, 2);
});

test('xlsx roundtrip preserves numeric amounts, text safety, grouping and expense displayed rows', async () => {
  const book = buildAccountsWorkbook({ ...input, source: 'expenses', displayed: [e], properties: [{id:'p2',name:'Zeta'},property], revenue: [{...r,propertyId:'p2',id:'z'},r] });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await book.xlsx.writeBuffer());
  assert.equal(restored.worksheets.length, 6);
  assert.equal(restored.getWorksheet('Revenue details').getRow(2).getCell(1).value, 'Paramount');
  assert.equal(restored.getWorksheet('Revenue details').getRow(2).getCell(9).value, 620.25);
  const description = restored.getWorksheet('Displayed rows').getRow(2).getCell(6);
  assert.equal(description.type, ExcelJS.ValueType.String);
  assert.equal(description.value, e.description);
  assert.equal(restored.getWorksheet('Displayed rows').getRow(2).getCell(8).value, 3635);
});

test('empty periods remain valid and reversed dates are rejected', () => {
  const book = buildAccountsWorkbook({...input, revenue:[], expenses:[], displayed:[]});
  assert.equal(book.getWorksheet('Property P&L').getRow(2).getCell(5).value, 0);
  assert.throws(() => buildAccountsWorkbook({...input, fromDate:'2026-02-01'}), /Start date/);
});
