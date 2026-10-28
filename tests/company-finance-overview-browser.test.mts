import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

const require = createRequire(import.meta.url);
test("company overview renders exact totals and error/empty states in PT/EN", { timeout: 90000 }, async () => {
 const bundle=bundleIsolatedBrowserFixture({entryPath:"components/touchline/admin/CompanyFinanceOverview.tsx",requiredSources:["components/ui.tsx","components/arena-admin-ui.tsx","lib/admin/company-finance-overview.ts"],mountScript:`flushSync(()=>root.render(React.createElement(loadEntry().CompanyFinanceOverview,{portuguese:document.documentElement.lang==="pt-BR"})));`});
 const tw=createRequire(require.resolve("@tailwindcss/postcss"));
 const {compile}=tw("@tailwindcss/node"),{Scanner}=tw("@tailwindcss/oxide");
 const candidates=new Scanner({sources:[]}).scanFiles(bundle.sources.filter(f=>/\.tsx?$/.test(f)).map(f=>({content:readFileSync(f,"utf8"),extension:path.extname(f).slice(1)})));
 const globals=path.resolve("app/globals.css"),compiler=await compile(readFileSync(globals,"utf8"),{base:path.dirname(globals),from:globals,onDependency(){}}),css=compiler.build(candidates)+bundle.css;
 const output=process.env.TOUCHLINE_COMPANY_OVERVIEW_EVIDENCE_DIR;if(output)mkdirSync(output,{recursive:true});
 const data={asOf:"2026-10-27",suppliers:"4",contracts:"6",contractDeadlines:"2",currencies:[{currency:"EUR",exponent:2,obligations:"52",registered:"520000",paid:"16000",outstanding:"506000",overpaid:"2000",overdue:"496000",overdueCount:"50"}]};
 for(const engine of [chromium,webkit,firefox]){
  const browser=await engine.launch({headless:true});
  try{for(const locale of ["pt-BR","en-GB"]){for(const width of [844,1180,1440]){
   const page=await browser.newPage({viewport:{width,height:width===844?390:width===1180?820:900},reducedMotion:"reduce"}),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/*",route=>route.abort());await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}</style></head><body style="background:#081613;color:white"><div id="root"></div></body></html>`);
   await page.addScriptTag({content:`window.calls=[];window.fetch=(url)=>{window.calls.push(url);return new Promise(resolve=>window.finish=resolve)};${bundle.script}`});
   await expect(page.getByRole("status")).toContainText(locale==="pt-BR"?"Conferindo":"Checking");
   await page.evaluate(data=>(window as unknown as {finish:(r:Response)=>void}).finish(new Response(JSON.stringify(data))),data);
   const button=page.getByRole("button",{name:locale==="pt-BR"?"Atualizar resumo":"Refresh overview"});await expect(button).toBeEnabled();
   await expect(page.getByText(locale==="pt-BR"?"5.060,00 EUR":"5,060.00 EUR",{exact:true})).toBeVisible();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(output)await page.screenshot({path:path.join(output,`${engine.name()}-${locale}-${width}.png`),fullPage:true});
   await button.click();await expect(button).toBeDisabled();
   await page.evaluate(()=>(window as unknown as {finish:(r:Response)=>void}).finish(new Response("{}",{status:503})));
   await expect(page.getByRole("alert")).toContainText(locale==="pt-BR"?"não significa despesa zero":"does not mean zero expenses");
   await button.click();await page.evaluate(data=>(window as unknown as {finish:(r:Response)=>void}).finish(new Response(JSON.stringify({...data,currencies:[]}))),data);
   await expect(page.getByText(locale==="pt-BR"?"Nenhuma despesa cadastrada. Contas ainda não registradas não entram neste resumo.":"No recorded expenses. Unrecorded bills are not included in this overview.",{exact:true})).toBeVisible();
   assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>(window as unknown as {calls:string[]}).calls),Array(3).fill("/api/admin/company-finance/overview"));await page.close();
  }}}finally{await browser.close();}
 }
});
