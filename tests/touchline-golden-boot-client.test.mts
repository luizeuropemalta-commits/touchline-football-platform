import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const epoch = Date.parse("2026-10-01T12:00:00Z");
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const envelope = (revision="10") => ({ servedAtMs: epoch, authority: {
  status:"ready", snapshotId:uuid(3), competitionId:uuid(1), seasonId:uuid(2), revision,
  playerIds:[uuid(4),uuid(5)], expiresAt:new Date(epoch+60_000).toISOString(), freshnessAuthority:"fetch-age-only",
} });
async function flush() { for(let i=0;i<12;i++) await Promise.resolve(); }
function harness() {
  let clock = 0, timerId = 0;
  const timers = new Map<number,{fn:()=>void;delay:number}>();
  const events = new Map<string,Set<()=>void>>();
  const eventTarget = {
    addEventListener(name:string,fn:()=>void) { if(!events.has(name)) events.set(name,new Set()); events.get(name)!.add(fn); },
    removeEventListener(name:string,fn:()=>void) { events.get(name)?.delete(fn); },
  };
  const doc = { ...eventTarget, visibilityState:"visible" };
  const nav = { onLine:true };
  const win = { ...eventTarget,
    setTimeout(fn:()=>void,delay:number) { timers.set(++timerId,{fn,delay}); return timerId; },
    clearTimeout(id:number) { timers.delete(id); },
  };
  const requests: Array<{url:string;signal:AbortSignal;resolve:(response:Response)=>void;reject:(reason:Error)=>void}> = [];
  type Store = { subscribe:(fn:()=>void)=>()=>void; get:()=>readonly string[]; server:()=>readonly string[] };
  let store:Store;
  const imports = new Map<string,unknown>();
  function load(name:string):unknown {
    if(imports.has(name)) return imports.get(name);
    const source = readFileSync(new URL(`../lib/touchlineArena/${name}.ts`,import.meta.url),"utf8");
    const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exports:Record<string,unknown> = {};
    const react = { useSyncExternalStore(subscribe:Store["subscribe"],get:Store["get"],server:Store["server"]) {
      store={subscribe,get,server}; return get();
    } };
    vm.runInNewContext(output, {exports,require:(key:string)=>key==="react"?react:load(key.replace(/^\.\//,"")),
      window:win,document:doc,navigator:nav,performance:{now:()=>clock},AbortController,
      fetch:(url:string,options:{signal:AbortSignal})=>new Promise<Response>((resolve,reject)=>requests.push({url,signal:options.signal,resolve,reject})),
    });
    imports.set(name,exports); return exports;
  }
  const client = load("golden-boot-client") as typeof import("../lib/touchlineArena/golden-boot-client.ts");
  return {
    requests,timers,doc,nav,events,client,
    connect(enabled=true) { client.useTouchlineGoldenBootPlayers(enabled); const selected=store!; return { ...selected, close:selected.subscribe(()=>{}) }; },
    advance(ms:number) { clock+=ms; },
    event(name:string) { [...(events.get(name)??[])].forEach(fn=>fn()); },
    fire(delay:number) { const entry=[...timers].find(([,v])=>v.delay===delay); assert.ok(entry,`missing ${delay}ms timer`); timers.delete(entry[0]); entry[1].fn(); },
  };
}

test("all cards share one request; disabled and SSR snapshots contain no award",async()=>{
  const h=harness(); const disabled=h.connect(false);
  assert.equal(disabled.get().length,0); assert.equal(h.requests.length,0);
  const a=h.connect(), b=h.connect(); await flush();
  assert.equal(h.requests.length,1); assert.equal(a.server().length,0);
  assert.equal(h.requests[0]!.url,"/api/touchline-awards/golden-boot");
  h.requests[0]!.resolve(Response.json(envelope())); await flush();
  assert.equal(a.get().length,2); assert.equal(b.get(),a.get());
  a.close(); assert.ok(h.timers.size);
  b.close(); disabled.close(); assert.equal(h.timers.size,0);
  assert.equal([...h.events.values()].reduce((sum,set)=>sum+set.size,0),0);
});

test("expiry removes the boot independently of a pending network request",async()=>{
  const h=harness(), store=h.connect(); await flush();
  h.requests[0]!.resolve(Response.json(envelope())); await flush();
  h.advance(10_000); h.fire(10_000); await flush(); assert.equal(h.requests.length,2);
  h.advance(50_000); h.fire(60_000); assert.equal(store.get().length,0);
  h.requests[1]!.resolve(Response.json(envelope())); await flush();
  assert.equal(store.get().length,0); store.close();
});

test("new authority for unchanged leaders preserves the shared render snapshot but renews expiry",async()=>{
  const h=harness(), store=h.connect(); await flush();
  h.requests[0]!.resolve(Response.json(envelope())); await flush();
  const initial=store.get(); assert.equal(initial.length,2);
  h.advance(10_000); h.fire(10_000); await flush();
  const refreshed=envelope("12");
  refreshed.servedAtMs=epoch+10_000;
  refreshed.authority.expiresAt=new Date(epoch+70_000).toISOString();
  h.requests[1]!.resolve(Response.json(refreshed)); await flush();
  assert.equal(store.get(),initial,"unchanged leader IDs must not rerender every mounted card");
  h.advance(60_000); h.fire(60_000);
  assert.equal(store.get().length,0,"stable render snapshot must still expire on the new deadline");
  store.close(); assert.equal(h.timers.size,0);
});

test("hidden/offline aborts and revokes; old callback cannot revive the award",async()=>{
  const h=harness(), store=h.connect(); await flush();
  h.doc.visibilityState="hidden"; h.event("visibilitychange");
  assert.equal(h.requests[0]!.signal.aborted,true); assert.equal(h.timers.size,0);
  h.doc.visibilityState="visible"; h.event("visibilitychange"); await flush();
  h.requests[1]!.resolve(Response.json(envelope("12"))); await flush();
  assert.equal(store.get().length,2);
  h.requests[0]!.resolve(Response.json(envelope())); await flush(); assert.equal(store.get().length,2);
  h.nav.onLine=false; h.event("offline"); assert.equal(store.get().length,0);
  assert.equal(h.timers.size,0); store.close();
});

test("ignored abort and late rejection cannot block polling or expose stale awards",async()=>{
  const h=harness(), store=h.connect(); await flush();
  h.advance(5_000); h.fire(5_000); await flush();
  assert.equal(store.get().length,0); assert.equal(h.requests[0]!.signal.aborted,true);
  h.requests[0]!.reject(Error("late transport failure")); await flush();
  h.advance(30_000); h.fire(30_000); await flush(); assert.equal(h.requests.length,2);
  store.close(); assert.equal(h.requests[1]!.signal.aborted,true); assert.equal(h.timers.size,0);
});

test("stalled JSON expires at the request deadline and its late rejection is contained",async()=>{
  const h=harness(), store=h.connect(); await flush();
  let rejectJson!: (reason:Error)=>void;
  h.requests[0]!.resolve({ok:true,json:()=>new Promise((_,reject)=>{rejectJson=reject;})} as Response);
  await flush();
  h.advance(5_000); h.fire(5_000); await flush();
  assert.equal(store.get().length,0);
  assert.equal(h.requests[0]!.signal.aborted,true);
  rejectJson(Error("late JSON failure")); await flush();
  h.advance(30_000); h.fire(30_000); await flush();
  assert.equal(h.requests.length,2);
  h.requests[1]!.resolve(Response.json({...envelope("12"),servedAtMs:epoch+35_000}));
  await flush(); assert.equal(store.get().length,2);
  store.close(); assert.equal(h.timers.size,0);
});

test("pagehide and remount preserve revocation until a newer authority arrives",async()=>{
  const h=harness(), first=h.connect(); await flush();
  h.requests[0]!.resolve(Response.json(envelope())); await flush();
  assert.equal(first.get().length,2);
  h.event("pagehide"); assert.equal(first.get().length,0); assert.equal(h.timers.size,0);
  h.event("pageshow"); await flush(); assert.equal(h.requests.length,2);
  h.requests[1]!.resolve(Response.json(envelope())); await flush();
  assert.equal(first.get().length,0,"same revision must not revive a revoked award");
  first.close(); assert.equal(h.timers.size,0);
  const second=h.connect(); await flush(); assert.equal(h.requests.length,3);
  h.requests[2]!.resolve(Response.json(envelope())); await flush();
  assert.equal(second.get().length,0,"unmount must not reset the revision watermark");
  h.advance(30_000); h.fire(30_000); await flush();
  h.requests[3]!.resolve(Response.json({...envelope("12"),servedAtMs:epoch+30_000}));
  await flush(); assert.equal(second.get().length,2);
  second.close(); assert.equal(h.timers.size,0);
  assert.equal([...h.events.values()].reduce((sum,set)=>sum+set.size,0),0);
});
