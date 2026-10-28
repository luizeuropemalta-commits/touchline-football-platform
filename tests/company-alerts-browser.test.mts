import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync } from "node:fs";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
const origin="https://company-alerts-fixture.invalid";
test("alerts recover GET/POST errors, reject missing read receipt and confirm PT/EN on three engines",{skip:process.env.TOUCHLINE_RUN_COMPANY_BROWSER!=="1",timeout:120000},async()=>{
 const bundle=bundleIsolatedBrowserFixture({entryPath:"components/touchline/admin/CompanyAlertsPanel.tsx",requiredSources:[],mountScript:"const Panel=loadEntry().default;flushSync(()=>root.render(React.createElement(Panel,{portuguese:window.fixtureProps.portuguese})));"});
 mkdirSync('/private/tmp/company-alerts-browser',{recursive:true});
 // Match the real outer orientation root; this component fixture does not prove the global rotation gate.
 // Narrow390 is component stress with a fine pointer; phone touch is landscape844x390 per the site orientation rule.
 const require=createRequire(import.meta.url),tw=createRequire(require.resolve('@tailwindcss/postcss'));
 const {compile}=tw('@tailwindcss/node'),{Scanner}=tw('@tailwindcss/oxide');
 const candidates=new Scanner({sources:[]}).scanFiles(bundle.sources.filter(f=>/\.tsx?$/.test(f)).map(f=>({content:readFileSync(f,'utf8'),extension:path.extname(f).slice(1)})));
 const globals=path.resolve('app/globals.css');
 const appCss=(await compile(readFileSync(globals,'utf8'),{base:path.dirname(globals),from:globals,onDependency(){}})).build(candidates)+bundle.css;
 for(const engine of [chromium,firefox,webkit]){const browser=await engine.launch({headless:true});try{for(const portuguese of [false,true])for(const width of [390,768,844,1280,1440]){
 const context=await browser.newContext({viewport:{width,height:width===844?390:900},hasTouch:width===768||width===844,serviceWorkers:"block"}),page=await context.newPage();let reads=0,writes=0;const errors:string[]=[];
 const alert={id:"11111111-1111-4111-8111-111111111111",alert_kind:"OBLIGATION_OVERDUE",read_at:null,resolved_at:null,milestone_on:"2026-10-26",created_at:"2026-10-27T00:00:00Z",metadata:{supplierName:"Example supplier",sourceReference:"INV-42",currency:"EUR",unitExponent:2,outstandingMinor:6000}};
 page.on("pageerror",error=>errors.push(error.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
 if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{background:#071115;color:white;font:16px Arial;margin:0;padding:16px}${appCss}</style><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps={portuguese:${portuguese}}</script><script>${bundle.script.replace(/<\/script/gi,'<\\/script')}</script>`});
 if(url.pathname==='/api/admin/company-finance/alerts'){
  if(route.request().method()==='POST'){writes++;assert.deepEqual(route.request().postDataJSON(),{action:'read',alertId:alert.id});return route.fulfill(writes===1?{status:503,json:{error:'UNAVAILABLE'}}:writes===2?{json:{alert}}:{json:{alert:{...alert,read_at:'2026-10-27T01:00:00Z'}}});}
  reads++;return route.fulfill(reads===1?{status:503,json:{error:'UNAVAILABLE'}}:{json:{alerts:[alert],hasNext:false}});
 }return route.abort();});
 await page.goto(origin+'/fixture');await expect(page.getByRole('alert')).toContainText(portuguese?'Alertas indisponíveis':'Alerts unavailable');
 const refresh=page.getByRole('button',{name:portuguese?'Atualizar alertas':'Refresh alerts',exact:true}),read=page.getByRole('button',{name:portuguese?'Marcar como lido':'Mark as read',exact:true});
 await refresh.click();await expect(page.getByText('Example supplier · INV-42')).toBeVisible();await expect(page.getByText(portuguese?'Saldo pendente: 60 EUR':'Outstanding: 60 EUR')).toBeVisible();
 await read.click();await expect(page.getByRole('alert')).toContainText(portuguese?'Leitura não confirmada':'Read not confirmed');await expect(read).toBeDisabled();
 await refresh.click();await read.click();await expect(page.getByRole('alert')).toContainText(portuguese?'Leitura não confirmada':'Read not confirmed');
 await refresh.click();await read.focus();await page.keyboard.press('Enter');await expect(page.getByText(portuguese?'Leitura confirmada':'Read confirmed',{exact:true})).toBeVisible();await expect(read).toHaveCount(0);
 assert.equal(writes,3);assert.deepEqual(errors,[]);await page.screenshot({path:`/private/tmp/company-alerts-browser/${engine.name()}-${portuguese?'pt':'en'}-${width}.png`,fullPage:true});await context.close();
 }}finally{await browser.close();}}
});
