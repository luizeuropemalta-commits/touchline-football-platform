import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';import {chromium,expect} from '@playwright/test';
import {bundleIsolatedBrowserFixture} from './helpers/touchline-isolated-browser-bundle.mts';
const origin='https://company-finance-fixture.invalid';
const supplier={id:'22222222-2222-4222-8222-222222222222',name:'Synthetic Supplier'};
test('isolated finance form uses names, actor-free commands and stable retries PT/EN desktop/mobile',{skip:process.env.TOUCHLINE_RUN_COMPANY_BROWSER!=='1',timeout:120000},async()=>{
 const out='/private/tmp/touchline-company-browser';mkdirSync(out,{recursive:true});
 const bundle=bundleIsolatedBrowserFixture({entryPath:'components/touchline/admin/CompanyFinancePanel.tsx',requiredSources:['lib/admin/company-finance-api.ts'],mountScript:`const Panel=loadEntry().default;flushSync(()=>root.render(React.createElement(Panel,window.fixtureProps)));`});
 const browser=await chromium.launch({headless:true});
 try{for(const portuguese of [true,false])for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});const page=await context.newPage();const errors:string[]=[];const commands:Record<string,unknown>[]=[];let fail=true;
  page.on('pageerror',e=>errors.push(e.message));
  const safe=(s:string)=>s.replace(/<\/script/gi,'<\\/script');
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{background:#10251c;color:white;font:16px Arial;margin:0;padding:16px}section{padding:16px;margin-bottom:16px}form{display:grid;gap:16px}label{display:grid;gap:8px}input,select{max-width:100%;padding:8px}nav{display:flex;gap:8px;flex-wrap:wrap}${bundle.css}</style><div id="root"></div><script>window.fixtureProps={portuguese:${portuguese}}</script><script>${safe(bundle.script)}</script>`;
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/api/admin/company-finance'&&req.method()==='GET')return route.fulfill({json:{rows:url.searchParams.get('kind')==='suppliers'?[supplier]:[],hasNext:false}});
   if(url.pathname==='/api/admin/company-finance'&&req.method()==='POST'){commands.push(req.postDataJSON());return route.fulfill({status:fail?503:201,json:fail?{error:'UNAVAILABLE'}:{record:{id:'33333333-3333-4333-8333-333333333333'}}});}
   return route.abort();});
  await page.goto(origin+'/fixture');
  await page.getByRole('button',{name:portuguese?'Contratos':'Contracts',exact:true}).click();
  const supplierSelect=page.locator('select[name="supplier_id"]');await expect(supplierSelect.locator('option')).toHaveText([portuguese?'Selecione…':'Select…','Synthetic Supplier']);
  await supplierSelect.selectOption(supplier.id);await page.locator('input[name="title"]').fill('Synthetic service');await page.locator('input[name="starts_on"]').fill('2026-01-01');
  const save=page.getByRole('button',{name:portuguese?'Salvar registro':'Save record',exact:true});await save.click();await expect(page.locator('form').getByRole('status')).toContainText(portuguese?'Registro não confirmado':'Record not confirmed');
  fail=false;await save.click();await expect(page.locator('form').getByRole('status')).toContainText(portuguese?'Registro confirmado':'Record confirmed');
  assert.equal(commands.length,2);assert.equal(commands[0].requestId,commands[1].requestId);assert.equal(commands[0].kind,'contracts');assert.ok(!JSON.stringify(commands).includes('created_by'));assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:`${out}/${portuguese?'pt':'en'}-${width}.png`,fullPage:true});await context.close();
 }}finally{await browser.close();}
});
