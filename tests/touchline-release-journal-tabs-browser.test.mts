import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const selectedCase=process.env.TOUCHLINE_RELEASE_JOURNAL_CASE;
assert.ok(selectedCase===undefined||["existing","removal"].includes(selectedCase),"invalid journal browser case");

test("two actual pages preserve journal references and a single immutable conflict winner", {
  skip:process.env.TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER!=="1"||selectedCase==="removal",timeout:60_000,
},async t=>{
  const selectedEngine=process.env.TOUCHLINE_RELEASE_JOURNAL_ENGINE;
  assert.ok(selectedEngine===undefined||["chromium","webkit"].includes(selectedEngine),"invalid journal browser engine");
  t.signal.throwIfAborted();
  const bundle=bundleIsolatedBrowserFixture({entryPath:"lib/touchlineFantasy/club-release-recovery-journal.ts",
    requiredSources:["lib/touchlineFantasy/club-release-recovery-journal.ts"],
    mountScript:"window.openJournal=loadEntry().openClubReleaseRecoveryJournal;"});
  const engine=selectedEngine==="webkit"?webkit:chromium;
  t.signal.throwIfAborted();
  const browser=await engine.launch({headless:true});
  let closing:Promise<void>|undefined;
  const close=()=>closing??=browser.close();
  const abort=()=>{void close().catch(()=>{});};
  t.signal.addEventListener("abort",abort,{once:true});
  try {
    t.signal.throwIfAborted();
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
  } finally {t.signal.removeEventListener("abort",abort);await close();}
});

test("two actual pages remove only an exact reference and preserve other account and season keys after reopen", {
  skip:process.env.TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER!=="1"||selectedCase==="existing",timeout:60_000,
},async t=>{
  const selectedEngine=process.env.TOUCHLINE_RELEASE_JOURNAL_ENGINE;
  assert.ok(selectedEngine===undefined||["chromium","webkit"].includes(selectedEngine));
  const capacity=()=>requireBrowserCapacity(new URL("..",import.meta.url).pathname,{darwinFreePercent:true,allowModerateDarwinPressure:process.env.TOUCHLINE_LOCAL_MODERATE_MEMORY==="1"});
  capacity();t.signal.throwIfAborted();
  const bundle=bundleIsolatedBrowserFixture({entryPath:"lib/touchlineFantasy/club-release-recovery-journal.ts",
    requiredSources:["lib/touchlineFantasy/club-release-recovery-journal.ts"],
    mountScript:"window.openJournal=loadEntry().openClubReleaseRecoveryJournal;"});
  capacity();t.signal.throwIfAborted();
  const browser=await (selectedEngine==="webkit"?webkit:chromium).launch({headless:true});
  let closing:Promise<void>|undefined;
  const close=()=>closing??=browser.close();
  const abort=()=>{void close().catch(()=>{});};t.signal.addEventListener("abort",abort,{once:true});
  try {
    capacity();t.signal.throwIfAborted();
    const context=await browser.newContext({serviceWorkers:"block"});
    const requests:string[]=[],errors:string[]=[];
    await context.route("**/*",async route=>{
      if(route.request().url()==="https://release-journal-tabs.invalid/removal"&&route.request().method()==="GET")
        await route.fulfill({contentType:"text/html; charset=utf-8",body:`<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});
      else {requests.push(`${route.request().method()} ${route.request().url()}`);await route.abort();}
    });
    const open=async()=>{
      const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
      await page.goto("https://release-journal-tabs.invalid/removal");
      await page.evaluate(()=>window.eval(`(async()=>{
        const id=n=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
        window.owner={expectedAccountId:id(1),expectedSeasonId:id(2)};
        window.ref={schemaVersion:1,createdAt:1,...window.owner,action:'release',playerId:id(3),expectedRevision:4,idempotencyKey:'tabs_remove_A'};
        window.accountRef={...window.ref,expectedAccountId:id(8)};
        window.seasonRef={...window.ref,expectedSeasonId:id(9)};
        window.journal=await window.openJournal('fictional-two-tabs-removal');
      })()`));
      return page;
    };
    const a=await open(),b=await open();assert.notEqual(a,b);assert.equal(context.pages().length,2);
    const snapshot=async(page:typeof a)=>page.evaluate(()=>window.eval(`(async()=>({
      own:await window.journal.list(window.owner),account:await window.journal.list(window.accountRef),season:await window.journal.list(window.seasonRef)
    }))()`));
    const refs=await a.evaluate(()=>window.eval(`(async()=>{
      const refs=[window.ref,window.accountRef,window.seasonRef];for(const ref of refs)await window.journal.append(ref);return refs;
    })()`));
    const initial={own:[refs[0]],account:[refs[1]],season:[refs[2]]};
    assert.deepEqual(await snapshot(b),initial,"second page reads complete seeded identities");
    await assert.rejects(b.evaluate(()=>window.eval("window.journal.remove({...window.ref,expectedRevision:5})")),/RECOVERY_REFERENCE_CONFLICT/);
    assert.deepEqual(await snapshot(a),initial,"foreign revision cannot remove the pending reference");
    await b.evaluate(()=>window.eval("window.journal.remove(window.ref)"));
    const after={own:[],account:[refs[1]],season:[refs[2]]};
    assert.deepEqual(await snapshot(a),after,"successful removal is visible in the other page and scoped to its exact key");
    // An already-removed key is idempotent across pages; no settlement request exists.
    await a.evaluate(()=>window.eval("window.journal.remove(window.ref)"));assert.deepEqual(await snapshot(b),after);
    await a.close();await b.close();assert.equal(context.pages().length,0);
    const reopened=await open();assert.deepEqual(await snapshot(reopened),after,"close/reopen cannot resurrect removed references or lose foreign ones");
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);capacity();
    t.diagnostic(JSON.stringify({engine:selectedEngine??"chromium",case:"removal",initial,persisted:after,
      boundary:"two pages in one browser context, separate real IndexedDB connections; synthetic references, no account action"}));
  }finally {t.signal.removeEventListener("abort",abort);await close();}
});
