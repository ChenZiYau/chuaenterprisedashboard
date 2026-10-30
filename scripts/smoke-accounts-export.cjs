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
    revenue: [{ id:'r1',property_id:'p1',unit_id:'u1',rental_amount:600,electricity_amount:20,other_charges_amount:5,payment_date:'2026-01-15',year:2026,month:1,payment_method:'cash',payment_status:'paid',invoice_number:'INV1',invoice_generated:false }], expenses: [{id:'e1',property_id:'p1',unit_id:null,expense_date:'2026-01-15',year:2026,month:1,category:'maintenance',amount:3635,description:'Repairs'}],
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
  const port = Number(process.env.SMOKE_PORT ?? 3237);
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


    const fs=require('node:fs');
    const ExcelJS=require('exceljs');
    const downloadDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'accounts-export-'));
    const cdp=await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    for(const [route,tab,source] of [['/revenue',null,'revenue'],['/expenses',null,'expenses'],['/properties/p1','Revenue','revenue'],['/properties/p1','Expenses','expenses']]) {
      await page.goto(base+route,{waitUntil:'networkidle0'});
      if(tab) await clickText(tab);
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Export Excel accounts'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile export layout overflows');
      await clickText('Export Excel accounts');
      let file;
      for(let i=0;i<150;i++){ file=fs.readdirSync(downloadDir).find(f=>f.endsWith('.xlsx'));if(file)break;await new Promise(r=>setTimeout(r,100)); }
      assert.ok(file,'Excel file was not downloaded');
      const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(downloadDir,file));
      assert.equal(book.worksheets.length,6);
      assert.equal(book.getWorksheet('Property P&L').getRow(2).getCell(5).value,-3010);
      assert.equal(book.getWorksheet('Displayed rows').getRow(2).getCell(source==='revenue'?9:8).value,source==='revenue'?625:3635);
      assert.equal(book.getWorksheet('Report info').getRow(2).getCell(2).value,'2026-01-01');
      assert.equal(book.getWorksheet('Report info').getRow(3).getCell(2).value,'2026-12-31');
      fs.unlinkSync(path.join(downloadDir,file));
      console.log('PASS: mobile Excel download and workbook amounts from '+route+' '+(tab||''));
    }
    fs.rmdirSync(downloadDir);
    assert.deepEqual(errors,[]);
  } catch(error){console.error(logs.slice(-4000));throw error;}
  finally{await browser?.close();server.kill();backend.closeAllConnections();await new Promise(resolve=>backend.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
