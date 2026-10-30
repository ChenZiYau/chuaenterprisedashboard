// Run after npm run build. All database requests go to an in-memory local
// PostgREST double; test credentials override .env. No production writes.
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mockDb } = require('../tests/helpers/mock-db.cjs');

async function main() {
  require('node:fs').mkdirSync('.tmp', { recursive: true });
  const { default: puppeteer } = await import('puppeteer-core');
  const db = mockDb({
    properties: [{ id: 'p1', name: 'Smoke House', slug: 'smoke-house', short_name: 'Smoke', rental_model: 'room_rental', city: 'KL' }],
    units: [{ id: 'u1', property_id: 'p1', name: 'Room A', sort_order: 0, tenant_name: 'Smoke Tenant', is_rented: true, rental_rate: 800, deposit_months: 2, deposit_amount: 1600, electricity_free_units: 45 }],
    tenants: [{ id: 't1', name: 'Smoke Tenant', unit_id: 'u1', ic_number: 'TEST', phone: '0123456789', lease_start: '2026-01-01', lease_end: '2027-12-31' }],
    revenue: [], expenses: [],
  });
  const galleries = new Map();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
  const backend = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/fixture.png') { res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' }); res.end(png); return; }
      if (url.pathname.startsWith('/api/images/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/images/'.length));
        if (req.method === 'PUT') { const chunks = []; for await(const c of req) chunks.push(c); galleries.set(id, JSON.parse(Buffer.concat(chunks)).images); }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ propertyId: id, images: galleries.get(id) || [] })); return;
      }
      if (url.pathname === '/api/upload') { for await (const c of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ url: 'http://127.0.0.1:' + backend.address().port + '/fixture.png' })); return; }
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
  const port = Number(process.env.SMOKE_PORT ?? 3227);
  const base = `http://127.0.0.1:${port}`;
  const secret = 'smoke-test-only-session-secret-at-least-32-characters';
  let logs = '', browser;
  const server = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: path.resolve('.'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', SUPABASE_URL: backendUrl, NEXT_PUBLIC_SUPABASE_URL: backendUrl,
      SUPABASE_SERVICE_ROLE_KEY: 'local-smoke-test-key', SESSION_SECRET: secret, VAULT_URL: backendUrl, VAULT_API_KEY: 'local-test-vault-key' },
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
      if (url.startsWith(base) || url.startsWith(backendUrl) || url.startsWith('data:') || url.startsWith('blob:')) request.continue();
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


    async function noOverflow(label) {
      const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('main *')].filter(e => { const r=e.getBoundingClientRect(); return r.right > innerWidth+1 && !e.closest('.overflow-x-auto'); }).slice(0,8).map(e=>({tag:e.tagName, cls:e.className})) }));
      assert.ok(result.scroll <= result.width + 1, label + ': ' + JSON.stringify(result));
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 844, isMobile: width < 768, hasTouch: width < 768 });
      for (const route of ['/properties','/tenants','/revenue','/expenses','/invoices','/deposits','/share','/settings','/properties/p1']) {
        await page.goto(base + route, { waitUntil: 'networkidle0' });
        await noOverflow(width + ' ' + route);
      }
      await clickText('Images');
      await page.waitForSelector('input[type="file"]');
      await noOverflow(width + ' Images');
      console.log('PASS: dashboard routes and Images fit ' + width + 'px');
    }
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await page.goto(base + '/properties/p1', {waitUntil:'networkidle0'});
    await clickText('Images');
    await page.waitForSelector('input[type="file"]');
    await clickText('Room A');
    await page.waitForSelector('input[type="file"]');
    await page.evaluate(() => {
      const input=document.querySelector('input[type="file"]');
      const data=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=');
      const transfer=new DataTransfer(); transfer.items.add(new File([Uint8Array.from(data,c=>c.charCodeAt(0))], 'room.png', {type:'image/png'}));
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.type('input[id^="title-"]', 'Room-only photo');
    await clickText('Crop / Resize');
    await noOverflow('Mobile crop dialog');
    await page.click('[aria-label="Close"]');
    await clickText('Save all');
    await page.waitForFunction(() => document.body.textContent.includes('Gallery saved'));
    assert.equal(galleries.get('room~p1~u1').length,1);
    assert.equal(galleries.get('p1'), undefined);
    assert.ok((await page.$eval('a[target="_blank"]',a=>a.href)).endsWith('/p/room~p1~u1'));
    await clickText('Property photos');
    await page.waitForFunction(() => document.querySelector('input[id^="title-"]')?.value === '');
    await clickText('Room A');
    await page.waitForFunction(() => document.querySelector('input[id^="title-"]')?.value === 'Room-only photo');
    await page.reload({waitUntil:'networkidle0'}); await clickText('Images'); await clickText('Room A');
    await page.waitForFunction(() => document.querySelector('input[id^="title-"]')?.value === 'Room-only photo');
    console.log('PASS: room upload/save/reload stays separate from property folder and uses room share link');
    await page.goto(base + '/share', {waitUntil:'networkidle0'});
    await page.select('select', 'room~p1~u1');
    assert.ok((await page.$eval('a[title="Preview what customers see"]',a=>a.href)).endsWith('/p/room~p1~u1'));
    await page.waitForFunction(() => document.body.innerText.includes('1 photo'));
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedGalleryLink=text; } } }); });
    await clickText('Copy Link');
    await page.waitForFunction(() => window.copiedGalleryLink?.endsWith('/p/room~p1~u1'));
    await noOverflow('Mobile room sharing');
    console.log('PASS: Share room selector, photo count, preview and Copy Link agree');
    await page.goto(base + '/revenue', {waitUntil:'networkidle0'});
    await clickText('+ Enter Revenue');
    await page.waitForSelector('[role="dialog"]');
    await noOverflow('Mobile Quick Entry');
    const titleWidth=await page.$eval('#quick-entry-title',e=>e.getBoundingClientRect().width);
    assert.ok(titleWidth > 100, 'Quick Entry property selector must remain usable');
    await new Promise(resolve => setTimeout(resolve, 300));
    await page.screenshot({path:'.tmp/mobile-quick-entry.png',fullPage:true});
    assert.deepEqual(errors, []);
  } catch(error) { console.error(logs.slice(-5000)); throw error; }
  finally { await browser?.close(); server.kill(); backend.closeAllConnections(); await new Promise(resolve=>backend.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
