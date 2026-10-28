import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { legacyCoachCatalogue } from "../../lib/touchlineArena/coach-catalogue-contract.ts";
import type { CoachEditorialDependencies } from "../../lib/touchlineArena/coach-editorial-handler.ts";
export const coachTestActor = "11111111-1111-4111-8111-111111111111";
export async function coachDatabaseFixture() {
  const db = new PGlite(), competition = "22222222-2222-4222-8222-222222222222";
  const legacy = legacyCoachCatalogue().current;
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
    create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text);
    create table public.football_clubs(id uuid primary key,provider text,provider_team_id text,competition_id uuid references public.football_competitions(id),name text);
    create table public.football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,last_synced_at timestamptz,primary key(provider,provider_fixture_id));
    insert into auth.users values('${coachTestActor}');insert into public.football_competitions values('${competition}','sportmonks','8');`);
  for(const entry of legacy)await db.query("insert into public.football_clubs values($1,'sportmonks',$2,$3,$4)",[randomUUID(),entry.coach.teamId,competition,entry.coach.teamId==="19"?"Arsenal FC":`Club ${entry.coach.teamId}`]);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261027210242_touchline_coach_catalogue_editorial.sql",import.meta.url),"utf8"));
  const calls:Array<{name:string;args?:Record<string,unknown>}> = [];
  const dependencies:CoachEditorialDependencies = {enabled:true,actor:async()=>({id:coachTestActor,owner:true,allowed:true}),rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==="touchline_read_coach_editorial")return (await db.query<{result:unknown}>("select public.touchline_read_coach_editorial() result")).rows[0].result;
    if(name!=="touchline_coach_editorial_command")throw new Error("Unexpected RPC");
    return (await db.query<{result:unknown}>("select public.touchline_coach_editorial_command($1,$2,$3,$4,$5,$6,$7::jsonb,$8) result",[args!.p_request_id,args!.p_actor_id,args!.p_action,args!.p_candidate_id,args!.p_revision,args!.p_reason,args!.p_bootstrap===null?null:JSON.stringify(args!.p_bootstrap),args!.p_catalogue_revision])).rows[0].result;
  }};
  return {db,dependencies,calls,async reset(){
    await db.exec("reset role;truncate table touchline_coaches_private.commands,touchline_coaches_private.audit,touchline_coaches_private.current_assignments,touchline_coaches_private.publications,touchline_coaches_private.candidates,touchline_coaches_private.observations,touchline_coaches_private.identities;update touchline_coaches_private.configuration set editorial_enabled=true,public_enabled=false,revision=0;set role service_role;");calls.length=0;
  },async observe(){
    await db.exec("reset role");
    const assignments=[{coachProviderId:"99991",clubProviderId:"19",location:"home"},{coachProviderId:legacy[1].coach.providerId,clubProviderId:legacy[1].coach.teamId,location:"away"}];
    const fixture={providerId:"9990001",competitionId:"8",seasonId:"25697",startsAt:"2026-10-27T18:00:00Z",coachAttribution:{status:"complete",source:"sportmonks.fixture.coaches",fixtureProviderId:"9990001",competitionProviderId:"8",seasonProviderId:"25697",assignments},source:{raw:{coaches:assignments.map((a,i)=>({id:a.coachProviderId,display_name:i===0?"Synthetic New Coach":legacy[1].coach.name,meta:{coach_id:a.coachProviderId,fixture_id:"9990001",participant_id:a.clubProviderId}}))}}};
    await db.query("insert into public.football_fantasy_fixture_feeds values('sportmonks','9990001',$1,clock_timestamp()) on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,last_synced_at=excluded.last_synced_at",[JSON.stringify(fixture)]);
    await db.exec("set role service_role;select public.touchline_stage_coach_fixture('9990001')");
  },async catalogue(){return (await db.query<{result:unknown}>("select public.touchline_read_coach_catalogue() result")).rows[0].result;}};
}
