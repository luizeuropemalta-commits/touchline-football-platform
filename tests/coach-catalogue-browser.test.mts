import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import path from "node:path";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { chromium, webkit, firefox, expect } from "@playwright/test";
import { coachDatabaseFixture } from "./helpers/coach-catalogue-database.mts";
import { coachPageFixture } from "./helpers/coach-catalogue-page-fixture.mts";
import { handleCoachEditorial } from "../lib/touchlineArena/coach-editorial-handler.ts";
import { parseCoachEditorial, parseCoachCatalogue, catalogueCoachForId, catalogueCoachForTeam } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

test("coach Admin: real UI → handler → local SQL, review/publication and preserved former identity in 24 browser flows",{
  skip:process.env.TOUCHLINE_RUN_COACH_CATALOGUE_BROWSER!=="1",timeout:180_000,
},async()=>{
  requireBrowserCapacity(process.cwd());
  const output=mkdtempSync(path.join(tmpdir(),"touchline-coach-catalogue-"));
  const require=createRequire(import.meta.url),tailwind=createRequire(require.resolve("@tailwindcss/postcss"));
  const {compile}=tailwind("@tailwindcss/node"),{Scanner}=tailwind("@tailwindcss/oxide");
  const paths=["app/(app)/admin/coaches/page.tsx","components/touchline/admin/CoachCatalogueEditor.tsx","components/ui.tsx","components/arena-admin-ui.tsx"];
  const candidates=new Scanner({sources:[]}).scanFiles(paths.map(file=>({content:readFileSync(file,"utf8"),extension:"tsx"})));
  const globals=path.resolve("app/globals.css"),compiler=await compile(readFileSync(globals,"utf8"),{base:path.dirname(globals),from:globals,onDependency(){}}),css=compiler.build(candidates);
  const script=bundleIsolatedBrowserFixture({entryPath:"components/touchline/admin/CoachCatalogueEditor.tsx",requiredSources:["components/touchline/admin/CoachCatalogueEditor.tsx","components/ui.tsx"],mountScript:`flushSync(()=>root.render(React.createElement(loadEntry().CoachCatalogueEditor,{initial:window.__coachState,portuguese:document.documentElement.lang==='pt-BR'})));`}).script;
  const fixture=await coachDatabaseFixture();let base="",postCount=0,readFailure=false;
  const server=createServer(async(req,res)=>{try{
    const url=new URL(req.url??"/",base);
    if(url.pathname==="/client.js"){res.setHeader("Content-Type","application/javascript");res.end(script);return;}
    if(url.pathname==="/api/admin/coaches"){
      if(req.method==="POST")postCount++;
      if(req.method==="GET"&&readFailure){res.statusCode=503;res.end('{"error":"UNAVAILABLE"}');return;}
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const response=await handleCoachEditorial(new Request(url,{method:req.method,headers:req.headers as Record<string,string>,...(req.method==="POST"?{body:Buffer.concat(chunks)}:{})}),fixture.dependencies);
      res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(await response.text());return;
    }
    const locale=url.searchParams.get("lang")==="en-GB"?"en-GB":"pt-BR";
    const state=parseCoachEditorial(await fixture.dependencies.rpc("touchline_read_coach_editorial"));assert.ok(state);
    const markup=await coachPageFixture({state}).render(locale);
    res.setHeader("Content-Type","text/html; charset=utf-8");res.end(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px;background:#07110e}</style>${markup}<script>window.__coachState=${JSON.stringify(state).replaceAll("<","\\u003c")}</script><script src="/client.js"></script></html>`);
  }catch(error){res.statusCode=500;res.end(String(error));}});
  try{
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    let cases=0;
    for(const engine of [chromium,webkit,firefox]){
      const browser=await engine.launch({headless:true});
      try{for(const locale of ["pt-BR","en-GB"])for(const width of [390,768,1280,1440]){
        await fixture.reset();postCount=0;readFailure=false;
        const pt=locale==="pt-BR",context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block",reducedMotion:"reduce"}),page=await context.newPage();
        const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
        await context.route("**/*",route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
        await page.goto(`${base}/admin/coaches?lang=${locale}`);await expect(page.getByRole("heading",{level:1})).toHaveText(pt?"Catálogo de técnicos":"Coach catalogue");
        const decide=async(label:string)=>{
          await page.getByRole("button",{name:label,exact:true}).click();
          const form=page.locator("form");await form.getByRole("textbox").fill("Official appointment and exact provider IDs reviewed locally for this synthetic test.");
          await form.getByRole("checkbox").check();await form.getByRole("button",{name:label,exact:true}).click();
          await expect(page.getByRole("status")).toHaveText(pt?"Decisão confirmada e registrada no histórico.":"Decision confirmed and recorded in history.");await expect(form).toHaveCount(0);
        };
        await decide(pt?"Importar os 20 registros legados":"Import the 20 legacy entries");assert.equal(postCount,1);
        await assert.rejects(fixture.catalogue(),/DISABLED/);
        await fixture.observe();await page.getByRole("button",{name:pt?"Atualizar revisão":"Refresh review",exact:true}).click();
        await expect(page.getByRole("heading",{name:"Synthetic New Coach · Arsenal FC"})).toBeVisible();
        await expect(page.getByRole("button",{name:pt?"Publicar associação atual":"Publish current appointment",exact:true})).toHaveCount(0);
        await decide(pt?"Aprovar revisão":"Approve review");assert.equal(postCount,2);
        await decide(pt?"Publicar associação atual":"Publish current appointment");assert.equal(postCount,3);
        await fixture.db.exec("update touchline_coaches_private.configuration set public_enabled=true");
        const catalogue=parseCoachCatalogue(await fixture.catalogue());assert.equal(catalogue.phase,"ready");assert.equal(catalogueCoachForTeam(catalogue,"19")?.coach.providerId,"99991");assert.equal(catalogueCoachForId(catalogue,"307")?.coach.name,"Mikel Arteta");assert.equal(catalogue.history.length,21);
        await page.reload();await expect(page.getByText(pt?"Publicado":"Published",{exact:true})).toBeVisible();assert.equal(postCount,3);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${engine.name()}/${locale}/${width}: horizontal overflow`);
        if(width===390||width===1440)await page.screenshot({path:path.join(output,`${engine.name()}-${locale}-${width}.png`),fullPage:true});
        readFailure=true;await page.getByRole("button",{name:pt?"Atualizar revisão":"Refresh review",exact:true}).click();
        await expect(page.getByRole("status")).toHaveText(pt?"Não foi possível atualizar. Novas decisões permanecem bloqueadas.":"Refresh failed. New decisions remain blocked.");
        await expect(page.getByRole("button",{name:pt?"Reabrir revisão":"Reopen review",exact:true})).toBeDisabled();assert.equal(postCount,3);
        readFailure=false;await page.getByRole("button",{name:pt?"Atualizar revisão":"Refresh review",exact:true}).click();await expect(page.getByRole("button",{name:pt?"Reabrir revisão":"Reopen review",exact:true})).toBeEnabled();
        assert.deepEqual(errors,[]);cases++;await context.close();
      }}finally{await browser.close();}
    }
    assert.equal(cases,24);console.log(`Coach catalogue: ${cases} flows; actual React UI + handler + PGlite, synthetic owner/provider evidence; screenshots ${output}; no remote services.`);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await fixture.db.close();}
});
