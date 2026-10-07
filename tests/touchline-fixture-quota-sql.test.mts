import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(runtime) : { PGlite: null };
const sql = ["20261002152457_touchline_fixture_quota_authority.sql", "20261003233637_touchline_sportmonks_prequery_authority.sql"]
  .map(name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")).join("\n");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("forward authority expands only the endpoint constraint and existing service-only RPCs", () => {
  const forward = readFileSync(new URL("../supabase/migrations/20261003233637_touchline_sportmonks_prequery_authority.sql",import.meta.url),"utf8");
  assert.doesNotMatch(forward,/create table|truncate|delete from|set enabled\s*=\s*true/i);
  assert.match(forward,/for update/);
  assert.match(forward,/security definer set search_path = ''/);
  assert.match(forward,/revoke all on function public\.touchline_fixture_quota_admit/);
  assert.match(forward,/grant execute on function public\.touchline_fixture_quota_complete[\s\S]*to service_role/);
});

test("actual forward SQL: four exact tuples, mismatches, transport uncertainty, cooldown and replay fail closed", {skip:!runtime}, async () => {
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;"); await db.exec(sql);
    const tuples=[["league","League"],["season","Season"],["stages","Stage"],["topscorers","Topscorer"]] as const;
    for (const [endpoint,entity] of tuples) {
      for (const mode of ["success","wrong-entity","null-entity","wrong-operation","transport","cooldown"] as const) {
        const scope=`${endpoint}-${mode}`;
        await db.query("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values($1,true)",[scope]);
        const admit=async(n:number)=>(await db.query("select public.touchline_fixture_quota_admit($1,$2,$3,1,60000) v",[scope,id(n),endpoint])).rows[0].v;
        const first=await admit(1); assert.equal(first.allowed,true);
        assert.deepEqual(await admit(2),{allowed:false},"single token spans endpoints and instances");
        const obs={requestId:id(1),attempt:1,operation:mode==="wrong-operation"?"fixture":endpoint,
          observedAt:new Date().toISOString(),status:mode==="transport"?0:mode==="cooldown"?429:200,
          remaining:mode==="cooldown"?0:10,requestedEntity:mode==="wrong-entity"?`${entity}s`:mode==="null-entity"?null:entity,
          resetAt:new Date(Date.now()+120000).toISOString(),cooldownUntil:mode==="cooldown"?new Date(Date.now()+120000).toISOString():null};
        const complete=async(value:unknown)=>(await db.query("select public.touchline_fixture_quota_complete($1,$2,$3,1,$4,$5::jsonb) v",[scope,id(1),endpoint,first.token,JSON.stringify(value)])).rows[0].v;
        assert.deepEqual(await complete(obs),{persisted:mode!=="wrong-operation"});
        assert.deepEqual(await admit(1),{allowed:false},"request replay never admits another HTTP call");
        const next=await admit(2); assert.equal(next.allowed,mode==="success");
        if (mode!=="wrong-operation") assert.deepEqual(await complete(obs),{persisted:true},"identical receipt replay is idempotent");
        const state=(await db.query("select blocked_unknown,active_token,cooldown_until > clock_timestamp() cooling from public.touchline_fixture_quota_scopes where account_scope=$1",[scope])).rows[0];
        if (["wrong-entity","null-entity","transport"].includes(mode)) assert.equal(state.blocked_unknown,true);
        if (mode==="cooldown") assert.equal(state.cooling,true);
        if (mode==="wrong-operation") assert.equal(state.active_token,first.token,"invalid completion must not release ownership");
        assert.equal((await db.query("select count(*)::int n from public.touchline_fixture_quota_attempts where account_scope=$1",[scope])).rows[0].n,mode==="success"?2:1);
      }
    }
  } finally { await db.close(); }
});

test("actual Fixture SQL: missing quota metadata cannot authorize the next HTTP attempt", {skip:!runtime}, async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(sql);
    for (const status of [0, 200, 503]) {
      const scope = `unknown-${status}`;
      await db.query("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values($1,true)", [scope]);
      const first = (await db.query("select public.touchline_fixture_quota_admit($1,$2,'inplay',1,60000) v", [scope,id(1)])).rows[0].v;
      assert.equal(first.allowed, true);
      const obs = {requestId:id(1),attempt:1,operation:"fixture",observedAt:new Date().toISOString(),status,
        remaining:null,requestedEntity:null,resetAt:null,cooldownUntil:null};
      assert.deepEqual((await db.query("select public.touchline_fixture_quota_complete($1,$2,'inplay',1,$3,$4::jsonb) v",
        [scope,id(1),first.token,JSON.stringify(obs)])).rows[0].v, {persisted:true});
      assert.deepEqual((await db.query("select public.touchline_fixture_quota_admit($1,$2,'inplay',1,60000) v", [scope,id(2)])).rows[0].v,
        {allowed:false}, `status ${status} without quota is not permission to retry`);
    }
  } finally { await db.close(); }
});

test("actual Fixture SQL: default-off, mutual exclusion, absolute cooldown, replay and recovery", {skip:!runtime}, async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(sql);
    const admit = async (n: number, scope = "qa-main") => (await db.query(
      "select public.touchline_fixture_quota_admit($1,$2,'inplay',1,60000) as v", [scope,id(n)])).rows[0].v;
    const complete = async (n: number, token: string, obs: unknown) => (await db.query(
      "select public.touchline_fixture_quota_complete('qa-main',$1,'inplay',1,$2,$3::jsonb) as v",
      [id(n),token,JSON.stringify(obs)])).rows[0].v;
    const state = async () => (await db.query("select * from public.touchline_fixture_quota_scopes where account_scope='qa-main'")).rows[0];
    const observation = (n: number, remaining = 0, requestedEntity: string | null = "Fixture") => ({
      requestId:id(n),attempt:1,operation:"fixture",observedAt:new Date().toISOString(),status:remaining===0?429:200,
      remaining,requestedEntity,resetAt:new Date(Date.now()+120000).toISOString(),
      cooldownUntil:remaining===0?new Date(Date.now()+120000).toISOString():null,
    });
    assert.deepEqual(await admit(1), {allowed:false});
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope) values('qa-main');");
    assert.deepEqual(await admit(1), {allowed:false});
    await db.exec("update public.touchline_fixture_quota_scopes set enabled=true where account_scope='qa-main';");
    const first = await admit(1); assert.equal(first.allowed,true);
    assert.deepEqual(await admit(2), {allowed:false});
    assert.deepEqual(await admit(1), {allowed:false});
    const obs=observation(1);
    assert.deepEqual(await complete(1,id(99),obs),{persisted:false});
    assert.deepEqual(await complete(1,first.token,obs),{persisted:true});
    const deadline = new Date((await state()).cooldown_until).toISOString();
    assert.equal(deadline,obs.cooldownUntil);
    assert.deepEqual(await admit(2), {allowed:false});
    assert.deepEqual(await complete(1,first.token,obs),{persisted:true});
    assert.equal(new Date((await state()).cooldown_until).toISOString(),deadline);
    assert.deepEqual(await complete(1,first.token,{...obs,cooldownUntil:null}),{persisted:false});
    // Test-only clock-state advance, never a runtime recovery mechanism.
    await db.exec("update public.touchline_fixture_quota_scopes set cooldown_until=clock_timestamp()-interval '1 second' where account_scope='qa-main';");
    const second=await admit(2); assert.equal(second.allowed,true);
    assert.deepEqual(await complete(1,first.token,obs),{persisted:true});
    assert.equal((await state()).active_token,second.token);
    assert.deepEqual(await complete(2,second.token,observation(2,1)),{persisted:true});
    const third=await admit(3); assert.equal(third.allowed,true);
    assert.deepEqual(await complete(3,third.token,{...observation(3),resetAt:null,cooldownUntil:null}),{persisted:true});
    assert.equal((await state()).blocked_unknown,true);
    assert.deepEqual(await admit(4),{allowed:false});
    const acl=(await db.query("select has_function_privilege('anon','public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)','execute') anon, has_function_privilege('service_role','public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)','execute') service, has_table_privilege('service_role','public.touchline_fixture_quota_scopes','update') direct")).rows[0];
    assert.deepEqual(acl,{anon:false,service:true,direct:false});
    await db.exec("begin; update public.touchline_fixture_quota_scopes set blocked_unknown=false; rollback;");
    assert.equal((await state()).blocked_unknown,true);
  } finally { await db.close(); }
});

test("actual Fixture SQL: expired ownership and contradictory entity never reopen requests",{skip:!runtime},async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;"); await db.exec(sql);
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('qa-main',true);");
    const first=(await db.query("select public.touchline_fixture_quota_admit('qa-main',$1,'fixture',1,60000) v",[id(1)])).rows[0].v;
    const obs={requestId:id(1),attempt:1,operation:"fixture",observedAt:new Date().toISOString(),status:200,remaining:10,requestedEntity:"Stage",resetAt:null,cooldownUntil:null};
    await db.query("select public.touchline_fixture_quota_complete('qa-main',$1,'fixture',1,$2,$3::jsonb)",[id(1),first.token,JSON.stringify(obs)]);
    assert.equal((await db.query("select blocked_unknown from public.touchline_fixture_quota_scopes")).rows[0].blocked_unknown,true);
    await db.exec("update public.touchline_fixture_quota_scopes set blocked_unknown=false;");
    await db.query("select public.touchline_fixture_quota_admit('qa-main',$1,'fixture',1,60000)",[id(2)]);
    await db.exec("update public.touchline_fixture_quota_scopes set active_until=clock_timestamp()-interval '1 second';");
    assert.deepEqual((await db.query("select public.touchline_fixture_quota_admit('qa-main',$1,'fixture',1,60000) v",[id(3)])).rows[0].v,{allowed:false});
    assert.equal((await db.query("select blocked_unknown from public.touchline_fixture_quota_scopes")).rows[0].blocked_unknown,true);
  } finally { await db.close(); }
});
