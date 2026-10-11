import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";
import { TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS, TOUCHLINE_FANTASY_BETA_BUDGET_EUR } from "../lib/touchlineFantasy/market-plan-policy.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const load = (source: string, output: string, context: object = {}) => runInNewContext(
  `${stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "")}\n${output};`,
  { TextDecoder, TextEncoder, setTimeout, clearTimeout, ...context },
);
const api = load(read("../lib/touchlineFantasy/beta-enrollment-server.ts"), "({readBetaEnrollmentCommand,enrollBeta})", {
  TOUCHLINE_FANTASY_BETA_ALLOWED_CLUB_TEAM_IDS, TOUCHLINE_FANTASY_BETA_BUDGET_EUR,
});
const user = { id: "10000000-0000-4000-8000-000000000002", email: "member@example.com" };
const receipt = { ok: true, planKey: "beta", status: "active", budgetEur: 50000000, allowedClubTeamIds: ["22", "117", "116", "52"] };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("Beta accepts only a bounded empty JSON object, never a requested plan or another account", async () => {
  const request = (body: string, headers: Record<string,string> = {}) => new Request("https://qa.example/api/touchline-fantasy/beta/enroll", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body,
  });
  assert.equal(await api.readBetaEnrollmentCommand(request("{}")), true);
  for (const body of ["", "null", "[]", "true", "{", JSON.stringify({ userId: user.id }), JSON.stringify({ planKey: "vip" }), JSON.stringify({ budgetEur: 50000000 }), JSON.stringify({}), " ".repeat(127) + "{}"]) {
    if (body === "{}") continue;
    assert.equal(await api.readBetaEnrollmentCommand(request(body)), false, body);
  }
  assert.equal(await api.readBetaEnrollmentCommand(request("{}", { "content-type": "text/plain" })), false);
  assert.equal(await api.readBetaEnrollmentCommand(request("{}", { "content-length": "129" })), false);
  assert.equal(await api.readBetaEnrollmentCommand(request("{}", { "content-length": "x" })), false);
  const controller = new AbortController(); controller.abort();
  assert.equal(await api.readBetaEnrollmentCommand(new Request("https://qa.example", {
    method:"POST", headers:{"content-type":"application/json"}, body:"{}", signal:controller.signal,
  })), false);
});

test("Beta RPC binds canonical user and accepts only the exact persisted Beta policy", async () => {
  let calls = 0;
  const result = await api.enrollBeta({ rpc: async (name: string, args: object) => {
    calls++; assert.equal(name, "touchline_fantasy_enroll_beta");
    assert.deepEqual(plain(args), { p_user_id: user.id, p_user_email: user.email });
    return { data: { ...receipt, internal: "not-public" }, error: null };
  } }, { ...user, email: " MEMBER@EXAMPLE.COM " });
  assert.equal(calls, 1); assert.deepEqual(plain(result), { status:200, body:receipt });
  for (const bad of [null, { ...receipt, planKey:"vip" }, { ...receipt, status:"expired" },
    { ...receipt, budgetEur:90000000 }, { ...receipt, allowedClubTeamIds:["22","117","116","999"] },
    { ...receipt, allowedClubTeamIds:["22","117","116","52","19"] }]) {
    assert.equal((await api.enrollBeta({rpc:async()=>({data:bad,error:null})},user)).status,503);
  }
  for (const [message,status] of [["BETA_ACTIVE_PLAN_PRESERVED",409],["BETA_EXISTING_PLAN_REQUIRES_REVIEW",409],
    ["BETA_FORBIDDEN",403],["BETA_OWNER_EXCLUDED",403],["database secret detail",503]] as const) {
    const response=await api.enrollBeta({rpc:async()=>({data:null,error:{message}})},user);
    assert.equal(response.status,status);assert.equal(response.body.error,status===503 ? "BETA_UNAVAILABLE" : message);
  }
});

function routeHarness(options: { owner?: boolean; access?: boolean; authenticated?: boolean; confirmed?: boolean; error?: string } = {}) {
  const calls={auth:0,admin:0,rpc:0};
  const handler=load(read("../app/api/touchline-fantasy/beta/enroll/route.ts"),"POST",{
    NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)},
    createClient:async()=>({auth:{getUser:async()=>{calls.auth++;return {data:{user:options.authenticated===false ? null : {
      ...user,email_confirmed_at:options.confirmed===false ? null : "2026-10-11T00:00:00Z",
      app_metadata:{touchline_arena_access_v1:options.access!==false},user_metadata:{touchline_arena_access_v1:true},
    }},error:null};}}}),
    createAdminClient:()=>{calls.admin++;return {rpc:async(_name:string,args:object)=>{calls.rpc++;
      assert.deepEqual(plain(args),{p_user_id:user.id,p_user_email:user.email});
      return {data:options.error ? null : receipt,error:options.error ? {message:options.error}:null};}};},
    isOwnerEmail:()=>options.owner===true,hasTouchLineArenaAccess,resolveServerReadWithin,...api,
  });
  const request=(body:unknown={},headers:Record<string,string>={})=>{
    const req=new Request("https://qa.example/api/touchline-fantasy/beta/enroll",{
      method:"POST",headers:{"content-type":"application/json",origin:"https://qa.example",...headers},body:JSON.stringify(body),
    });Object.defineProperty(req,"nextUrl",{value:new URL(req.url)});return req;
  };
  return {handler,calls,request};
}

test("Beta route rejects unverified, unauthenticated, owner or no-access sessions before service role", async()=>{
  for(const options of [{owner:true},{access:false},{authenticated:false},{confirmed:false}]) {
    const h=routeHarness(options),response=await h.handler(h.request());assert.equal(response.status,403);
    assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(h.calls.admin,0);assert.equal(h.calls.rpc,0);
  }
  const cross=routeHarness();
  for(const headers of [{origin:"https://evil.example"},{origin:"null"},{"sec-fetch-site":"cross-site"}]) {
    assert.equal((await cross.handler(cross.request({},headers))).status,403);
  }
  assert.equal(cross.calls.auth,0);
});

test("Beta route has no caller-controlled target and reports only confirmed persistence",async()=>{
  for(const body of [{userId:user.id},{email:user.email},{planKey:"beta"},{budgetEur:50000000},{commandId:"ignored"},[]]) {
    const h=routeHarness();assert.equal((await h.handler(h.request(body))).status,400);assert.equal(h.calls.admin,0);
  }
  const h=routeHarness();
  for(let retry=0;retry<2;retry++) {
    const response=await h.handler(h.request());assert.equal(response.status,200);assert.deepEqual(await response.json(),receipt);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
  }
  assert.equal(h.calls.rpc,2,"one RPC per explicit request, without internal retries");
  const preserved=routeHarness({error:"BETA_ACTIVE_PLAN_PRESERVED"});assert.equal((await preserved.handler(preserved.request())).status,409);
  const unknown=routeHarness({error:"secret transport error"}),response=await unknown.handler(unknown.request());
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,error:"BETA_UNAVAILABLE"});
});
