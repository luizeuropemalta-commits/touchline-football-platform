import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';import {chromium,expect} from '@playwright/test';
import {bundleIsolatedBrowserFixture} from './helpers/touchline-isolated-browser-bundle.mts';
const origin='https://company-finance-fixture.invalid';
const contractId='33333333-3333-4333-8333-333333333333';
test('isolated private document form verifies retry identity and confirmed link PT/EN desktop/mobile',{skip:process.env.TOUCHLINE_RUN_COMPANY_BROWSER!=='1',timeout:120000},async()=>{
 const out='/private/tmp/touchline-company-documents-browser';mkdirSync(out,{recursive:true});
 const bundle=bundleIsolatedBrowserFixture({entryPath:'components/touchline/admin/CompanyDocumentsPanel.tsx',requiredSources:[],mountScript:`const Panel=loadEntry().CompanyDocumentsPanel;flushSync(()=>root.render(React.createElement(Panel,window.fixtureProps)));`});
 const browser=await chromium.launch({headless:true});
 try{for(const portuguese of [true,false])for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});const page=await context.newPage();const errors:string[]=[];const commands:Record<string,unknown>[]=[];let fail=true;
  page.on('pageerror',e=>errors.push(e.message));
  const safe=(s:string)=>s.replace(/<\/script/gi,'<\\/script');
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{background:#10251c;color:white;font:16px Arial;margin:0;padding:16px}section{padding:16px;margin-bottom:16px}form{display:grid;gap:16px}label{display:grid;gap:8px}input,select{max-width:100%;padding:8px}nav{display:flex;gap:8px;flex-wrap:wrap}${bundle.css}</style><div id="root"></div><script>window.fixtureProps={portuguese:${portuguese},contractId:"${contractId}"}</script><script>${safe(bundle.script)}</script>`;
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/api/admin/company-finance/documents'&&req.method()==='GET')return route.fulfill({json:{rows:[],hasNext:false}});
   if(url.pathname==='/api/admin/company-finance/documents'&&req.method()==='POST'){commands.push(Object.fromEntries(url.searchParams));return route.fulfill({status:fail?503:201,json:fail?{error:'UNAVAILABLE'}:{record:{id:'22222222-2222-4222-8222-222222222222'}}});}
   return route.abort();});
  await page.goto(origin+'/fixture');
  await page.locator('input[type="file"]').setInputFiles({name:'contract.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nfixture\n%%EOF')});
  const save=page.getByRole('button',{name:portuguese?'Anexar PDF':'Attach PDF',exact:true});await save.click();await expect(page.getByRole('status').last()).toContainText(portuguese?'Envio não confirmado':'Upload not confirmed');
  fail=false;await save.click();await expect(page.getByRole('status').last()).toContainText(portuguese?'Documento vinculado':'Document attached');
  assert.equal(commands.length,2);assert.equal(commands[0].requestId,commands[1].requestId);assert.equal(commands[0].contractId,contractId);assert.ok(!JSON.stringify(commands).includes('created_by'));assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:`${out}/${portuguese?'pt':'en'}-${width}.png`,fullPage:true});await context.close();
 }}finally{await browser.close();}
});
