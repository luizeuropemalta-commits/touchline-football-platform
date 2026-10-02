// Local SQL/functions/RLS/triggers exercised against
// minimal canonical table fixtures; not the full installed TouchLine schema.
// One PGlite instance, serial subtests, always closed. No network or credentials.
// Does NOT prove real multi-session locking, source-writer production ACLs,
// adapter provenance, full TS editorial parity or rendered browser behavior.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseGoldenBootPublicAuthority, createGoldenBootAuthorityState, advanceGoldenBootAuthority, hasGoldenBoot } from "../lib/touchlineArena/golden-boot-public-authority.ts";

const modulePath = process.env.TOUCHLINE_GOLDEN_BOOT_PGLITE_MODULE;
const { PGlite } = modulePath ? await import(modulePath) : { PGlite: null };
const proposal = readFileSync(new URL("../supabase/migrations/20261001194607_touchline_golden_boot_authority.sql", import.meta.url), "utf8");
const seasonLabelsMigration = readFileSync(new URL("../supabase/migrations/20261002092823_touchline_golden_boot_season_labels.sql", import.meta.url), "utf8");
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const comp=uuid(1), season=uuid(2), club=uuid(3), player=uuid(10), player2=uuid(11), member=uuid(20), member2=uuid(21);
type Json = Record<string, unknown>;

const schema = `
create role anon; create role authenticated; create role service_role bypassrls;
create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text);
create table public.football_seasons(id uuid primary key,provider text,provider_season_id text,competition_id uuid,is_current boolean,name text);
create table public.football_clubs(id uuid primary key,provider text,provider_team_id text,competition_id uuid);
create table public.football_players(id uuid primary key,provider text,provider_player_id text,current_club_id uuid);
create table public.football_squad_members(id uuid primary key,provider text,player_id uuid,club_id uuid,competition_id uuid,status text);
create table public.touchline_card_publications(player_id uuid primary key,current_membership_id uuid,competition_id uuid,effective_season text,
  publication_status text,last_reviewed_at timestamptz,calculated_tier text,calculated_nominal_price_gbp numeric,internal_source text);
create table public.football_player_market_values(player_id uuid primary key,verified_season text,market_value_eur numeric,status text,confidence text,source text);
create table public.touchline_card_editorial_overrides(player_id uuid,field_key text,status text,provenance_status text,effective_value jsonb,
  last_verification_at timestamptz,next_verification_at timestamptz);
grant select,insert,update,delete on all tables in schema public to service_role;
insert into public.football_competitions values('${comp}','sportmonks','8');
insert into public.football_seasons values('${season}','sportmonks','70001','${comp}',true,'2026/2027');
insert into public.football_clubs values('${club}','sportmonks','300','${comp}');
insert into public.football_players values('${player}','sportmonks','200','${club}'),('${player2}','sportmonks','201','${club}');
insert into public.football_squad_members values('${member}','sportmonks','${player}','${club}','${comp}','active'),
  ('${member2}','sportmonks','${player2}','${club}','${comp}','active');
insert into public.touchline_card_publications values('${player}','${member}','${comp}','2026-27','published',now(),'ruby-red',10,'editorial'),
  ('${player2}','${member2}','${comp}','2026-27','published',now(),'ruby-red',10,'editorial');
insert into public.football_player_market_values values('${player}','2026-27',2500000,'verified','verified','editorial'),
  ('${player2}','2026-27',2500000,'verified','verified','editorial');
`;

function evidence(stageOffset=1000, scorerOffset=1000) {
  const stagesTime=new Date(Date.now()-stageOffset).toISOString(), scorersTime=new Date(Date.now()-scorerOffset).toISOString();
  const stages={ok:true,provider:"sportmonks",cached:true,fetchedAt:stagesTime,data:{coverage:"complete",leagueId:"8",requestedSeasonId:"70001",
    fetchedAt:stagesTime,rows:[{id:"90001",typeId:"223",leagueId:"8",seasonId:"70001"}]}};
  const scorers={ok:true,provider:"sportmonks",fetchedAt:scorersTime,data:{coverage:"complete",scopeStatus:"complete",requestedSeasonId:"70001",
    fetchedAt:scorersTime,pagesRead:1,rows:["200","201"].map((p,i)=>({providerRecordId:String(400+i),providerPlayerId:p,
      providerTeamId:"300",goals:3,leagueId:"8",seasonId:"70001",stageId:"90001"}))}};
  const leaders=[player,player2].map((p,i)=>({player_id:p,provider_player_id:String(200+i),club_id:club,provider_team_id:"300",
    membership_id:[member,member2][i],goals:3}));
  return {stages,scorers,leaders};
}

test("GoldenBoot authority: real SQL atomic state/evidence/read contract", {timeout:120_000, skip: !modulePath}, async t=>{
  const db=new PGlite();
  try {
    await db.exec(schema);
    await db.exec(proposal);
    await db.exec(seasonLabelsMigration);
    async function payload(sql:string,args:unknown[]=[]):Promise<Json> {
      const result=await db.query(sql,args); return result.rows[0].payload;
    }
    async function revision():Promise<string> {
      return (await db.query("select revision::text value from public.touchline_golden_boot_source_revision where singleton")).rows[0].value;
    }
    const begin=async(token=randomUUID())=>{
      await db.query("select public.begin_touchline_golden_boot_refresh($1,$2,$3)",[comp,season,token]); return token;
    };
    const read=()=>payload("select public.read_touchline_golden_boot($1,$2) payload",[comp,season]);
    const workerGenerations=new Map<string,string>();
    async function finish(token:string,e=evidence(),rev?:string,ttl=60000,failure:string|null=null,generation=workerGenerations.get(token)??null) {
      return payload("select public.finish_touchline_golden_boot_refresh($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10) payload",
        [comp,season,token,rev??await revision(),JSON.stringify(e.stages),JSON.stringify(e.scorers),JSON.stringify(e.leaders),ttl,failure,generation]);
    }
    async function rejects(action:()=>Promise<unknown>,pattern:RegExp) {
      await db.exec("savepoint expected_error");
      try { await assert.rejects(action,pattern); }
      finally { await db.exec("rollback to expected_error; release expected_error"); }
    }
    async function scenario(name:string,body:()=>Promise<void>) {
      await t.test(name,async()=>{
        await db.exec("begin; set local role service_role");
        try { await body(); } finally { await db.exec("rollback"); }
      });
    }
    async function stateRow() {
      return (await db.query(`select token::text,revision::text,phase,snapshot_id::text,
        reason,finish_hash,newest_stages_fetch::text,newest_scorers_fetch::text
        from public.touchline_golden_boot_state where competition_id=$1 and season_id=$2`,[comp,season])).rows[0];
    }
    async function snapshotRows() {
      return (await db.query("select to_jsonb(a) value from public.touchline_golden_boot_snapshots a order by snapshot_id")).rows;
    }
    await scenario("absent -> pending -> ready includes every tie, scope and string revision",async()=>{
      const absent=await read(); assert.equal(absent.status,"unavailable"); assert.deepEqual(absent.playerIds,[]);
      const token=await begin(); const pending=await read();
      assert.equal(pending.status,"unavailable"); assert.ok(BigInt(pending.revision as string)>BigInt(absent.revision as string));
      await finish(token); const ready=await read();
      assert.equal(ready.status,"ready"); assert.deepEqual(ready.playerIds,[player,player2]);
      assert.equal(ready.competitionId,comp); assert.equal(ready.seasonId,season);
      assert.equal(typeof ready.revision,"string"); assert.ok(BigInt(ready.revision as string)>BigInt(pending.revision as string));
      assert.deepEqual(Object.keys(ready).sort(),["status","snapshotId","revision","competitionId","seasonId","playerIds","expiresAt","freshnessAuthority"].sort());
    });
    await scenario("SQL DTO is accepted by the real consumer independently of session timezone",async()=>{
      await finish(await begin());
      const original=await read();
      for(const timezone of ["UTC","Europe/Malta","Asia/Kolkata","America/New_York"]){
        await db.query("select set_config('TimeZone',$1,true)",[timezone]);
        const dto=await read();
        const parsed=parseGoldenBootPublicAuthority(dto);
        assert.ok(parsed,`real consumer rejected SQL DTO in ${timezone}: ${dto.expiresAt}`);
        assert.equal(Date.parse(parsed.expiresAt!),Date.parse(original.expiresAt as string));
        const state=advanceGoldenBootAuthority(createGoldenBootAuthorityState(comp,season),dto,Date.now());
        assert.equal(hasGoldenBoot(state,player,Date.now()),true);
        assert.equal(hasGoldenBoot(state,player2,Date.now()),true);
      }
    });
    await scenario("single public read resolves current canonical scope without creating state",async()=>{
      const current=()=>payload("select public.read_touchline_current_golden_boot() payload");
      async function checkClockAndAuthority() {
        const before=(await db.query("select ceil(extract(epoch from clock_timestamp())*1000)::bigint::text ms")).rows[0].ms;
        const dto=await current();
        const after=(await db.query("select ceil(extract(epoch from clock_timestamp())*1000)::bigint::text ms")).rows[0].ms;
        assert.ok(Number.isSafeInteger(dto.observedAtMs));
        assert.ok(dto.observedAtMs>=Number(before)&&dto.observedAtMs<=Number(after));
        const {observedAtMs: _clock,...authority}=dto;
        assert.deepEqual(authority,await read());
      }
      await checkClockAndAuthority();
      assert.equal((await db.query("select count(*)::integer n from public.touchline_golden_boot_state")).rows[0].n,0);
      await finish(await begin());
      await checkClockAndAuthority();
      await db.query("insert into public.football_seasons values($1,'sportmonks','70002',$2,true,'2027/2028')",[uuid(90),comp]);
      assert.equal(await current(),null,"ambiguous current season cannot choose a leader");
      await db.query("delete from public.football_seasons where id=$1",[uuid(90)]);
      await db.query("insert into public.football_competitions values($1,'sportmonks','8')",[uuid(91)]);
      assert.equal(await current(),null,"ambiguous competition cannot choose a scope");
    });
    await scenario("real consumer cannot restore a revoked SQL snapshot from a delayed response",async()=>{
      await finish(await begin());
      const ready=await read();
      let state=advanceGoldenBootAuthority(createGoldenBootAuthorityState(comp,season),ready,Date.now());
      assert.equal(hasGoldenBoot(state,player,Date.now()),true);
      await finish(await begin(),evidence(),undefined,60000,"PROVIDER_UNAVAILABLE");
      const revoked=await read();
      assert.ok(parseGoldenBootPublicAuthority(revoked));
      state=advanceGoldenBootAuthority(state,revoked,Date.now());
      state=advanceGoldenBootAuthority(state,ready,Date.now());
      assert.equal(hasGoldenBoot(state,player,Date.now()),false);
      assert.equal(hasGoldenBoot(state,player2,Date.now()),false);
    });
    await scenario("finish replay is idempotent; divergent replay cannot mutate authority",async()=>{
      const token=await begin(), e=evidence(), r=await revision();
      const first=await finish(token,e,r), before=await read(), replay=await finish(token,e,r);
      assert.equal(replay.idempotent,true); assert.equal(replay.snapshot_id,first.snapshot_id); assert.deepEqual(await read(),before);
      e.leaders.pop(); await rejects(()=>finish(token,e,r),/GB_REPLAY_CONFLICT/);
      assert.equal((await db.query("select count(*)::integer n from public.touchline_golden_boot_snapshots")).rows[0].n,1);
    });
    await scenario("start replay does not clear completed result; superseded finish cannot publish",async()=>{
      const token=await begin(); await finish(token); const before=await read();
      await begin(token); assert.deepEqual(await read(),before);
      const newer=await begin(), pending=await stateRow();
      await rejects(()=>finish(token),/GB_SUPERSEDED_TOKEN/);
      assert.deepEqual(await stateRow(),pending);
      assert.equal((await read()).status,"ready"); assert.equal((await read()).snapshotId,before.snapshotId);
      assert.equal((await read()).expiresAt,before.expiresAt);
      await finish(newer,evidence(),undefined,60000,"PROVIDER_UNAVAILABLE");
      assert.equal((await read()).status,"unavailable");
    });
    const invalid:Array<[string,(e:ReturnType<typeof evidence>)=>void,string]>=[
      ["missing tie",e=>{e.leaders.pop();},"EVIDENCE_INVALID"],
      ["cross league",e=>{e.scorers.data.rows[0]!.leagueId="9";},"EVIDENCE_INVALID"],
      ["cross season",e=>{e.stages.data.requestedSeasonId="70002";},"EVIDENCE_INVALID"],
      ["wrong stage type",e=>{e.stages.data.rows[0]!.typeId="224";},"EVIDENCE_INVALID"],
      ["multiple stages",e=>{e.stages.data.rows.push({...e.stages.data.rows[0]!,id:"90002"});},"EVIDENCE_INVALID"],
      ["ambiguous coverage",e=>{e.scorers.data.scopeStatus="ambiguous";},"EVIDENCE_INVALID"],
      ["duplicate conflict",e=>{e.scorers.data.rows.push({...e.scorers.data.rows[0]!,goals:4});},"EVIDENCE_INVALID"],
      ["no positive goals",e=>{e.scorers.data.rows.forEach(r=>{r.goals=0;});},"EVIDENCE_INVALID"],
      ["wrong membership",e=>{e.leaders[0]!.membership_id=member2;},"CANONICAL_UNAVAILABLE"],
      ["wrong current club",e=>{e.leaders[0]!.club_id=uuid(99);},"CANONICAL_UNAVAILABLE"],
    ];
    for(const [name,mutate,reason] of invalid) await scenario(name,async()=>{
      await finish(await begin()); const history=await snapshotRows();
      const token=await begin(),before=await stateRow(),e=evidence();mutate(e);
      const receipt=await finish(token,e); // No rollback-to-savepoint or producer cleanup.
      assert.equal(receipt.phase,"unavailable");assert.equal(receipt.reason,reason);assert.equal(receipt.snapshot_id,null);
      const after=await stateRow();assert.equal(after.phase,"unavailable");assert.equal(after.snapshot_id,null);
      assert.equal(BigInt(after.revision),BigInt(before.revision)+BigInt(1));
      assert.equal((await read()).status,"unavailable","invalid current-token finish commits its own revocation");
      assert.deepEqual(await snapshotRows(),history);
    });
    await scenario("exact duplicate provider rows do not duplicate ties",async()=>{
      const token=await begin(),e=evidence();e.scorers.data.rows.push({...e.scorers.data.rows[0]!});
      await finish(token,e);assert.deepEqual((await read()).playerIds,[player,player2]);
    });
    await scenario("revision drift closes TOCTOU and a new current-season phantom invalidates ready",async()=>{
      const token=await begin(),r=await revision();
      await db.query("update public.football_players set current_club_id=current_club_id where id=$1",[player]);
      const rejected=await finish(token,evidence(),r);
      assert.equal(rejected.phase,"unavailable");assert.equal(rejected.reason,"CANONICAL_UNAVAILABLE");
      assert.equal((await stateRow()).snapshot_id,null);
      await finish(await begin());const before=await read();
      await db.query("insert into public.football_seasons values($1,'sportmonks','70002',$2,true,'2027/2028')",[uuid(99),comp]);
      const after=await read();assert.equal(after.status,"unavailable");assert.deepEqual(after.playerIds,[]);
      assert.ok(BigInt(after.revision as string)>BigInt(before.revision as string));
      const next=await begin(),ambiguous=await finish(next);
      assert.equal(ambiguous.phase,"unavailable");assert.equal(ambiguous.reason,"CANONICAL_UNAVAILABLE");
    });
    await scenario("editorial revocation invalidates all ties immediately",async()=>{
      await finish(await begin());const before=await read();
      await db.query("update public.touchline_card_publications set publication_status='archived' where player_id=$1",[player2]);
      const after=await read();assert.equal(after.status,"unavailable");assert.deepEqual(after.playerIds,[]);
      assert.ok(BigInt(after.revision as string)>BigInt(before.revision as string));
    });
    await scenario("failure/start preserve independent provider watermarks; older stage OR scorer cannot reauthorize",async()=>{
      const original=evidence();await finish(await begin(),original);const originalRead=await read();
      const watermarks=(await db.query("select newest_stages_fetch,newest_scorers_fetch from public.touchline_golden_boot_state")).rows;
      await finish(await begin(),evidence(),undefined,60000,"PROVIDER_UNAVAILABLE");
      for(const which of ["stages","scorers"] as const){
        const old=structuredClone(original),time=new Date(Date.parse(original[which].fetchedAt)-1).toISOString();
        old[which].fetchedAt=time;old[which].data.fetchedAt=time;
        const rejected=await finish(await begin(),old);
        assert.equal(rejected.phase,"unavailable");assert.equal(rejected.reason,"EVIDENCE_INVALID");
        assert.equal((await stateRow()).snapshot_id,null);
        assert.equal((await snapshotRows()).length,1);
      }
      assert.deepEqual((await db.query("select newest_stages_fetch,newest_scorers_fetch from public.touchline_golden_boot_state")).rows,watermarks);
      await finish(await begin(),original);assert.equal((await read()).status,"ready","equal original fetch may be reused without extending its expiry");
      assert.equal((await read()).expiresAt,originalRead.expiresAt);
    });
    await scenario("invalid TTL and expired evidence cannot publish",async()=>{
      for(const ttl of [0,60001]){
        const result=await finish(await begin(),evidence(),undefined,ttl);
        assert.equal(result.phase,"unavailable");assert.equal(result.reason,"EVIDENCE_INVALID");
      }
      const result=await finish(await begin(),evidence(61000,1000));
      assert.equal(result.phase,"unavailable");assert.equal(result.reason,"EVIDENCE_INVALID");
      assert.equal((await snapshotRows()).length,0);
    });
    await scenario("pending retains only the original all-ties immutable lease",async()=>{
      await finish(await begin());
      const original=await read(),history=await snapshotRows(),watermarks=await stateRow();
      const token=await begin(),pending=await read(),pendingState=await stateRow();
      assert.equal(pendingState.phase,"pending");assert.equal(pendingState.token,token);
      assert.equal(pendingState.snapshot_id,original.snapshotId);
      assert.equal(pending.status,"ready");assert.deepEqual(pending.playerIds,[player,player2]);
      assert.equal(pending.snapshotId,original.snapshotId);assert.equal(pending.expiresAt,original.expiresAt);
      assert.ok(BigInt(pending.revision as string)>BigInt(original.revision as string));
      assert.equal(pendingState.newest_stages_fetch,watermarks.newest_stages_fetch);
      assert.equal(pendingState.newest_scorers_fetch,watermarks.newest_scorers_fetch);
      await begin(token);assert.deepEqual(await stateRow(),pendingState);assert.deepEqual(await snapshotRows(),history);
      const consumer=advanceGoldenBootAuthority(createGoldenBootAuthorityState(comp,season),pending,Date.now());
      assert.equal(hasGoldenBoot(consumer,player,Date.now()),true);assert.equal(hasGoldenBoot(consumer,player2,Date.now()),true);
      await rejects(()=>db.exec("update public.touchline_golden_boot_state set phase='ready',snapshot_id=null,revision=revision+1"),/check constraint/);
      await rejects(()=>db.exec("update public.touchline_golden_boot_state set phase='unavailable',revision=revision+1"),/check constraint/);
      assert.deepEqual(await stateRow(),pendingState);
    });
    await scenario("invalid finish commits revocation without producer cleanup; replay is stable",async()=>{
      await finish(await begin());const original=await read(),history=await snapshotRows();
      const token=await begin(),before=await stateRow(),r=await revision(),e=evidence();e.leaders.pop();
      const receipt=await finish(token,e,r);
      assert.deepEqual(receipt,{phase:"unavailable",stateRevision:(BigInt(before.revision)+BigInt(1)).toString(),
        snapshot_id:null,reason:"EVIDENCE_INVALID",idempotent:false});
      const after=await stateRow();assert.equal(after.phase,"unavailable");assert.equal(after.snapshot_id,null);
      assert.equal(after.token,token);assert.match(after.finish_hash,/^[0-9a-f]{64}$/);
      assert.equal(after.newest_stages_fetch,before.newest_stages_fetch);
      assert.equal(after.newest_scorers_fetch,before.newest_scorers_fetch);
      const revoked=await read();assert.equal(revoked.status,"unavailable");
      assert.ok(BigInt(revoked.revision as string)>BigInt(original.revision as string));assert.deepEqual(await snapshotRows(),history);
      const replay=await finish(token,e,r);assert.equal(replay.idempotent,true);
      assert.equal(replay.reason,"EVIDENCE_INVALID");assert.deepEqual(await stateRow(),after);
      await rejects(()=>finish(token,e,r,60000,"EVIDENCE_INVALID"),/GB_REPLAY_CONFLICT/);
      assert.deepEqual(await stateRow(),after);
      let consumer=advanceGoldenBootAuthority(createGoldenBootAuthorityState(comp,season),original,Date.now());
      consumer=advanceGoldenBootAuthority(consumer,revoked,Date.now());
      consumer=advanceGoldenBootAuthority(consumer,original,Date.now());
      assert.equal(hasGoldenBoot(consumer,player,Date.now()),false);
    });
    await scenario("stale invalid/failure finish preserves the newer retained or ready token",async()=>{
      await finish(await begin());const older=await begin(),newer=await begin();
      const pending=await stateRow(),publicPending=await read(),bad=evidence();bad.leaders.pop();
      await rejects(()=>finish(older,bad),/GB_SUPERSEDED_TOKEN/);
      await rejects(()=>finish(older,bad,undefined,60000,"PROVIDER_UNAVAILABLE"),/GB_SUPERSEDED_TOKEN/);
      assert.deepEqual(await stateRow(),pending);assert.deepEqual(await read(),publicPending);
      await finish(newer);const ready=await stateRow();
      await rejects(()=>finish(older,bad),/GB_SUPERSEDED_TOKEN/);
      assert.deepEqual(await stateRow(),ready);
    });
    await scenario("pending source drift invalidates immediately; finish commits canonical rejection",async()=>{
      await finish(await begin());const token=await begin(),r=await revision(),before=await stateRow();
      await db.query("update public.football_players set current_club_id=current_club_id where id=$1",[player]);
      assert.equal((await read()).status,"unavailable");
      const result=await finish(token,evidence(),r);
      assert.equal(result.phase,"unavailable");assert.equal(result.reason,"CANONICAL_UNAVAILABLE");
      const after=await stateRow();assert.equal(after.snapshot_id,null);
      assert.equal(BigInt(after.revision),BigInt(before.revision)+BigInt(1));
    });
    await scenario("pending expires at original deadline; cached evidence cannot extend a shorter issued TTL",async()=>{
      const e=evidence(0,0);await finish(await begin(),e,undefined,2000);
      const original=await read();assert.equal(original.status,"ready");
      const token=await begin(),pending=await read();assert.equal(pending.status,"ready");
      assert.equal(pending.expiresAt,original.expiresAt);
      await finish(token,e,undefined,60000);assert.equal((await read()).expiresAt,original.expiresAt);
      const pendingAgain=await begin(),beforeExpiry=await read(),history=await snapshotRows();
      await new Promise(resolve=>setTimeout(resolve,2100));
      const expired=await read();assert.equal(expired.status,"unavailable");
      assert.equal(BigInt(expired.revision as string),BigInt(beforeExpiry.revision as string)+BigInt(1));
      const rejected=await finish(pendingAgain,e,undefined,60000);
      assert.equal(rejected.phase,"unavailable");assert.equal(rejected.reason,"EVIDENCE_INVALID");
      assert.deepEqual(await snapshotRows(),history);assert.equal((await stateRow()).snapshot_id,null);
      const again=await finish(await begin(),e,undefined,60000);
      assert.equal(again.phase,"unavailable");assert.equal((await read()).status,"unavailable");
      await finish(await begin(),evidence(0,0));const fresh=await read();
      assert.equal(fresh.status,"ready");assert.ok(BigInt(fresh.revision as string)>BigInt(expired.revision as string));
    });
    await scenario("timestamp cast and unrecognized failure code revoke without cleanup or raw details",async()=>{
      for(const mode of ["timestamp","failure-code"]){
        await finish(await begin());const token=await begin(),e=evidence();
        if(mode==="timestamp"){e.stages.fetchedAt="2026-99-99T12:00:00Z";e.stages.data.fetchedAt=e.stages.fetchedAt;}
        const result=await finish(token,e,undefined,60000,mode==="failure-code"?"PRIVATE_UNKNOWN":null);
        assert.equal(result.phase,"unavailable");assert.equal(result.reason,"EVIDENCE_INVALID");
        assert.equal((await stateRow()).snapshot_id,null);assert.equal((await read()).status,"unavailable");
        assert.doesNotMatch(JSON.stringify(result),/PRIVATE|GB_|2026-99/);
      }
    });
    await scenario("final state-write errors propagate, with no swallowed error or fallback write",async()=>{
      await finish(await begin());
      const token=await begin(),pending=await stateRow(),visible=await read(),history=await snapshotRows();
      assert.equal(pending.phase,"pending");assert.equal(visible.status,"ready");
      // Fixture-only DDL lives inside scenario's outer transaction and is rolled
      // back afterward. The temporary sequence counts attempts even when the
      // failing statement/savepoint is rolled back, detecting an extra fallback
      // UPDATE as well as a wrongly returned unavailable receipt.
      await db.exec(`reset role;
        create temporary sequence golden_boot_test_write_attempts;
        grant usage,select on sequence pg_temp.golden_boot_test_write_attempts to service_role;
        create function pg_temp.golden_boot_test_reject_state_write() returns trigger
        language plpgsql security invoker set search_path='' as $test$
        begin
          if new.phase=current_setting('touchline.test_gb_block_phase',true) then
            perform nextval('pg_temp.golden_boot_test_write_attempts'::regclass);
            raise exception 'GB_TEST_OPERATIONAL_STATE_WRITE' using errcode='22003';
          end if;
          return new;
        end $test$;
        grant execute on function pg_temp.golden_boot_test_reject_state_write() to service_role;
        create trigger golden_boot_test_write_failure before update on public.touchline_golden_boot_state
          for each row execute function pg_temp.golden_boot_test_reject_state_write();
        set local role service_role;`);
      let attempts=0;
      for(const mode of ["explicit-failure","validation-rejection","ready-write"]){
        await db.query("select set_config('touchline.test_gb_block_phase',$1,true)",
          [mode==="ready-write"?"ready":"unavailable"]);
        const e=evidence();if(mode==="validation-rejection")e.leaders.pop();
        await rejects(()=>finish(token,e,undefined,60000,
          mode==="explicit-failure"?"CANONICAL_UNAVAILABLE":null),/GB_TEST_OPERATIONAL_STATE_WRITE/);
        attempts++;
        const counter=(await db.query("select last_value::text value from pg_temp.golden_boot_test_write_attempts")).rows[0];
        assert.equal(counter.value,String(attempts),`${mode}: exactly one failed state write, no validation fallback`);
        assert.deepEqual(await stateRow(),pending,`${mode}: pending token/pointer/hash/watermarks unchanged`);
        assert.deepEqual(await read(),visible,`${mode}: only the original lease remains`);
        assert.deepEqual(await snapshotRows(),history,`${mode}: attempted ready snapshot must also roll back`);
      }
    });
    await scenario("real DB-clock expiry produces higher tombstone; next publication supersedes it",async()=>{
      // Bounded real-clock exercise, not a performance assertion. Init has already
      // completed under the outer 120s budget. No low timeout masks WASM startup.
      await finish(await begin(),evidence(0,0),undefined,2000);
      const ready=await read();assert.equal(ready.status,"ready");
      await new Promise(resolve=>setTimeout(resolve,2100));
      const expired=await read();assert.equal(expired.status,"unavailable");
      assert.equal(BigInt(expired.revision as string),BigInt(ready.revision as string)+BigInt(1));
      await finish(await begin(),evidence(0,0));const refreshed=await read();
      assert.equal(refreshed.status,"ready");assert.ok(BigInt(refreshed.revision as string)>BigInt(expired.revision as string));
    });
    await scenario("numeric-before-sum revision survives beyond JavaScript and bigint sum precision",async()=>{
      await begin();
      await db.exec("update public.touchline_golden_boot_source_revision set revision=9223372036854775000; update public.touchline_golden_boot_state set revision=9223372036854775000");
      assert.equal((await read()).revision,(BigInt(2)*(BigInt("9223372036854775000")+BigInt("9223372036854775000"))+BigInt(1)).toString());
      const fence=(await db.query("select public.read_touchline_golden_boot_source_revision() value")).rows[0].value;
      assert.equal(fence,"9223372036854775000");
      assert.equal(typeof fence,"string","producer RPC fence never crosses JSON as a rounded number");
      await rejects(()=>db.exec("update public.touchline_golden_boot_state set revision=1"),/GB_REVISION_REGRESSION/);
      await rejects(()=>db.exec("update public.touchline_golden_boot_source_revision set revision=0"),/GB_REVISION_REGRESSION/);
    });
    await scenario("snapshots cannot be overwritten or deleted",async()=>{
      await finish(await begin());
      await rejects(()=>db.exec("update public.touchline_golden_boot_snapshots set leaders='[]'::jsonb"),/permission denied|GB_IMMUTABLE/);
      await rejects(()=>db.exec("delete from public.touchline_golden_boot_snapshots"),/permission denied|GB_IMMUTABLE/);
    });
    const claim=async(token:string,c=comp,s=season)=>{
      const result=await payload("select public.try_begin_touchline_golden_boot_worker($1,$2,$3) payload",[c,s,token]);
      if(result.acquired===true&&!workerGenerations.has(token))workerGenerations.set(token,String(result.generation));
      return result;
    };
    await scenario("worker claim admits one token; duplicate and other tokens do not restart authority",async()=>{
      const token=randomUUID(); const admitted=await claim(token);
      assert.equal(admitted.acquired,true);assert.equal(admitted.generation,"1");
      const before=await stateRow();
      assert.equal(before.token,token);
      assert.equal((await claim(token)).acquired,false,"same request must not run provider twice");
      assert.equal((await claim(randomUUID())).acquired,false);
      assert.deepEqual(await stateRow(),before);
      await rejects(()=>begin(randomUUID()),/GB_WORKER_OWNERSHIP/);
      await finish(token);assert.equal((await read()).status,"ready");
    });
    await scenario("expired worker cannot publish or revoke; new generation recovers after grace",async()=>{
      const old=randomUUID();await claim(old);
      await db.exec("update public.touchline_golden_boot_worker set lease_until=clock_timestamp()-interval '1 second'");
      const before=await stateRow();
      await rejects(()=>finish(old),/GB_WORKER_EXPIRED/);
      await rejects(()=>finish(old,evidence(),undefined,60000,"PROVIDER_UNAVAILABLE"),/GB_WORKER_EXPIRED/);
      assert.deepEqual(await stateRow(),before);
      assert.equal((await claim(randomUUID())).acquired,false,"expired does not mean upstream has stopped");
      await db.exec("update public.touchline_golden_boot_worker set lease_until=clock_timestamp()-interval '90 seconds',not_before=clock_timestamp()-interval '1 second'");
      const next=randomUUID();const admitted=await claim(next);
      assert.equal(admitted.acquired,true);assert.equal(admitted.generation,"2");
      await finish(next);const visible=await read();
      await rejects(()=>finish(old,evidence(),undefined,60000,"PROVIDER_UNAVAILABLE"),/GB_WORKER_OWNERSHIP/);
      assert.deepEqual(await read(),visible);
    });
    await scenario("worker admission rejects noncurrent or foreign scope without changing state",async()=>{
      await rejects(()=>claim(randomUUID(),uuid(99)),/GB_WORKER_SCOPE/);
      await rejects(()=>claim(randomUUID(),comp,uuid(99)),/GB_WORKER_SCOPE/);
      assert.equal(await stateRow(),undefined);
      const admitted=await claim(randomUUID());assert.equal(admitted.generation,"1");
    });
    await scenario("reused invocation token cannot let its old generation publish or revoke",async()=>{
      const old=randomUUID();await claim(old);
      const expire=()=>db.exec("update public.touchline_golden_boot_worker set lease_until=clock_timestamp()-interval '90 seconds',not_before=clock_timestamp()-interval '1 second'");
      await expire();await claim(randomUUID());await expire();
      const again=await claim(old);assert.equal(again.generation,"3");
      const before=await stateRow();
      await rejects(()=>finish(old),/GB_WORKER_OWNERSHIP/);
      await rejects(()=>finish(old,evidence(),undefined,60000,"PROVIDER_UNAVAILABLE"),/GB_WORKER_OWNERSHIP/);
      assert.deepEqual(await stateRow(),before);
      await finish(old,evidence(),undefined,60000,null,"3");assert.equal((await read()).status,"ready");
    });
    await scenario("completed worker finish remains idempotent after expiry without renewing authority",async()=>{
      const token=randomUUID();await claim(token);const e=evidence();const rev=await revision();
      await finish(token,e,rev);const before=await stateRow();const snapshots=await snapshotRows();
      await db.exec("update public.touchline_golden_boot_worker set lease_until=clock_timestamp()-interval '1 second'");
      assert.equal((await finish(token,e,rev)).idempotent,true);
      assert.deepEqual(await stateRow(),before);assert.deepEqual(await snapshotRows(),snapshots);
    });
    await scenario("lease expiring during snapshot write rolls back the snapshot and authority",async()=>{
      const token=randomUUID();await claim(token);const before=await stateRow();const snapshots=await snapshotRows();
      await db.exec(`reset role;
        create function pg_temp.expire_golden_boot_worker() returns trigger language plpgsql as $test$
        begin
          update public.touchline_golden_boot_worker set lease_until=clock_timestamp()-interval '1 second';
          return new;
        end $test$;
        grant execute on function pg_temp.expire_golden_boot_worker() to service_role;
        create trigger test_expire_golden_boot_worker before insert on public.touchline_golden_boot_snapshots
          for each row execute function pg_temp.expire_golden_boot_worker();
        set local role service_role;`);
      await rejects(()=>finish(token),/GB_WORKER_EXPIRED/);
      assert.deepEqual(await stateRow(),before);assert.deepEqual(await snapshotRows(),snapshots);
    });
    const complete=(token:string,status="stored",known=true,cooldown:string|null=null,generation=workerGenerations.get(token)??null)=>
      payload("select public.complete_touchline_golden_boot_worker($1,$2,$3,$4,$5::timestamptz) payload",[token,generation,status,known,cooldown]);
    await scenario("completed worker releases after due time; terminal replay cannot extend that time",async()=>{
      const token=randomUUID();await claim(token);await finish(token);
      const receipt=await complete(token);assert.equal(receipt.completed,true);
      assert.deepEqual(await complete(token),receipt);
      await rejects(()=>complete(token,"unavailable"),/GB_WORKER_REPLAY/);
      assert.equal((await claim(randomUUID())).acquired,false);
      await db.exec("update public.touchline_golden_boot_worker set not_before=clock_timestamp()-interval '1 second'");
      const next=randomUUID();assert.equal((await claim(next)).acquired,true);
      await rejects(()=>complete(token),/GB_WORKER_OWNERSHIP/);
    });
    await scenario("unknown quota backs off finitely and cached cooldown keeps its original deadline",async()=>{
      const token=randomUUID();await claim(token);await finish(token);
      const cooldown=new Date(Date.now()+180000).toISOString();
      const receipt=await complete(token,"stored",false,cooldown);
      assert.equal(receipt.notBeforeMs,Date.parse(cooldown));
      assert.deepEqual(await complete(token,"stored",false,cooldown),receipt);
      const row=(await db.query("select failure_count,cooldown_until from public.touchline_golden_boot_worker")).rows[0];
      assert.equal(row.failure_count,1);assert.equal(new Date(row.cooldown_until).getTime(),Date.parse(cooldown));
      assert.equal((await claim(randomUUID())).acquired,false);
    });
    await scenario("early terminal acknowledgement prevents a late unfinished producer from publishing",async()=>{
      const token=randomUUID();await claim(token);
      await complete(token,"unconfirmed",false);
      const before=await stateRow();await rejects(()=>finish(token),/GB_WORKER_EXPIRED/);
      assert.deepEqual(await stateRow(),before);
    });
    await scenario("failed attempts have bounded backoff and can recover without manual reset",async()=>{
      for(let i=0;i<8;i++){
        const token=randomUUID();await claim(token);
        await finish(token,evidence(),undefined,60000,"PROVIDER_UNAVAILABLE");
        const before=Date.now();const receipt=await complete(token,"unavailable",false);
        const delay=Number(receipt.notBeforeMs)-before;
        assert.ok(delay>=59000&&delay<=301000);
        await db.exec("update public.touchline_golden_boot_worker set not_before=clock_timestamp()-interval '1 second'");
      }
      const next=randomUUID();assert.equal((await claim(next)).acquired,true);
      await finish(next);await complete(next);
      const row=(await db.query("select failure_count from public.touchline_golden_boot_worker")).rows[0];
      assert.equal(row.failure_count,0);
    });
    await t.test("ACL/RLS/INVOKER: no client tables or function authority",async()=>{
      const funcs=await db.query(`select p.proname,p.prosecdef,p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
        has_function_privilege('service_role',p.oid,'EXECUTE') service
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and p.proname like '%golden_boot%'`);
      assert.ok(funcs.rows.length>=8);
      for(const f of funcs.rows){assert.equal(f.prosecdef,false);assert.equal(f.anon,false);assert.equal(f.authenticated,false);assert.equal(f.service,true);assert.deepEqual(f.proconfig,['search_path=""']);}
      for(const table of ['touchline_golden_boot_state','touchline_golden_boot_snapshots','touchline_golden_boot_source_revision','touchline_golden_boot_worker']){
        const row=(await db.query("select relrowsecurity,has_table_privilege('anon',oid,'SELECT') anon,has_table_privilege('authenticated',oid,'SELECT') authenticated from pg_class where oid=$1::regclass",[`public.${table}`])).rows[0];
        assert.equal(row.relrowsecurity,true);assert.equal(row.anon,false);assert.equal(row.authenticated,false);
      }
    });
  } finally { await db.close(); }
});
