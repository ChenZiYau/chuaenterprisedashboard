const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { buildReceiptData, renderReceiptHtml } = loadTs('lib/receipt.ts');

const entry = { rental: 313.33, electricity: 25.50, other: 10, year: 2026, month: 11,
  paymentDate: '2026-11-01', method: 'bank_transfer' };

test('receipt itemizes saved rent, electricity and other charges in preview and print', () => {
  const data = buildReceiptData(entry, undefined, undefined, 'John', 'INV-1');
  assert.equal(data.rental, 313.33);
  assert.equal(data.electricity, 25.50);
  assert.equal(data.other, 10);
  assert.equal(data.sum.toFixed(2), '348.83');
  for (const autoPrint of [false, true]) {
    const html = renderReceiptHtml(data, autoPrint);
    for (const [label, amount] of [['Rent', '313.33'], ['Electricity', '25.50'], ['Other charges', '10.00'], ['Total', '348.83']]) {
      assert.match(html, new RegExp('>' + label + '</td>\\s*<td[^>]*>RM ' + amount.replace('.', '\\.') + '</td>'));
    }
  }
});

test('receipt uses saved prorated rent instead of the room monthly rate and shows zero extras', () => {
  const data = buildReceiptData({ ...entry, electricity: null, other: null }, undefined,
    { rentalRate: 900 }, 'John', 'INV-2');
  assert.equal(data.rental, 313.33);
  assert.equal(data.sum, 313.33);
  assert.equal(data.electricity, 0);
  assert.equal(data.other, 0);
  const html = renderReceiptHtml(data, false);
  assert.equal((html.match(/RM 0\.00/g) || []).length, 2);
  assert.ok(!html.includes('900.00'));
});
