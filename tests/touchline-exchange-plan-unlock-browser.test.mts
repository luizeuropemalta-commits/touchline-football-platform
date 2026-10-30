import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium,webkit,expect} from '@playwright/test';
import {bundleIsolatedBrowserFixture} from './helpers/touchline-isolated-browser-bundle.mts';
import {getExchangePlanLockActions} from '../lib/touchlineFantasy/exchange-negotiations-i18n.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='https://exchange-plan-fixture.invalid';
const player={playerId:id(5),clubId:id(9),name:'Synthetic outgoing',valueTc:8_000_000,position:'MID',primaryDetail:'CM'};
const discovery={version:1,accountId:id(1),seasonId:id(2),collectionRevision:7,ownListedIds:[id(5)],reservations:[],proposals:[],listings:[
 {negotiationAllowed:true,restrictionReason:null,owner:{accountId:id(1),name:'Synthetic owner'},collectionRevision:7,player},
 {negotiationAllowed:false,restrictionReason:'beta-pair',owner:{accountId:id(4),name:'Synthetic paid counterpart'},collectionRevision:8,player:{...player,playerId:id(6),name:'Synthetic incoming'}},
]};
test('real Exchange lock opens canonical plans: nested Escape focus inertness quote and no accidental transaction', {skip:process.env.TOUCHLINE_RUN_EXCHANGE_PLAN_BROWSER!=='1',timeout:180000},async()=>{
 const out=process.env.TOUCHLINE_EXCHANGE_CAPTURE_DIR;assert.ok(out&&path.isAbsolute(out));mkdirSync(out,{recursive:true});
 const bundle=bundleIsolatedBrowserFixture({entryPath:'components/touchline/market/ClubOwnerExchangeHub.tsx',requiredSources:['components/touchline/market/ExchangeNegotiations.tsx','components/touchline/ClubOwnerPlanOnboarding.tsx','lib/stripe/club-season-checkout-client.ts','components/touchline/a11y/TouchlineDialog.tsx'],mountScript:`const Hub=loadEntry().default;flushSync(()=>root.render(React.createElement(Hub,window.fixtureProps)));`});
 const engine=process.env.TOUCHLINE_EXCHANGE_ENGINE==='webkit'?webkit:chromium;const browser=await engine.launch({headless:true});
 try{for(const locale of ['pt-BR','en-GB'])for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:844,height:390}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});const page=await context.newPage();const errors:string[]=[];const posts:{path:string;body:unknown}[]=[];const requests:string[]=[];
  let plan='beta',reason:string|null='beta-pair',withOffers=true;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());requests.push(url.pathname);
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/fixture'){
    const props={locale,plan,ready:true,expectedAccountId:id(1),catalogue:[],checkoutOffers:withOffers?{standard:{amountMinor:4990},master:{amountMinor:8990},vip:{amountMinor:16990}}:{},state:{seasonId:id(2),revision:7,plan,balanceEur:95_000_000,coach:null,receipts:[],players:Array.from({length:35},(_,i)=>({playerId:i===20?id(5):id(100+i),area:i<11?'starters':i<20?'reserves':'outside',slot:i<11?i:i<20?i-11:i-20,valueEur:1_000_000}))}};
    const safe=(s:string)=>s.replace(/<\/script/gi,'<\\/script');
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#10251c;color:#edf3ee;font:16px Arial}button,select{font:inherit}#root{padding:24px}${bundle.css}</style><button id="outside">Background action</button><div id="root"></div><script>window.fixtureProps=${safe(JSON.stringify(props))}</script><script>${safe(bundle.script)}</script>`});
   }
   if(url.pathname==='/api/touchline-fantasy/exchange'&&request.method()==='GET')return route.fulfill({json:{ok:true,discovery:{...discovery,listings:discovery.listings.map(l=>({...l,restrictionReason:l.negotiationAllowed?null:reason}))}}});
   if(request.method()==='POST'){posts.push({path:url.pathname,body:request.postDataJSON()});return route.fulfill({status:503,json:{ok:false}});}
   const file=path.resolve('public',`.${decodeURIComponent(url.pathname)}`);if(file.startsWith(path.resolve('public')+path.sep)&&existsSync(file))return route.fulfill({body:readFileSync(file),contentType:file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'image/webp'});
   return route.abort();
  });
  try{
   await page.goto(origin+'/fixture');const lock=getExchangePlanLockActions(locale);const trigger=page.locator('nav button').first();await trigger.click();
   const exchange=page.locator('div[role="dialog"]');const unlock=exchange.getByRole('button',{name:lock.unlock,exact:true});await expect(unlock).toBeEnabled();
   await exchange.locator('select').selectOption(id(5));await unlock.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`unlock-${engine.name()}-${viewport.width}-${locale}-action.png`),fullPage:true});await unlock.click();const plans=page.locator('dialog[data-plan-onboarding]');
   await expect(plans).toBeVisible();assert.equal(await plans.evaluate(e=>e.matches(':modal')),true);assert.equal(await plans.getAttribute('data-touchline-dialog-root'),'true');
   assert.equal(await plans.locator('article[data-plan-preview]').count(),4);await expect(plans.locator('[data-current-plan-badge="beta"]')).toBeVisible();
   await expect(plans.locator('[data-checkout-quote="standard"]')).toContainText(locale==='pt-BR'?'49,90':'49.90');
   assert.equal(posts.length,0,'exploring does not start checkout or a trade');
   const appearance=await plans.evaluate(e=>({background:getComputedStyle(e).backgroundColor,blur:getComputedStyle(e).backdropFilter,overflow:e.scrollWidth>e.clientWidth+1}));
   assert.equal(appearance.background,'rgba(0, 5, 6, 0.72)');assert.equal(appearance.blur,'blur(8px)');assert.equal(appearance.overflow,false);
   assert.equal(await page.locator('#root').evaluate(e=>(e as HTMLElement).inert),true);
   await page.locator('#outside').evaluate(e=>(e as HTMLElement).focus());assert.equal(await plans.evaluate(e=>e.contains(document.activeElement)),true,'background cannot steal native modal focus');
   for(let i=0;i<18;i++){await page.keyboard.press(i%3===0?'Shift+Tab':'Tab');assert.equal(await plans.evaluate(e=>e.contains(document.activeElement)),true,`Tab stays inside topmost plans step ${i}: ${await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,400))}`);}
   await page.screenshot({path:path.join(out,`unlock-${engine.name()}-${viewport.width}-${locale}-plans.png`),fullPage:true});
   await page.keyboard.press('Escape');await expect(plans).toHaveCount(0);await expect(exchange).toBeVisible();await expect(unlock).toBeFocused();await expect(exchange.locator('select')).toHaveValue(id(5));
   await unlock.click();await plans.locator('article[data-plan-preview="standard"] button').first().click();await expect(plans.locator('[data-plan-detail="standard"]')).toBeVisible();assert.equal(posts.length,0);
   await page.screenshot({path:path.join(out,`unlock-${engine.name()}-${viewport.width}-${locale}-details.png`),fullPage:true});
   await plans.locator('header button[aria-label]').click();await expect(plans).toHaveCount(0);await expect(unlock).toBeFocused();
   await unlock.click();await expect(plans.locator('[data-plan-gallery]')).toBeVisible();await expect(plans.locator('[data-plan-detail]')).toHaveCount(0);
   await plans.locator('article[data-plan-preview="standard"] [data-checkout-quote]').locator('..').getByRole('button').click();
   await expect.poll(()=>posts.length).toBe(1);assert.deepEqual(posts[0],{path:'/api/touchline-fantasy/season-checkout',body:{plan:'standard',expectedAmountMinor:4990}});await expect(plans.getByRole('alert')).toBeVisible();
   await page.keyboard.press('Escape');await expect(unlock).toBeFocused();await page.keyboard.press('Escape');await expect(exchange).toHaveCount(0);await expect(trigger).toBeFocused();assert.equal(await page.locator('#root').evaluate(e=>(e as HTMLElement).inert),false);
   // Same authoritative restriction, opposite viewer: upgrading the paid user cannot unlock Beta.
   plan='vip';await page.reload();await page.locator('nav button').first().click();await expect(exchange.getByRole('button',{name:lock.restricted,exact:true})).toBeDisabled();await expect(exchange.getByRole('button',{name:lock.unlock,exact:true})).toHaveCount(0);
   // No explicit restriction reason must not be presented as a plan problem.
   plan='beta';reason=null;await page.reload();await page.locator('nav button').first().click();await expect(exchange.getByRole('button',{name:lock.unavailable,exact:true})).toBeDisabled();await expect(exchange.getByRole('button',{name:lock.unlock,exact:true})).toHaveCount(0);
   // Existing chooser remains exploratory if the server offers no checkout.
   reason='beta-pair';withOffers=false;await page.reload();await page.locator('nav button').first().click();await exchange.getByRole('button',{name:lock.unlock,exact:true}).click();await expect(plans.locator('article[data-plan-preview="standard"] button').last()).toBeDisabled();await expect(plans.locator('[data-checkout-quote]')).toHaveCount(0);
   assert.equal(posts.length,1);assert.ok(!posts.some(p=>p.path==='/api/touchline-fantasy/exchange'));assert.deepEqual(errors,[]);assert.ok(!requests.some(p=>p.includes('/directory')));
  }finally{await context.close();}
 }}finally{await browser.close();}
});
