const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { mockDb } = require('./helpers/mock-db.cjs');

const revenue = { propertyId: 'p1', unitId: 'u1', month: 10, year: 2026, paymentDate: '2026-10-14', rental: 800,
  electricityReading: 2000, electricity: 25, other: 5, method: 'cash', status: 'paid', invoiceGenerated: false, invoiceNumber: 'INV-1' };
const expense = { propertyId: 'p1', unitId: null, month: 10, year: 2026, expenseDate: '2026-10-14', amount: 120,
  category: 'maintenance', description: 'Repair', type: 'irregular' };
const request = (body) => ({ json: async () => body });
const params = (id) => ({ params: Promise.resolve({ id }) });
function fixture(options = {}) {
  const db = mockDb({ properties: [{ id: 'p1' }, { id: 'p2' }], units: [{ id: 'u1', property_id: 'p1' }], revenue: [], expenses: [] }, options);
  return { ...db,
    revenueCreate: loadTs('app/api/revenue/route.ts', db.mocks).POST,
    revenueItem: loadTs('app/api/revenue/[id]/route.ts', db.mocks),
    expenseCreate: loadTs('app/api/expenses/route.ts', db.mocks).POST,
    expenseItem: loadTs('app/api/expenses/[id]/route.ts', db.mocks),
  };
}

test('revenue create persists amounts, notes, custom method and returns a server ID', async () => {
  const db = fixture();
  const res = await db.revenueCreate(request({ ...revenue, method: 'other', customPaymentMethod: 'DuitNow', notes: 'October rent' }));
  assert.equal(res.status, 200);
  const { entry } = await res.json();
  assert.equal(entry.id, 'saved-1');
  assert.equal(entry.notes, 'October rent');
  assert.equal(entry.method, 'other');
  assert.equal(entry.customPaymentMethod, 'DuitNow');
  assert.equal(db.state.revenue[0].total_amount, 830);
});

test('revenue edits update the selected row without resetting generated invoices', async () => {
  const db = fixture();
  const { entry } = await (await db.revenueCreate(request({ ...revenue, invoiceGenerated: true }))).json();
  const res = await db.revenueItem.PUT(request({ ...revenue, rental: 900, invoiceNumber: 'wrong' }), params(entry.id));
  assert.equal(res.status, 200);
  const saved = (await res.json()).entry;
  assert.equal(saved.rental, 900);
  assert.equal(saved.invoiceGenerated, true);
  assert.equal(saved.invoiceNumber, 'INV-1');
  assert.equal(db.state.revenue.length, 1);
  assert.equal(db.state.revenue[0].total_amount, 930);
});

test('saving the same billing period sequentially updates rather than duplicates', async () => {
  const db = fixture();
  await db.revenueCreate(request(revenue));
  await db.revenueCreate(request({ ...revenue, rental: 950 }));
  assert.equal(db.state.revenue.length, 1);
  assert.equal(db.state.revenue[0].rental_amount, 950);
});

test('invoice generation changes only invoice_generated and survives rereading', async () => {
  const db = fixture();
  const { entry } = await (await db.revenueCreate(request(revenue))).json();
  const before = structuredClone(db.state.revenue[0]);
  const res = await db.revenueItem.PATCH(request({ invoiceGenerated: true }), params(entry.id));
  assert.equal(res.status, 200);
  assert.deepEqual(db.state.revenue[0], { ...before, invoice_generated: true });
  const retrieved = await loadTs('lib/db.ts', db.mocks).getRevenue();
  assert.equal(retrieved[0].invoiceGenerated, true);
  assert.equal(retrieved[0].rental, 800);
  assert.equal((await db.revenueItem.PATCH(request({ invoiceGenerated: true, rental: 1 }), params(entry.id))).status, 400);
});

test('invalid revenue types, periods, dates and amounts are rejected before database access', async () => {
  const db = fixture();
  for (const body of [null, {}, { ...revenue, rental: -1 }, { ...revenue, rental: Infinity },
    { ...revenue, rental: '800' }, { ...revenue, month: 13 }, { ...revenue, electricity: -1 },
    { ...revenue, paymentDate: '2026-02-30' }, { ...revenue, notes: {} }]) {
    assert.equal((await db.revenueCreate(request(body))).status, 400);
  }
  assert.equal(db.calls.length, 0);
});

test('cross-property unit assignments and changing revenue identity are rejected', async () => {
  const db = fixture();
  assert.equal((await db.revenueCreate(request({ ...revenue, propertyId: 'p2' }))).status, 400);
  const { entry } = await (await db.revenueCreate(request(revenue))).json();
  assert.equal((await db.revenueItem.PUT(request({ ...revenue, month: 9 }), params(entry.id))).status, 400);
  assert.equal(db.state.revenue.length, 1);
  assert.equal(db.state.revenue[0].month, 10);
});

test('expense creation works for a vacant property and editing updates exactly one record', async () => {
  const db = fixture();
  const res = await db.expenseCreate(request({ entries: [expense, { ...expense, amount: 50 }] }));
  assert.equal(res.status, 200);
  const { entries } = await res.json();
  const edit = await db.expenseItem.PUT(request({ ...entries[0], amount: 180 }), params(entries[0].id));
  assert.equal(edit.status, 200);
  assert.equal(db.state.expenses.length, 2);
  assert.deepEqual(db.state.expenses.map((row) => row.amount), [180, 50]);
  const retrieved = await loadTs('lib/db.ts', db.mocks).getExpenses();
  assert.equal(retrieved.find((row) => row.id === entries[0].id).amount, 180);
});

test('expense batch rejects the entire request if one row is invalid', async () => {
  const db = fixture();
  const res = await db.expenseCreate(request({ entries: [expense, { ...expense, amount: -1 }] }));
  assert.equal(res.status, 400);
  assert.equal(db.calls.length, 0);
  assert.equal(db.state.expenses.length, 0);
});

test('missing rows and database failure never report successful financial edits', async () => {
  const db = fixture();
  assert.equal((await db.revenueItem.PUT(request(revenue), params('missing'))).status, 404);
  assert.equal((await db.expenseItem.PUT(request(expense), params('missing'))).status, 404);
  assert.equal((await db.revenueItem.PATCH(request({ invoiceGenerated: true }), params('missing'))).status, 404);
  const failing = fixture({ fail: () => true });
  assert.equal((await failing.expenseCreate(request({ entries: [expense] }))).status, 500);
  assert.equal((await failing.revenueItem.PATCH(request({ invoiceGenerated: true }), params('x'))).status, 500);
});
