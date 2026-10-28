import assert from "node:assert/strict";
import test from "node:test";
import { handleCoachEditorial, type CoachEditorialDependencies } from "../lib/touchlineArena/coach-editorial-handler.ts";
const actor = "11111111-1111-4111-8111-111111111111", candidate = "22222222-2222-4222-8222-222222222222", requestId = "33333333-3333-4333-8333-333333333333";
const input = { requestId, catalogueRevision: 1, candidateId: candidate, revision: 1, action: "approve", reason: "Current appointment checked against the official record", confirmed: true };
const request = (body: unknown = input, headers: Record<string,string> = {}, method = "POST") => new Request("https://example.test/api/admin/coaches", { method, ...(method === "GET" ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json", Origin: "https://example.test", ...headers } });
function fixture(options: { enabled?: boolean; owner?: boolean; allowed?: boolean; user?: boolean; authError?: boolean; rpcError?: { code:string }; unconfirmed?: boolean }={}) {
  const calls: Array<{ name:string; args?:Record<string,unknown> }> = [];
  const dependencies: CoachEditorialDependencies = { enabled: options.enabled !== false,
    actor: async () => { if(options.authError) throw new Error("private auth detail");return options.user === false ? null : { id:actor,owner:options.owner !== false,allowed:options.allowed !== false }; },
    rpc: async (name,args) => { calls.push({name,args});if(options.rpcError)throw options.rpcError;
      return name === "touchline_read_coach_editorial" ? { revision:0,publicEnabled:false,currentCount:0,candidates:[] } : options.unconfirmed ? {} : {requestId:args?.p_request_id,action:args?.p_action}; } };
  return { calls, run: (req:Request) => handleCoachEditorial(req,dependencies) };
}
test("coach editorial: feature gate, owner, session and same-origin are required before mutation",async()=>{
  for(const options of [{enabled:false},{owner:false},{allowed:false},{user:false},{authError:true}]){const f=fixture(options);const r=await f.run(request());assert.ok([403,503].includes(r.status));assert.equal(f.calls.length,0);assert.doesNotMatch(await r.text(),/private auth detail/);}
  for(const headers of [{Origin:"https://other.test"},{Origin:""},{"sec-fetch-site":"cross-site"}]){const f=fixture();assert.equal((await f.run(request(input,headers))).status,403);assert.equal(f.calls.length,0);}
});
test("coach editorial: bounded JSON, exact fields and no client names, prices or actor IDs",async()=>{
  for(const body of [{...input,actorId:actor},{...input,price:10},{...input,name:"Invented"},{...input,revision:0},{...input,confirmed:false},{...input,reason:"short"},{...input,candidateId:"1"}]){const f=fixture();assert.equal((await f.run(request(body))).status,400);assert.equal(f.calls.length,0);}
  const f=fixture();assert.equal((await f.run(request(input,{"Content-Type":"text/plain"}))).status,400);
  let cancelled=false;
  const stream = new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(4097));},cancel(){cancelled=true;}});
  const streamed = new Request("https://example.test/api/admin/coaches",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:stream,duplex:"half"} as RequestInit);
  assert.equal((await f.run(streamed)).status,400);assert.equal(cancelled,true);assert.equal(f.calls.length,0);
});
test("coach editorial: explicit bootstrap uses only server's original 20 IDs/classifications",async()=>{
  const f=fixture(),r=await f.run(request({...input,action:"bootstrap",candidateId:null,revision:null}));assert.equal(r.status,200);assert.equal(f.calls.length,1);
  const args=f.calls[0].args!;assert.equal(args.p_actor_id,actor);const seeds=args.p_bootstrap as Record<string,unknown>[];assert.equal(seeds.length,20);assert.equal(new Set(seeds.map(s=>s.providerId)).size,20);assert.equal(seeds.find(s=>s.providerId==="307")?.name,"Mikel Arteta");assert.doesNotMatch(JSON.stringify(seeds),/price|valueEur|market_value/);
});
test("coach editorial: command returns only confirmed receipt, conflicts require review and GET is read-only",async()=>{
  const f=fixture();assert.equal((await f.run(request())).status,200);assert.equal(f.calls.length,1);assert.equal(f.calls[0].args?.p_revision,1);assert.equal(f.calls[0].args?.p_bootstrap,null);
  for(const code of ["40001","23505","22023"]){const e=fixture({rpcError:{code}});assert.equal((await e.run(request())).status,409);assert.equal(e.calls.length,1);}
  assert.equal((await fixture({unconfirmed:true}).run(request())).status,503);
  const read=fixture(),r=await read.run(request(null,{},"GET"));assert.equal(r.status,200);assert.equal(r.headers.get("Cache-Control"),"private, no-store");assert.equal(read.calls[0].name,"touchline_read_coach_editorial");
});
