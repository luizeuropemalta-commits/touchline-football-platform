import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { legacyCoachCatalogue, parseCoachCatalogue, catalogueCoachForId, catalogueCoachForTeam } from "../lib/touchlineArena/coach-catalogue-contract.ts";

const actor = "11111111-1111-4111-8111-111111111111", competition = "22222222-2222-4222-8222-222222222222";
const seeds = legacyCoachCatalogue().current.map(e => ({ providerId: e.coach.providerId, teamId: e.coach.teamId, name: e.coach.name,
  nationality: e.coach.nationality, countryId: e.coach.countryId, countryCode3: e.countryCode3, observedAt: e.fetchedAt, classification: e.classification }));
test("coach catalogue: opt-in, exact IDs, observed staging, owner decisions and historical preservation", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;
      create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text);
      create table public.football_clubs(id uuid primary key,provider text,provider_team_id text,competition_id uuid references public.football_competitions(id),name text);
      create table public.football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,last_synced_at timestamptz,primary key(provider,provider_fixture_id));
      insert into auth.users values('${actor}');insert into public.football_competitions values('${competition}','sportmonks','8');`);
    for (const seed of seeds) await db.query("insert into public.football_clubs values($1,'sportmonks',$2,$3,$4)",[randomUUID(),seed.teamId,competition,`Club ${seed.teamId}`]);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261027210242_touchline_coach_catalogue_editorial.sql",import.meta.url),"utf8"));
    const revisions = new Map<string,number>();
    const command = async (action:string,candidate:string|null=null,revision:number|null=null,bootstrap:unknown=null,requestId=randomUUID(),reason="Reviewed current appointment using the official source",expectedCatalogueRevision?:number) => {
      const globalRevision=expectedCatalogueRevision??revisions.get(requestId)??(await db.query<{revision:number}>("select revision from touchline_coaches_private.configuration")).rows[0].revision;
      revisions.set(requestId,globalRevision);
      return (await db.query<{result:Record<string,unknown>}>("select public.touchline_coach_editorial_command($1,$2,$3,$4,$5,$6,$7::jsonb,$8) result",[requestId,actor,action,candidate,revision,reason,bootstrap === null ? null : JSON.stringify(bootstrap),globalRevision])).rows[0].result;
    };
    const read = async () => (await db.query<{result:unknown}>("select public.touchline_read_coach_catalogue() result")).rows[0].result;
    const editorial = async () => (await db.query<{result:{currentCount:number;candidates:Array<{id:string;providerId:string;status:string;revision:number}>}}>("select public.touchline_read_coach_editorial() result")).rows[0].result;
    const stage = async () => (await db.query<{n:number}>("select public.touchline_stage_coach_fixture('9990001') n")).rows[0].n;
    const fixtures = async (newName="New Head Coach",coach="99991") => {
      await db.exec("reset role");
      const assignments=[{coachProviderId:coach,clubProviderId:seeds[0].teamId,location:"home"},{coachProviderId:seeds[1].providerId,clubProviderId:seeds[1].teamId,location:"away"}];
      const fixture={providerId:"9990001",competitionId:"8",seasonId:"25697",startsAt:"2026-10-27T18:00:00Z",
        coachAttribution:{status:"complete",source:"sportmonks.fixture.coaches",fixtureProviderId:"9990001",competitionProviderId:"8",seasonProviderId:"25697",assignments},
        source:{raw:{coaches:assignments.map((a,i)=>({id:a.coachProviderId,display_name:i===0?newName:seeds[1].name,meta:{participant_id:a.clubProviderId,fixture_id:"9990001",coach_id:a.coachProviderId}}))}}};
      await db.query("insert into public.football_fantasy_fixture_feeds values('sportmonks','9990001',$1,clock_timestamp()) on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,last_synced_at=excluded.last_synced_at",[JSON.stringify(fixture)]);
      await db.exec("set role service_role");
    };
    await db.exec("set role service_role");
    await t.test("database gates default closed even for direct service RPCs",async()=>{ await assert.rejects(read(),/DISABLED/);await assert.rejects(stage(),/DISABLED/);await assert.rejects(command("bootstrap",null,null,seeds),/DISABLED/); });
    await db.exec("update touchline_coaches_private.configuration set editorial_enabled=true");
    let originalIds: string[]=[];
    await t.test("explicit bootstrap preserves 20 source IDs and classifications, does not enable public reads",async()=>{
      const key=randomUUID(), receipt=await command("bootstrap",null,null,seeds,key);assert.deepEqual(await command("bootstrap",null,null,seeds,key),receipt);
      await assert.rejects(command("bootstrap",null,null,seeds,key,"Different reviewed reason for bootstrap import"),/IDEMPOTENCY/);
      await assert.rejects(command("bootstrap",null,null,seeds),/BOOTSTRAP_REFUSED/);assert.equal((await editorial()).currentCount,20);await assert.rejects(read(),/DISABLED/);
      await db.exec("update touchline_coaches_private.configuration set public_enabled=true");
      const catalogue=parseCoachCatalogue(await read());assert.equal(catalogue.phase,"ready");assert.equal(catalogue.current.length,20);
      assert.deepEqual([...catalogue.current.map(e=>e.coach.providerId)].sort(),[...seeds.map(e=>e.providerId)].sort());
      for(const seed of seeds)assert.deepEqual(catalogueCoachForId(catalogue,seed.providerId)?.classification,seed.classification);
      originalIds=catalogue.current.map(e=>e.internalId!);assert.equal(new Set(originalIds).size,20);
    });
    await t.test("unknown fixture coach stages without changing public catalogue; missing names block approval",async()=>{
      await fixtures("");await stage();const item=(await editorial()).candidates[0];assert.equal(item.providerId,"99991");assert.equal(item.status,"pending");
      await assert.rejects(command("approve",item.id,item.revision),/APPROVAL_REFUSED/);assert.equal(catalogueCoachForId(parseCoachCatalogue(await read()),"99991"),null);
      await fixtures();await stage();assert.equal((await editorial()).candidates.length,1);
    });
    await t.test("ignored candidate remains ignored after another observation, never becomes a legacy fallback",async()=>{
      let item=(await editorial()).candidates[0];await command("ignore",item.id,item.revision);await fixtures("New Head Coach corrected");await stage();
      item=(await editorial()).candidates[0];assert.equal(item.status,"ignored");await assert.rejects(command("publish",item.id,item.revision),/PUBLICATION_REFUSED/);
      await command("reopen",item.id,item.revision);
    });
    await t.test("new evidence invalidates approval and stale decisions fail closed",async()=>{
      const item=(await editorial()).candidates[0];await command("approve",item.id,item.revision);await assert.rejects(command("ignore",item.id,item.revision),/STALE/);
      const approved=(await editorial()).candidates[0];await fixtures("Verified Coach Name");await stage();await assert.rejects(command("publish",approved.id,approved.revision),/STALE/);
      assert.equal((await editorial()).candidates[0].status,"pending");
    });
    await t.test("a stale global review cannot approve over an intervening owner decision",async()=>{
      const item=(await editorial()).candidates[0];
      const revision=(await db.query<{revision:number}>("select revision from touchline_coaches_private.configuration")).rows[0].revision;
      await command("ignore",item.id,item.revision);
      const ignored=(await editorial()).candidates[0];
      await assert.rejects(command("reopen",ignored.id,ignored.revision,null,randomUUID(),"Reviewed after another owner decision changed the catalogue",revision),/STALE/);
      assert.equal((await editorial()).candidates[0].status,"ignored");
      await command("reopen",ignored.id,ignored.revision);
    });
    await t.test("publication and audit atomic; former identity/classification retained, price fields absent",async()=>{
      let item=(await editorial()).candidates[0];await command("approve",item.id,item.revision);item=(await editorial()).candidates[0];
      await db.exec("reset role;create function public.reject_coach_audit() returns trigger language plpgsql as $$begin raise exception 'AUDIT_FAIL';end$$;create trigger reject_audit before insert on touchline_coaches_private.audit for each row execute function public.reject_coach_audit();set role service_role");
      await assert.rejects(command("publish",item.id,item.revision),/AUDIT_FAIL/);assert.equal(catalogueCoachForId(parseCoachCatalogue(await read()),"99991"),null);
      await db.exec("reset role;drop trigger reject_audit on touchline_coaches_private.audit;set role service_role");
      const requestId=randomUUID(),receipt=await command("publish",item.id,item.revision,null,requestId);assert.deepEqual(await command("publish",item.id,item.revision,null,requestId),receipt);
      const catalogue=parseCoachCatalogue(await read());assert.equal(catalogue.phase,"ready");assert.equal(catalogue.current.length,20);assert.equal(catalogue.history.length,21);
      assert.equal(catalogueCoachForTeam(catalogue,seeds[0].teamId)?.coach.providerId,"99991");
      assert.deepEqual(catalogueCoachForId(catalogue,seeds[0].providerId)?.classification,seeds[0].classification);
      assert.ok(originalIds.includes(catalogueCoachForId(catalogue,seeds[0].providerId)!.internalId!));assert.equal(catalogueCoachForId(catalogue,"99991")?.classification.tierKey,"sapphire-blue");
      assert.doesNotMatch(JSON.stringify(await read()),/price|valueEur|market_value|actor_id/);
    });
    await t.test("customers cannot enumerate private data or execute editorial/public RPCs; service cannot rewrite history",async()=>{
      await assert.rejects(db.exec("delete from touchline_coaches_private.publications"),/permission denied/);
      for(const role of ["anon","authenticated"]){await db.exec(`reset role;set role ${role}`);await assert.rejects(read(),/permission denied/);await assert.rejects(stage(),/permission denied/);await assert.rejects(command("bootstrap",null,null,seeds),/permission denied/);await assert.rejects(db.exec("select * from touchline_coaches_private.observations"),/permission denied/);}
    });
  }finally{await db.close();}
});
