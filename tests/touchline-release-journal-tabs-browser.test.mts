import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

test("two actual pages preserve journal references and a single immutable conflict winner", {
  skip:process.env.TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER!=="1",timeout:60_000,
},async()=>{
  const bundle=bundleIsolatedBrowserFixture({entryPath:"lib/touchlineFantasy/club-release-recovery-journal.ts",
    requiredSources:["lib/touchlineFantasy/club-release-recovery-journal.ts"],
    mountScript:"window.openJournal=loadEntry().openClubReleaseRecoveryJournal;"});
  const engine=process.env.TOUCHLINE_RELEASE_JOURNAL_ENGINE==="webkit"?webkit:chromium;
  const browser=await engine.launch({headless:true});
  try {
    const context=await browser.newContext({serviceWorkers:"block"});
    const requests:string[]=[],errors:string[]=[];
    await context.route("**/*",async route=>{
      if(route.request().url()==="https://release-journal-tabs.invalid/fixture"&&route.request().method()==="GET")
        await route.fulfill({contentType:"text/html",body:`<div id="root"></div><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});
      else {requests.push(`${route.request().method()} ${route.request().url()}`);await route.abort();}
    });
    const open=async()=>{
      const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
      await page.goto("https://release-journal-tabs.invalid/fixture");
      await page.evaluate(()=>window.eval(`(async()=>{
        const id=n=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
        window.owner={expectedAccountId:id(1),expectedSeasonId:id(2)};
        window.ref={schemaVersion:1,createdAt:1,...window.owner,action:'release',playerId:id(3),expectedRevision:4,idempotencyKey:'tabs_key_A'};
        window.journal=await window.openJournal('fictional-two-tabs');
      })()`));
      return page;
    };
    const a=await open(),b=await open();
    assert.notEqual(a,b);assert.equal(context.pages().length,2);
    // Both independent contexts and connections are ready before scheduling either append.
    const append=async(page:typeof a,key:string,player?:string)=>page.evaluate(
      ({key,player})=>window.eval(`window.journal.append({...window.ref,idempotencyKey:${JSON.stringify(key)}${player?`,playerId:${JSON.stringify(player)}`:""}})`),{key,player});
    assert.deepEqual(await Promise.all([append(a,"tabs_key_A"),append(b,"tabs_key_B")]),["inserted","inserted"]);
    const playerB="99000000-0000-4000-8000-000000000004";
    const races=await Promise.allSettled([append(a,"tabs_key_C"),append(b,"tabs_key_C",playerB)]);
    assert.deepEqual(races.map(r=>r.status).sort(),["fulfilled","rejected"]);
    const list=async(page:typeof a)=>page.evaluate(()=>window.eval("window.journal.list(window.owner)")) as Promise<Array<{idempotencyKey:string;playerId:string}>>;
    const first=await list(a),second=await list(b);assert.deepEqual(first,second);
    assert.deepEqual(first.map(x=>x.idempotencyKey).sort(),["tabs_key_A","tabs_key_B","tabs_key_C"]);
    const winner=first.find(x=>x.idempotencyKey==="tabs_key_C")!;
    assert.equal(winner.playerId,races[0].status==="fulfilled"?"99000000-0000-4000-8000-000000000003":playerB);
    assert.equal(await append(b,"tabs_key_C",winner.playerId),"existing");
    await assert.rejects(append(a,"tabs_key_C",winner.playerId===playerB?"99000000-0000-4000-8000-000000000003":playerB),/RECOVERY_REFERENCE_CONFLICT/);
    // No explicit connection.close: close both real pages, then reopen a fresh page.
    await a.close();await b.close();assert.equal(context.pages().length,0);
    const reopened=await open();assert.deepEqual(await list(reopened),first);
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
