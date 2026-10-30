// Uses a temporary local-only fixture page. No live vault or dashboard calls.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

async function main() {
  fs.mkdirSync('.tmp', { recursive: true });
  const root = path.resolve(process.argv[2] || '../chua-image-vault');
  const fixtureDir = path.join(root, 'app/mobile-gallery-audit');
  const fixture = path.join(fixtureDir, 'page.tsx');
  assert.ok(fixture.startsWith(root + path.sep));
  assert.ok(!fs.existsSync(fixtureDir), 'Do not overwrite an existing route');
  const image = color => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/></svg>`);
  const images = ['red','blue','green'].map((color,i)=>({id:String(i),title:`Room photo ${i+1}`,description:'Room photo description '.repeat(10),imageUrl:image(color),originalUrl:image(color),updatedAt:''}));
  fs.mkdirSync(fixtureDir);
  fs.writeFileSync(fixture, `import PublicGallery from '@/components/PublicGallery';\nexport default function Page(){return <PublicGallery property={{id:'test',name:'Paramount Garden — Room D',shortName:'Room D',city:'KL'}} images={${JSON.stringify(images)}} />;}`);
  const { default: puppeteer } = await import('puppeteer-core');
  const base='http://127.0.0.1:3228';
  let logs='', browser;
  const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','-H','127.0.0.1','-p','3228'],{
    cwd:root,windowsHide:true,env:{...process.env,MAIN_APP_URL:'http://127.0.0.1:1',VAULT_API_KEY:'local-only-test-key',BLOB_READ_WRITE_TOKEN:'local-only-test-token'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>{logs+=d;}); server.stderr.on('data',d=>{logs+=d;});
  try {
    for(let i=0;i<120;i++){try{if((await fetch(base+'/mobile-gallery-audit')).ok)break;}catch{} if(i===119)throw Error(logs);await new Promise(r=>setTimeout(r,250));}
    browser=await puppeteer.launch({executablePath:process.env.SMOKE_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());
    const client=await page.createCDPSession();
    async function swipe(x1,x2,y) {
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y}]});
      for(let i=1;i<=8;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/8,y}]});await new Promise(r=>setTimeout(r,20));}
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    for(const width of [320,390,768,1440]){
      await page.setViewport({width,height:844,isMobile:width<768,hasTouch:true});
      await page.goto(base+'/mobile-gallery-audit',{waitUntil:'networkidle0'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'Gallery overflow at '+width);
      await page.click('button[aria-label="Open Room photo 1 fullscreen"]');
      await page.waitForSelector('[role="dialog"]');
      const box=await page.$eval('[role="dialog"] img',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
      const y=box.y+box.height/2;
      await swipe(width*.75,width*.25,y);
      await page.waitForFunction(()=>document.querySelector('[role="dialog"] img')?.getAttribute('alt')==='Room photo 2');
      await swipe(width*.25,width*.75,y);
      await page.waitForFunction(()=>document.querySelector('[role="dialog"] img')?.getAttribute('alt')==='Room photo 1');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
      if(width===390) await page.screenshot({path:'.tmp/vault-mobile-lightbox.png'});
      await page.click('[role="dialog"] button[aria-label="Next photo"]');
      await page.waitForFunction(()=>document.querySelector('[role="dialog"] img')?.getAttribute('alt')==='Room photo 2');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(()=>document.querySelector('[role="dialog"] img')?.getAttribute('alt')==='Room photo 3');
      await page.click('[role="dialog"] button[aria-label="Close"]');
      assert.equal(await page.$('[role="dialog"]'),null);
      assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
      console.log('PASS: '+width+'px layout, native touch swipe both directions, arrows, keyboard, close and scroll restore');
    }
    assert.deepEqual(errors,[]);
  } catch(error){console.error(logs.slice(-4000));throw error;}
  finally {await browser?.close();server.kill();fs.unlinkSync(fixture);fs.rmdirSync(fixtureDir);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
