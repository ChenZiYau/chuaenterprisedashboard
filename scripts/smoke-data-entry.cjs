// Run after npm run build. All database requests go to an in-memory local
// PostgREST double; test credentials override .env. No production writes.
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mockDb } = require('../tests/helpers/mock-db.cjs');

async function main() {
  const { default: puppeteer } = await import('puppeteer-core');
  const db = mockDb({
    properties: [{ id: 'p1', name: 'Smoke House', slug: 'smoke-house', short_name: 'Smoke', rental_model: 'room_rental', city: 'KL' }],
    units: [{ id: 'u1', property_id: 'p1', name: 'Room A', sort_order: 0, tenant_name: 'Smoke Tenant', is_rented: true, rental_rate: 800, deposit_months: 2, deposit_amount: 1600, electricity_free_units: 45 }],
    tenants: [{ id: 't1', name: 'Smoke Tenant', unit_id: 'u1', ic_number: 'TEST', phone: '0123456789', lease_start: '2026-01-01', lease_end: '2027-12-31' }],
    revenue: [], expenses: [],
  });
  const backend = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      assert.ok(url.pathname.startsWith('/rest/v1/'));
      const table = url.pathname.slice('/rest/v1/'.length);
      assert.ok(Object.hasOwn(db.state, table), `Unknown table ${table}`);
      let query = db.supabaseAdmin.from(table);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      if (req.method === 'POST') query = query.insert(body);
      if (req.method === 'PATCH') query = query.update(body);
      if (req.method === 'DELETE') query = query.delete();
      for (const [key, value] of url.searchParams) {
        if (['select', 'columns', 'order', 'offset', 'limit'].includes(key)) continue;
        if (value.startsWith('eq.')) query = query.eq(key, value.slice(3));
        else if (value.startsWith('neq.')) query = query.neq(key, value.slice(4));
        else if (value.startsWith('ilike.')) query = query.ilike(key, value.slice(6));
        else if (value.startsWith('in.(')) query = query.in(key, value.slice(4, -1).split(','));
        else throw new Error(`Unsupported mock filter ${key}`);
      }
      for (const part of (url.searchParams.get('order') ?? '').split(',').filter(Boolean)) {
        const [key, direction] = part.split('.');
        query = query.order(key, { ascending: direction !== 'desc' });
      }
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      query = query.range(offset, offset + limit - 1);
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) query = query.single();
      const result = await query;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.data));
    } catch (error) {
      console.error('Local mock database:', error.message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: error.message }));
    }
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const backendUrl = `http://127.0.0.1:${backend.address().port}`;
  const port = Number(process.env.SMOKE_PORT ?? 3217);
  const base = `http://127.0.0.1:${port}`;
  const secret = 'smoke-test-only-session-secret-at-least-32-characters';
  let logs = '', browser;
  const server = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: path.resolve('.'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', SUPABASE_URL: backendUrl, NEXT_PUBLIC_SUPABASE_URL: backendUrl,
      SUPABASE_SERVICE_ROLE_KEY: 'local-smoke-test-key', SESSION_SECRET: secret },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (data) => { logs += data; });
  server.stderr.on('data', (data) => { logs += data; });
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/login`)).ok) break; } catch {}
      if (i === 99) throw new Error(`Local server did not start: ${logs}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const login = await (await fetch(`${base}/login`)).text();
    assert.equal(login.includes('Smoke Tenant'), false);
    assert.equal(db.calls.length, 0, 'Anonymous login must not query private tables');
    assert.equal((await fetch(`${base}/api/revenue`, { method: 'POST', body: '{}' })).status, 401);
    console.log('PASS: real server login privacy and API session guard');

    browser = await puppeteer.launch({ executablePath: process.env.SMOKE_BROWSER ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')) request.continue();
      else request.abort();
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', async (response) => {
      if (response.url().startsWith(`${base}/api/`) && response.status() >= 400) {
        console.error('Failed test API response:', response.status(), response.url(), await response.text());
      }
    });
    const exp = String(Math.floor(Date.now() / 1000) + 3600);
    const token = `${exp}.${createHmac('sha256', secret).update(`ce-session:${exp}`).digest('hex')}`;
    await browser.setCookie({ name: 'ce_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' });
    async function clickText(text) {
      await page.waitForFunction((label) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === label && !b.disabled), {}, text);
      await page.evaluate((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label && !b.disabled).click(), text);
    }
    async function fill(selector, value) {
      await page.focus(selector);
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type(selector, value);
    }
    async function waitRow(table, amount) {
      await page.waitForFunction((text) => document.querySelector('tbody')?.textContent.includes(text), {}, amount);
      assert.equal(db.state[table].length, 1);
    }

    await page.goto(`${base}/revenue`, { waitUntil: 'networkidle0' });
    await clickText('+ Enter Revenue');
    await page.waitForSelector('[role="dialog"] textarea');
    await page.type('[role="dialog"] textarea', 'Saved by browser smoke');
    await clickText('Save only');
    await waitRow('revenue', '800.00');
    assert.equal(db.state.revenue[0].notes, 'Saved by browser smoke');
    await page.reload({ waitUntil: 'networkidle0' });
    await waitRow('revenue', '800.00');
    console.log('PASS: revenue form save, refreshed ledger, and reload persistence');

    await page.click('button[aria-label="Revenue actions"]');
    await clickText('Edit');
    await page.waitForSelector('[role="dialog"]');
    const rentalSelector = '[role="dialog"] input[type="number"]';
    await fill(rentalSelector, '875');
    await clickText('Save only');
    await waitRow('revenue', '875.00');
    assert.equal(db.state.revenue[0].rental_amount, 875);
    console.log('PASS: revenue Edit updates the existing row');

    await page.goto(`${base}/expenses`, { waitUntil: 'networkidle0' });
    await clickText('+ Add Expense');
    await page.waitForSelector('[role="dialog"] input[type="number"]');
    await fill('[role="dialog"] input[type="number"]', '123');
    await clickText('Save Expenses');
    await waitRow('expenses', '123.00');
    await page.click('button[aria-label="Expense actions"]');
    await clickText('Edit');
    await page.waitForSelector('[role="dialog"] input[type="number"]');
    await fill('[role="dialog"] input[type="number"]', '150');
    await clickText('Update Expense');
    await waitRow('expenses', '150.00');
    assert.equal(db.state.expenses[0].amount, 150);
    console.log('PASS: expense create and Edit without duplication');

    await page.goto(`${base}/deposits`, { waitUntil: 'networkidle0' });
    await clickText('Edit');
    await fill('input[step="0.01"]', '1700');
    await clickText('Save');
    await page.waitForFunction(() => document.body.textContent.includes('1,700.00') && !document.querySelector('input[step="0.01"]'));
    assert.equal(db.state.units[0].deposit_amount, 1700);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.ok((await page.content()).includes('1,700.00'));
    console.log('PASS: deposit save, totals, and reload persistence');

    await page.goto(`${base}/properties/p1`, { waitUntil: 'networkidle0' });
    await clickText('Edit');
    await page.waitForSelector('input[placeholder="e.g. Platinum Suites"]');
    await fill('input[placeholder="e.g. Platinum Suites"]', 'Smoke House Updated');
    await clickText('Save Changes');
    await page.waitForFunction(() => !document.querySelector('#add-property-title') && document.body.textContent.includes('Smoke House Updated'));
    assert.equal(db.state.units[0].deposit_amount, 1700);
    assert.equal(db.state.units[0].electricity_free_units, 45);
    assert.equal(db.state.units[0].tenant_name, 'Smoke Tenant');
    console.log('PASS: property edit preserves saved deposit, allowance, and occupancy');

    await page.goto(`${base}/tenants`, { waitUntil: 'networkidle0' });
    await page.click('button[aria-label="Smoke Tenant actions"]');
    await clickText('Edit');
    await page.waitForSelector('input[placeholder="e.g. Lim Wei Jian"]');
    await fill('input[placeholder="e.g. Lim Wei Jian"]', 'Smoke Tenant Updated');
    await clickText('Save Changes');
    await page.waitForFunction(() => !document.querySelector('#add-tenant-title') && document.body.textContent.includes('Smoke Tenant Updated'));
    assert.equal(db.state.tenants[0].name, 'Smoke Tenant Updated');
    assert.equal(db.state.units[0].tenant_name, 'Smoke Tenant Updated');
    console.log('PASS: tenant Edit saves and synchronizes room occupancy');

    await page.goto(`${base}/invoices`, { waitUntil: 'networkidle0' });
    await clickText('Gen');
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('Generated'));
    assert.equal(db.state.revenue[0].invoice_generated, true);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('Generated'));
    console.log('PASS: invoice generation persists across reload');

    await page.goto(`${base}/expenses`, { waitUntil: 'networkidle0' });
    await page.click('button[aria-label="Expense actions"]');
    await clickText('Delete');
    await page.waitForFunction(() => !document.querySelector('tbody')?.textContent.includes('150.00'));
    assert.equal(db.state.expenses.length, 0);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(db.state.expenses.length, 0);
    console.log('PASS: expense Delete persists and removes the displayed row');

    await page.goto(`${base}/invoices`, { waitUntil: 'networkidle0' });
    await page.click('button[aria-label="Invoice actions"]');
    await clickText('Delete');
    await clickText('Delete revenue entry');
    await page.waitForFunction(() => !document.querySelector('tbody')?.textContent.includes('875.00'));
    assert.equal(db.state.revenue.length, 0);
    console.log('PASS: confirmed invoice deletion removes its revenue record');

    await page.goto(`${base}/properties`, { waitUntil: 'networkidle0' });
    await fill('input[type="search"]', 'no matching property');
    await page.waitForFunction(() => !document.querySelector('a[aria-label="Open Smoke House Updated"]'));
    await fill('input[type="search"]', 'Smoke');
    await page.waitForSelector('a[aria-label="Open Smoke House Updated"]');
    await page.goto(`${base}/settings`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Dark')).click());
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    console.log('PASS: property search and persisted theme controls');
    assert.deepEqual(errors, [], 'Browser must not report uncaught application errors');
  } catch (error) {
    console.error(logs.slice(-6000));
    console.error('Mock financial rows:', JSON.stringify({ revenue: db.state.revenue, expenses: db.state.expenses }));
    const pages = await browser?.pages();
    if (pages?.length) console.error('Browser text:', await pages.at(-1).evaluate(() => document.body.innerText));
    throw error;
  } finally {
    await browser?.close();
    server.kill();
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
