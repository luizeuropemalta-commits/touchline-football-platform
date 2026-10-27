import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';import path from 'node:path';import {chromium,webkit,expect} from '@playwright/test';import {bundleIsolatedBrowserFixture} from './helpers/touchline-isolated-browser-bundle.mts';
import {getTouchlineBetaEnrollmentCopy} from '../lib/touchlineFantasy/beta-enrollment-i18n.ts';
const account='10000000-0000-4000-8000-000000000001',season='10000000-0000-4000-8000-000000000002';
const origin='https://beta-bootstrap-fixture.invalid';
test('real enrollment and collection hook use100M then explicit Ruby bootstrap95M without legacy endpoints',{skip:process.env.TOUCHLINE_RUN_BETA_BOOTSTRAP_BROWSER!=='1',timeout:60000},async()=>{
 const out=process.env.TOUCHLINE_BETA_CAPTURE_DIR;assert.ok(out&&path.isAbsolute(out));mkdirSync(out,{recursive:true});
 const hook='components/touchline/fantasy/useClubCollection.ts';
 const bundle=bundleIsolatedBrowserFixture({entryPath:'components/touchline/fantasy/TouchlineBetaEnrollment.tsx',additionalEntryPaths:[hook],allowSyntheticRouteRefresh:true,requiredSources:[hook,'lib/touchlineFantasy/club-initial-budget.ts'],mountScript:`const Enroll=loadEntry().default,{useClubCollection}=loadAdditionalEntry('${hook}');const context={expectedAccountId:'${account}',expectedSeasonId:'${season}'};function Bootstrap(){const collection=useClubCollection(true,window.locale,context);return React.createElement('section',{'data-bootstrap':true},React.createElement('h2',null,'Ruby · 5M TC'),React.createElement('output',{'data-balance':true},String(collection.state?.balanceEur??collection.initialBudget?.balanceEur??'unconfirmed')),React.createElement('button',{disabled:!collection.canInitialize,onClick:()=>collection.initialize('307')},'Confirm Ruby'),React.createElement('p',{'data-error':true},collection.error));}window.onFixtureRouteRefresh=()=>flushSync(()=>root.render(React.createElement(Bootstrap)));flushSync(()=>root.render(React.createElement(Enroll,{locale:window.locale,draftLocalesEnabled:true})));`});
 const engine=process.env.TOUCHLINE_BETA_ENGINE==='webkit'?webkit:chromium;const browser=await engine.launch({headless:true});
 try{for(const locale of ['pt-BR','ar-SA'])for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();const requests:string[]=[];const errors:string[]=[];let initialized=false;
  page.on('pageerror',e=>errors.push(e.message));
  const state={revision:1,seasonId:season,plan:'beta',balanceEur:95_000_000,coach:{id:'307',tier:'ruby-red',valueEur:5_000_000},players:[],receipts:[]};
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}" dir="${locale==='ar-SA'?'rtl':'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;background:#07120d;color:white;font:18px Arial}*{box-sizing:border-box}button{padding:16px}output{display:block;margin:20px 0}${bundle.css}</style><div id="root"></div><script>window.locale=${JSON.stringify(locale)}</script><script>${bundle.script.replace(/<\/script/gi,'<\\/script')}</script>`});
   requests.push(`${req.method()} ${url.pathname}`);
   if(url.pathname==='/api/touchline-fantasy/beta/enroll'&&req.method()==='POST')return route.fulfill({json:{ok:true,planKey:'beta',status:'active',budgetEur:100_000_000,allowedClubTeamIds:['22','117','116','52','3','13']}});
   if(url.pathname==='/api/touchline-fantasy/collection/read')return route.fulfill({json:{ok:true,accountId:account,seasonId:season,state:initialized?state:null,initialBudget:initialized?null:{plan:'beta',balanceEur:100_000_000},releaseAvailable:false,coachLifecycleAvailable:false}});
   if(url.pathname==='/api/touchline-fantasy/collection/initialize'&&req.method()==='POST'){assert.deepEqual(req.postDataJSON(),{coachId:'307',expectedAccountId:account,expectedSeasonId:season});initialized=true;return route.fulfill({json:{ok:true,accountId:account,seasonId:season,state}});}
   return route.abort();
  });
  try{await page.goto(origin+'/fixture');await expect(page.locator('[data-beta-enrollment]')).toContainText('100M');assert.equal(requests.length,0);await page.screenshot({path:path.join(out,`beta-${engine.name()}-${locale}-${width}-enrollment.png`)});
   await page.getByRole('button',{name:getTouchlineBetaEnrollmentCopy(locale,true).start}).click();await expect(page.getByRole('button',{name:'Confirm Ruby'})).toBeEnabled();assert.equal(requests.filter(x=>x.startsWith('POST')).length,1);
   await page.getByRole('button',{name:'Confirm Ruby'}).click();await expect(page.locator('[data-balance]')).toHaveText('95000000');await expect(page.getByRole('button',{name:'Confirm Ruby'})).toBeDisabled();await page.screenshot({path:path.join(out,`beta-${engine.name()}-${locale}-${width}-bootstrap.png`)});
   assert.deepEqual(requests.filter(x=>x.startsWith('POST')),['POST /api/touchline-fantasy/beta/enroll','POST /api/touchline-fantasy/collection/initialize']);assert.deepEqual(errors,[]);assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
  }finally{await context.close();}
 }}finally{await browser.close();}
});
