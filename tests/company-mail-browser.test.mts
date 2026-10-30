import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium,firefox,webkit,expect } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
const origin="https://company-mail-fixture.invalid";
test("mail review PT/EN recovers errors, paginates and renders untrusted text safely",{skip:process.env.TOUCHLINE_RUN_COMPANY_BROWSER!=="1",timeout:120000},async()=>{
 const bundle=bundleIsolatedBrowserFixture({entryPath:"components/touchline/admin/CompanyMailPanel.tsx",requiredSources:[],mountScript:"const Panel=loadEntry().default;flushSync(()=>root.render(React.createElement(Panel,{portuguese:window.fixtureProps.portuguese})));"});
 mkdirSync("/private/tmp/touchline-mail-browser",{recursive:true});
 // Match the real outer orientation root; this component fixture does not prove the global rotation gate.
 // Narrow390 is component stress with a fine pointer; phone touch is landscape844x390 per the site orientation rule.
 const require=createRequire(import.meta.url),tw=createRequire(require.resolve('@tailwindcss/postcss'));
 const {compile}=tw('@tailwindcss/node'),{Scanner}=tw('@tailwindcss/oxide');
 const candidates=new Scanner({sources:[]}).scanFiles(bundle.sources.filter(f=>/\.tsx?$/.test(f)).map(f=>({content:readFileSync(f,'utf8'),extension:path.extname(f).slice(1)})));
 const globals=path.resolve('app/globals.css');
 const appCss=(await compile(readFileSync(globals,'utf8'),{base:path.dirname(globals),from:globals,onDependency(){}})).build(candidates)+bundle.css;
 for(const engine of [chromium,firefox,webkit]){
  const browser=await engine.launch({headless:true});
  try{for(const portuguese of [true,false])for(const width of [390,768,844,1280,1440]){
   const context=await browser.newContext({viewport:{width,height:width===844?390:900},hasTouch:width===768||width===844,serviceWorkers:"block"});const page=await context.newPage();let fail=true;let reviewFail=true;const reviews:Record<string,unknown>[]=[];const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
   await context.route("**/*",async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname==="/fixture")return route.fulfill({contentType:"text/html",body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{background:#10251c;color:white;font:16px Arial;margin:0;padding:16px}nav{display:flex;flex-wrap:wrap;gap:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}${appCss}</style><div id="root" data-touchline-orientation-root></div><script>window.fixtureProps={portuguese:${portuguese}}</script><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});
    if(url.pathname==="/api/admin/company-finance")return route.fulfill({json:{rows:[{id:"22222222-2222-4222-8222-222222222222",source_reference:"Invoice record 42"}],hasNext:false}});
    if(url.pathname==="/api/admin/company-finance/mail"){
     if(route.request().method()==="POST"){const body=route.request().postDataJSON();if(body.action==="run")return route.fulfill({json:{result:{state:"DISABLED",imported:0,pending:0}}});reviews.push(body.command);return route.fulfill({status:reviewFail?503:200,json:reviewFail?{error:"UNAVAILABLE"}:{review:{id:body.command.requestId,evidence_id:body.command.evidenceId}}});}
     if(fail)return route.fulfill({status:503,json:{error:"UNAVAILABLE"}});
     if(url.searchParams.get("kind")==="scans")return route.fulfill({json:{rows:[{id:"33333333-3333-4333-8333-333333333333",query:"from:billing@example.test",completed:false,updated_at:"2026-10-27T12:00:00Z"}],hasNext:false}});
     if(url.searchParams.get("kind")==="retries")return route.fulfill({json:{rows:[{scan_id:"scan",message_id:"message",code:"MAIL_CONTENT_LIMIT",attempts:2,resolved_at:null}],hasNext:false}});
     if(url.searchParams.get("page")==="1")return route.fulfill({json:{rows:[],hasNext:false}});
     return route.fulfill({json:{rows:[{id:"11111111-1111-4111-8111-111111111111",subject:"Invoice 42",sender:"billing@example.test",received_at:"2026-10-27T12:00:00Z",plain_text:"<img src=x onerror=alert('bad')> Payment claimed, unverified."}],hasNext:true}});
    }return route.abort();
   });
   await page.goto(origin+"/fixture");await expect(page.getByRole("alert")).toContainText(portuguese?"Registros indisponíveis":"Records unavailable");
   fail=false;await page.getByRole("button",{name:portuguese?"Atualizar registros":"Refresh records",exact:true}).click();await expect(page.getByText("Invoice 42",{exact:true})).toBeVisible();
   await page.locator("summary").filter({hasText:portuguese?"Ver texto da mensagem":"Read message text"}).click();await expect(page.locator("pre")).toContainText("<img src=x");await expect(page.locator("pre img")).toHaveCount(0);
   await expect(page.getByRole("link",{name:portuguese?"Baixar original (.eml)":"Download original (.eml)"})).toHaveAttribute("href",/original\?id=11111111/);
   await page.getByRole("button",{name:portuguese?"Conferir e organizar":"Review and organize",exact:true}).click();
   await page.getByLabel(portuguese?"Registro":"Record",{exact:true}).selectOption("22222222-2222-4222-8222-222222222222");
   await page.getByLabel(portuguese?"Observação da conferência":"Review note",{exact:true}).fill("Verified original");
   const save=page.getByRole("button",{name:portuguese?"Registrar conferência":"Record review",exact:true});await save.click();
   await expect(page.getByText(portuguese?/Conferência não confirmada/:/Review not confirmed/)).toBeVisible();
   reviewFail=false;await save.click();await expect(page.getByText("Invoice 42",{exact:true})).toBeVisible();
   assert.equal(reviews.length,2);assert.equal(reviews[0].requestId,reviews[1].requestId);assert.ok(!JSON.stringify(reviews).includes("actor_id"));
   await page.getByRole("button",{name:portuguese?"Próxima":"Next",exact:true}).click();await expect(page.getByText(portuguese?/Nenhum registro nesta página/:/No records on this page/)).toBeVisible();
   await page.getByRole("button",{name:portuguese?"Pendências de leitura":"Reading issues",exact:true}).click();await expect(page.getByText(/MAIL_CONTENT_LIMIT/)).toBeVisible();
   await page.getByRole("button",{name:portuguese?"Importações":"Imports",exact:true}).click();await expect(page.getByRole("heading",{name:portuguese?"Importação de documentos":"Document import",exact:true})).toBeVisible();
   await expect(page.getByText("from:billing@example.test",{exact:true})).toBeHidden();
   await expect(page.getByText(/UTC/)).toContainText("2026");
   await page.getByText(portuguese?"Detalhes da importação":"Import details",{exact:true}).click();
   await expect(page.getByText("from:billing@example.test",{exact:true})).toBeVisible();
   await page.getByRole("button",{name:portuguese?"Importar próximo lote":"Import next batch",exact:true}).click();await expect(page.getByText(portuguese?"Esta caixa ainda não está habilitada para importação.":"This mailbox is not enabled for import yet.",{exact:true})).toBeVisible();
   assert.deepEqual(errors,[]);await page.screenshot({path:`/private/tmp/touchline-mail-browser/${engine.name()}-${portuguese?"pt":"en"}-${width}.png`,fullPage:true});await context.close();
  }}finally{await browser.close();}
 }
});
