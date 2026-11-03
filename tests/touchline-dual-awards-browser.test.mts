import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {chromium, expect, type Locator} from '@playwright/test';
import {bundleIsolatedBrowserFixture} from './helpers/touchline-isolated-browser-bundle.mts';

const root=path.resolve(import.meta.dirname,'..');
const enabled=process.env.TOUCHLINE_RUN_DUAL_AWARDS_BROWSER_TESTS==='1';
test('same published card shows Golden Ball and Golden Boot in normal and real zoom; goals revocation preserves Ball', {skip:!enabled,timeout:90_000},async()=>{
 const bundle=bundleIsolatedBrowserFixture({entryPath:'tests/fixtures/DualAwardBrowserFixture.tsx',cssPrefix:'dualaward',
  requiredSources:['components/touchline/fantasy/TouchlineGameweekCard.tsx','components/touchline/cards/TouchlineEliteExactCard.tsx',
   'components/touchline/cards/TouchlineCardZoom.tsx','lib/touchlineArena/golden-boot-client.ts','lib/touchlineArena/card-goals-leadership.ts'],
  mountScript:'flushSync(()=>root.render(React.createElement(loadEntry().default)));'});
 const output=path.join(root,'artifacts/local-card-integrity-20261101/dual-awards');mkdirSync(output,{recursive:true});
 const publicRoot=realpathSync(path.join(root,'public')),origin='https://dual-awards.test';
 const css=readFileSync(path.join(root,'node_modules/tailwindcss/preflight.css'),'utf8')+readFileSync(path.join(root,'app/globals.css'),'utf8').replace(/^@(import|source)[^;]*;\s*/gm,'')+bundle.css;
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(8000);
  const errors:string[]=[],forbidden:string[]=[],assets:string[]=[],socialReads:string[]=[];const geometry:unknown[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===origin&&route.request().method()==='GET'&&url.pathname==='/api/touchline/players/990001/social'){
    socialReads.push(url.pathname);return route.fulfill({status:503,json:{error:'Isolated social boundary; no authenticated session'}});
   }
   if(url.origin!==origin||route.request().method()!=='GET'||url.pathname.startsWith('/api/')){
    forbidden.push(`${route.request().method()} ${url.pathname}`);return route.abort();
   }
   if(url.pathname==='/clubowner')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="background:#07120e"><div id="root"></div></body></html>`});
   const file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));
   if(file.startsWith(publicRoot+path.sep)&&existsSync(file)&&statSync(file).isFile()&&realpathSync(file).startsWith(publicRoot+path.sep)){
    assets.push(url.pathname);return route.fulfill({path:file});
   }
   return route.abort();
  });
  await page.goto(origin+'/clubowner');await page.addScriptTag({content:`(()=>{${bundle.script}})()`});
  const normal=page.locator('[data-dual-award-card="true"]');
  async function both(scope:Locator,label:string){
   const card=scope.locator('[data-card-golden-ball="true"][data-card-golden-boot="true"]');await expect(card).toHaveCount(1);
   const ball=card.locator('[data-touchline-player-golden-ball="true"]'),boot=card.locator('[data-touchline-golden-boot="true"]');
   for(const award of [ball,boot]){
    await expect(award).toHaveCount(1);await expect(award).toBeVisible();
    await expect.poll(()=>award.evaluate(node=>{const img=node as HTMLImageElement;return img.complete&&img.naturalWidth>0;})).toBe(true);
   }
   const inspect=async()=>({ball:await ball.boundingBox(),boot:await boot.boundingBox()});
   await expect.poll(async()=>{const g=await inspect();return !!g.ball&&!!g.boot&&g.ball.x+g.ball.width<=g.boot.x+1;}).toBe(true);
   const g=await inspect();assert.ok(g.ball&&g.boot);
   const viewport=page.viewportSize()!;
   for(const box of [g.ball,g.boot])assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,`${label}: award outside viewport`);
   assert.equal(await ball.evaluate(node=>getComputedStyle(node).pointerEvents),'none');
   assert.equal(await boot.evaluate(node=>getComputedStyle(node).pointerEvents),'none');
   geometry.push({label,...g});
   await page.screenshot({path:path.join(output,`${label}.png`)});
  }
  await both(normal,'normal-desktop');
  const trigger=normal.locator('[data-touchline-card-zoom="trigger"] > [role="button"]');await trigger.click();
  const dialog=page.locator('[data-touchline-card-zoom="dialog"]');await expect(dialog).toBeVisible();
  await both(dialog.locator('[data-card-zoom="expanded"]'),'zoom-desktop');
  await page.setViewportSize({width:844,height:390});
  await both(dialog.locator('[data-card-zoom="expanded"]'),'zoom-landscape');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Toggle synthetic goals publication'}).click();
  await expect(normal.locator('[data-card-golden-ball="true"][data-card-golden-boot="false"]')).toHaveCount(1);
  await expect(normal.locator('[data-touchline-golden-boot="true"]')).toHaveCount(0);
  await trigger.click();await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-card-golden-ball="true"][data-card-golden-boot="false"]')).toHaveCount(1);
  await expect(dialog.locator('[data-touchline-golden-boot="true"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  assert.ok(assets.includes('/touchlineArena/awards/touchline-golden-ball-trophy-v2.png'));
  assert.ok(assets.includes('/touchline/awards/golden-boot-v1.png'));
  writeFileSync(path.join(output,'report.json'),JSON.stringify({scope:'Synthetic published identity; real browser/card/zoom/authority; no QA or real leadership mutation',engine:'chromium',geometry,errors,forbidden,socialReads,awardAssets:assets.filter(x=>x.includes('/awards/'))},null,2)+'\n');
 }finally{await browser.close();}
});
