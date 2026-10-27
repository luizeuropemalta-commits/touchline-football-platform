import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { bundleIsolatedBrowserFixture } from "./helpers/touchline-isolated-browser-bundle.mts";
import { requireBrowserCapacity } from "./helpers/touchline-browser-capacity.mts";

const selectedCase=process.env.TOUCHLINE_RELEASE_JOURNAL_CASE;
assert.ok(selectedCase===undefined||["existing","removal"].includes(selectedCase),"invalid journal browser case");

test("real IndexedDB journal: two connections, immutable keys and post-success abort", {
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
  } finally {t.signal.removeEventListener("abort",abort);await close();}
});

test("real IndexedDB removal commits exact identity and rolls back request errors or post-success abort", {
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
      if(route.request().url()==="https://release-journal.invalid/removal"&&route.request().method()==="GET")
        await route.fulfill({contentType:"text/html; charset=utf-8",body:`<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.script.replace(/<\/script/gi,"<\\/script")}</script>`});
      else {requests.push(`${route.request().method()} ${route.request().url()}`);await route.abort();}
    });
    const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
    await page.goto("https://release-journal.invalid/removal");
    const evidence=await page.evaluate(()=>window.eval(`(async()=>{
      const id=n=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
      const owner={expectedAccountId:id(1),expectedSeasonId:id(2)};
      const ref={schemaVersion:1,createdAt:1,...owner,action:'release',playerId:id(3),expectedRevision:4,idempotencyKey:'remove_key_A'};
      const foreignAccount={...ref,expectedAccountId:id(8)};
      const foreignSeason={...ref,expectedSeasonId:id(9)};
      const sentinel={...ref,idempotencyKey:'remove_key_KEEP'};
      const a=await window.openJournal('fictional-removal-journal');
      const b=await window.openJournal('fictional-removal-journal');
      const outcome=async input=>{try {await a.remove(input);return 'fulfilled';}catch(error){return error.message;}};
      const snapshot=async journal=>({own:await journal.list(owner),account:await journal.list(foreignAccount),season:await journal.list(foreignSeason)});
      try {
        for(const row of [ref,foreignAccount,foreignSeason,sentinel]) await a.append(row);
        const initial=await snapshot(b);
        const mismatches=[];
        for(const patch of [{createdAt:2},{playerId:id(4)},{expectedRevision:5}])
          mismatches.push({patch,outcome:await outcome({...ref,...patch}),snapshot:await snapshot(b)});
        const invalid=[];
        for(const patch of [{schemaVersion:2},{action:'acquire'},{expectedAccountId:'invalid'},{expectedSeasonId:'invalid'}])
          invalid.push({patch,outcome:await outcome({...ref,...patch}),snapshot:await snapshot(b)});
        const missing=await outcome({...ref,idempotencyKey:'remove_key_MISSING'});
        const missingAccount=await outcome({...ref,expectedAccountId:id(10)});
        const missingSeason=await outcome({...ref,expectedSeasonId:id(11)});
        const afterMissing=await snapshot(b);
        const originalDelete=IDBObjectStore.prototype.delete;
        const faults=[];
        for(const mode of ['constraint','abort']) {
          let deleteSucceeded=false,requestError=null,transactionAborted=false,transactionError=null,transactionComplete=false;
          let observedTransaction=Promise.resolve();
          IDBObjectStore.prototype.delete=function(key) {
            const request=originalDelete.call(this,key);
            const tx=this.transaction;
            observedTransaction=new Promise(resolve=>{
              tx.addEventListener('abort',()=>{transactionAborted=true;transactionError=tx.error?.name??null;resolve();});
              tx.addEventListener('complete',()=>{transactionComplete=true;resolve();});
            });
            request.addEventListener('success',()=>{deleteSucceeded=true;if(mode==='abort')tx.abort();});
            // A REAL duplicate-key request poisons the same readwrite transaction.
            // Do not mock a rejection: successful deletion must roll back atomically.
            if(mode==='constraint') {
              const duplicate=this.add(sentinel);
              duplicate.addEventListener('error',()=>{requestError=duplicate.error?.name??null;});
            }
            return request;
          };
          let result;
          try {result=await outcome(ref);}finally {IDBObjectStore.prototype.delete=originalDelete;}
          await observedTransaction;
          faults.push({mode,result,deleteSucceeded,requestError,transactionAborted,transactionError,transactionComplete,snapshot:await snapshot(b)});
        }
        let successDeleteRequest=false,successTransactionComplete=false,successCommitEvents=0,successTransactions=0;
        const originalTransaction=IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction=function(...args) {
          const tx=originalTransaction.apply(this,args);
          successTransactions++;
          // Register before returning the transaction to the product, which
          // then installs oncomplete. A listener added later inside delete can
          // run after the product resolves and its await continuation executes;
          // capture:true on that late listener does not establish this order.
          tx.addEventListener('complete',event=>{
            successCommitEvents++;
            successTransactionComplete=event.isTrusted&&event.target===tx;
          },{once:true});
          return tx;
        };
        IDBObjectStore.prototype.delete=function(key) {
          const request=originalDelete.call(this,key);
          request.addEventListener('success',()=>{successDeleteRequest=true;});
          return request;
        };
        let success,completedWhenResolved;
        try {success=await outcome(ref);completedWhenResolved=successTransactionComplete;}
        finally {IDBObjectStore.prototype.delete=originalDelete;IDBDatabase.prototype.transaction=originalTransaction;}
        const afterSuccess=await snapshot(b);
        const repeated=await outcome(ref);
        a.close();b.close();
        const reopened=await window.openJournal('fictional-removal-journal');
        let persisted;try {persisted=await snapshot(reopened);}finally {reopened.close();}
        return {ref,foreignAccount,foreignSeason,sentinel,initial,mismatches,invalid,missing,missingAccount,missingSeason,afterMissing,faults,success,successDeleteRequest,successTransactions,successCommitEvents,completedWhenResolved,afterSuccess,repeated,persisted};
      }finally {a.close();b.close();}
    })()`));
    assert.deepEqual(evidence.initial,{own:[evidence.ref,evidence.sentinel],account:[evidence.foreignAccount],season:[evidence.foreignSeason]});
    assert.equal(evidence.mismatches.length,3);
    for(const row of evidence.mismatches){assert.equal(row.outcome,"RECOVERY_REFERENCE_CONFLICT");assert.deepEqual(row.snapshot,evidence.initial);}
    assert.equal(evidence.invalid.length,4);
    for(const row of evidence.invalid){assert.equal(row.outcome,"RECOVERY_REFERENCE_INVALID");assert.deepEqual(row.snapshot,evidence.initial);}
    assert.deepEqual([evidence.missing,evidence.missingAccount,evidence.missingSeason],["fulfilled","fulfilled","fulfilled"]);
    assert.deepEqual(evidence.afterMissing,evidence.initial);
    assert.deepEqual(evidence.faults.map((row:{mode:string})=>row.mode),["constraint","abort"]);
    for(const row of evidence.faults){
      assert.equal(row.deleteSucceeded,true,"exercise failure AFTER delete request success");
      assert.notEqual(row.result,"fulfilled","request success must not confirm transaction success");
      assert.equal(row.transactionAborted,true);assert.equal(row.transactionComplete,false);
      assert.deepEqual(row.snapshot,evidence.initial,"failed removal preserves all complete references");
    }
    assert.equal(evidence.faults[0].requestError,"ConstraintError");assert.equal(evidence.faults[0].transactionError,"ConstraintError");
    assert.equal(evidence.faults[1].requestError,null);assert.equal(evidence.faults[1].result,"RECOVERY_JOURNAL_ABORTED");
    assert.equal(evidence.successTransactions,1);assert.equal(evidence.successCommitEvents,1);
    assert.equal(evidence.successDeleteRequest,true);assert.equal(evidence.completedWhenResolved,true,"remove resolves only after real transaction completion observed before the product completion callback");
    assert.deepEqual([evidence.success,evidence.repeated],["fulfilled","fulfilled"]);
    assert.deepEqual(evidence.afterSuccess,{own:[evidence.sentinel],account:[evidence.foreignAccount],season:[evidence.foreignSeason]});
    assert.deepEqual(evidence.persisted,evidence.afterSuccess);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
    capacity();t.diagnostic(JSON.stringify({engine:selectedEngine??"chromium",case:"removal",evidence,
      boundary:"real local IndexedDB; synthetic references only; no authenticated settlement, network API, or financial action"}));
  }finally {t.signal.removeEventListener("abort",abort);await close();}
});
