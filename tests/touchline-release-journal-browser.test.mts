import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";

test("real IndexedDB journal: two connections, immutable keys and post-success abort", {
  skip:process.env.TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER!=="1",timeout:60_000,
},async()=>{
  const bundle=bundleIsolatedBrowserFixture({entryPath:"lib/touchlineFantasy/club-release-recovery-journal.ts",
    requiredSources:["lib/touchlineFantasy/club-release-recovery-journal.ts"],
    mountScript:"window.openJournal=loadEntry().openClubReleaseRecoveryJournal;"});
  const engine=process.env.TOUCHLINE_RELEASE_JOURNAL_ENGINE==="webkit"?webkit:chromium;
  const browser=await engine.launch({headless:true});
  try {
    const context=await browser.newContext({serviceWorkers:"block"});
    const requests:string[]=[];
    await context.route("**/*",async route=>{
      if(route.request().url()==="https://release-journal.invalid/fixture"&&route.request().method()==="GET")
        await route.fulfill({contentType:"text/html",body:`<div id="root"></div><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});
      else {requests.push(route.request().url());await route.abort();}
    });
    const page=await context.newPage();
    await page.goto("https://release-journal.invalid/fixture");
    const evidence=await page.evaluate(async()=>{
      // JS string keeps browser globals/fixture API outside product TypeScript.
      return await window.eval(`(async()=>{
        const id=n=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
        const owner={expectedAccountId:id(1),expectedSeasonId:id(2)};
        const ref={schemaVersion:1,createdAt:1,...owner,action:'release',playerId:id(3),expectedRevision:4,idempotencyKey:'journal_key_A'};
        const a=await window.openJournal('fictional-release-journal');
        const b=await window.openJournal('fictional-release-journal');
        try {
          const parallel=await Promise.all([a.append(ref),b.append({...ref,idempotencyKey:'journal_key_B'})]);
          const keys=(await a.list(owner)).map(x=>x.idempotencyKey).sort();
          const collision=await Promise.allSettled([a.append({...ref,idempotencyKey:'journal_key_C'}),b.append({...ref,idempotencyKey:'journal_key_C',playerId:id(4)})]);
          const replay=await b.append(ref);
          await b.append({...ref,expectedAccountId:id(8)});
          const foreign=(await a.list({...owner,expectedAccountId:id(8)})).length;
          const otherSeason=(await a.list({...owner,expectedSeasonId:id(9)})).length;
          let requestSucceeded=false, rejected=false;
          const original=IDBObjectStore.prototype.add;
          IDBObjectStore.prototype.add=function(value,...rest) {
            const request=original.call(this,value,...rest);
            if(value.idempotencyKey==='journal_key_ABORT') request.addEventListener('success',()=>{
              requestSucceeded=true;this.transaction.abort();
            });
            return request;
          };
          try {await a.append({...ref,idempotencyKey:'journal_key_ABORT'});}catch {rejected=true;}
          finally {IDBObjectStore.prototype.add=original;}
          const final=(await b.list(owner)).map(x=>x.idempotencyKey).sort();
          a.close();b.close();
          const reopened=await window.openJournal('fictional-release-journal');
          const persisted=(await reopened.list(owner)).map(x=>x.idempotencyKey).sort();reopened.close();
          return {parallel,keys,collision:collision.map(x=>x.status),replay,foreign,otherSeason,requestSucceeded,rejected,final,persisted};
        } finally {a.close();b.close();}
      })()`);
    });
    assert.deepEqual(evidence.parallel,["inserted","inserted"]);
    assert.deepEqual(evidence.keys,["journal_key_A","journal_key_B"]);
    assert.deepEqual(evidence.collision.sort(),["fulfilled","rejected"]);
    assert.equal(evidence.replay,"existing");assert.equal(evidence.foreign,1);assert.equal(evidence.otherSeason,0);
    assert.equal(evidence.requestSucceeded,true);assert.equal(evidence.rejected,true);
    assert.deepEqual(evidence.final,["journal_key_A","journal_key_B","journal_key_C"]);
    assert.deepEqual(evidence.persisted,evidence.final);assert.deepEqual(requests,[]);
  } finally {await browser.close();}
});
