import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { purchaseClubPlayer, parseClubAcquisitionCommand, type ClubAcquisitionStore } from "../lib/touchlineFantasy/club-acquisition-service.ts";
import { type ClubAcquisitionState, type ClubAcquisitionCommand } from "../lib/touchlineFantasy/club-acquisition.ts";
import { allocateClubPlayers, type ClubAllocationCommand } from "../lib/touchlineFantasy/club-allocation.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";

const uid = "00000000-0000-4000-8000-000000000001";
const season = "00000000-0000-4000-8000-000000000002";
const pid = "00000000-0000-4000-8000-000000000003";
const club = "00000000-0000-4000-8000-000000000004";
const command: ClubAcquisitionCommand = { playerId: pid, area: "reserves", slot: 0, expectedRevision: 0, idempotencyKey: "acquire_one" };
const initial: ClubAcquisitionState = { revision: 0, seasonId: season, plan: "standard", balanceEur: 495_000_000,
  coach: { id: "coach", tier: "ruby-red", valueEur: 5_000_000 }, players: [], receipts: [] };
const authority = { ownerId: uid, seasonId: season, active: true, marketOpen: true, allowedClubIds: null,
  geometry: TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"],
  offer: { playerId: pid, clubId: club, position: "GK" as const, primaryDetail: "Goalkeeper", valueEur: 10_000_000, published: true } };

test("request rejects wallets, other owners, extra fields and malformed destinations", () => {
  assert.deepEqual(parseClubAcquisitionCommand(command), command);
  for (const patch of [{ balanceEur: 1 }, { ownerId: uid }, { valueEur: 1 }, { plan: "vip" }, { transferException: {} },
    { area: "total" }, { area: "constructor" }, { slot: 9 }, { slot: -1 }, { expectedRevision: 0.5 }, { playerId: "fake" }]) {
    assert.equal(parseClubAcquisitionCommand({ ...command, ...patch }), null);
  }
});

test("real SQL persistence: atomic wallet+roster, retries, stale revision, rollback, ACL and clock", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.users(id uuid primary key);
      create table public.football_seasons(id uuid primary key);
      create table public.football_players(id uuid primary key,current_club_id uuid);
      create table public.touchline_card_publications(player_id uuid,publication_status text,market_value_id uuid);
      create table public.football_player_market_values(id uuid,player_id uuid,market_value_eur bigint,status text,confidence text);
      create table public.touchline_fantasy_entitlements(user_id uuid,entitlement_key text,status text,plan_key text,current_period_start timestamptz,current_period_end timestamptz);
      create table public.touchline_fantasy_configs(season_id uuid,status text,competition_key text);
      create table public.touchline_fantasy_gameweeks(season_id uuid,state text,market_opens_at timestamptz,locks_at timestamptz,id uuid default gen_random_uuid());
      create table public.touchline_card_contracts(user_id uuid,status text,season_id uuid);
      create table public.touchline_coach_contracts(user_id uuid,status text);
      create table public.touchline_fantasy_user_gameweeks(id uuid,user_id uuid,gameweek_id uuid);
      create table public.touchline_fantasy_user_gameweek_selections(user_gameweek_id uuid);
      create table public.touchline_formation_geometry_versions(formation_code text,status text,geometry_version int,geometry jsonb);
      insert into public.users values('${uid}'); insert into public.football_seasons values('${season}');
      insert into public.football_players values('${pid}','${club}');
      insert into public.touchline_card_publications values('${pid}','published','${pid}');
      insert into public.football_player_market_values values('${pid}','${pid}',10000000,'verified','verified');
      insert into public.touchline_fantasy_entitlements values('${uid}','fantasy_access','active','standard',null,null);
      insert into public.touchline_fantasy_configs values('${season}','active','england');
      insert into public.touchline_fantasy_gameweeks(season_id,state,market_opens_at,locks_at) values('${season}','MARKET_OPEN',now()-interval '1 hour',now()+interval '1 hour');
      grant select on public.touchline_fantasy_entitlements,public.touchline_fantasy_configs,public.touchline_fantasy_gameweeks,
        public.touchline_card_contracts,public.touchline_coach_contracts,public.touchline_fantasy_user_gameweeks,public.touchline_fantasy_user_gameweek_selections,
        public.football_players,public.football_player_market_values,public.touchline_card_publications,public.touchline_formation_geometry_versions to service_role;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261017104205_club_collection_atomic_acquisition.sql', import.meta.url), 'utf8'));
    const initialize = (coach = initial.coach, plan = initial.plan) => db.query<{state: ClubAcquisitionState}>(
      'select touchline_club_initialize_collection($1,$2,$3,$4::jsonb) state', [uid,season,plan,JSON.stringify(coach)]);
    await assert.rejects(() => initialize({ ...initial.coach!,valueEur: 1 }), /CLUB_INITIAL_STATE_INVALID/);
    await db.exec(`insert into touchline_card_contracts values('${uid}','active','${season}')`);
    await assert.rejects(() => initialize(), /CLUB_LEGACY_RESET_REQUIRED/);
    await db.exec(`delete from touchline_card_contracts;
      insert into touchline_card_contracts values('${uid}','active','00000000-0000-4000-8000-000000000099');
      insert into touchline_fantasy_gameweeks(season_id,state,market_opens_at,locks_at,id)
        values('00000000-0000-4000-8000-000000000099','SETTLED',now()-interval '1 year',now()-interval '1 year','${pid}');
      insert into touchline_fantasy_user_gameweeks values('${pid}','${uid}','${pid}');
      insert into touchline_fantasy_user_gameweek_selections values('${pid}');
      set role service_role`);
    assert.deepEqual((await initialize()).rows[0].state, initial);
    assert.equal((await db.query('select count(*)::int n from touchline_fantasy_user_gameweek_selections')).rows[0].n,1,'historical season is retained and cannot block new ownership');
    assert.deepEqual((await initialize()).rows[0].state, initial, 'initialization never grants a second budget');
    await assert.rejects(() => initialize({ ...initial.coach!,id: 'other' }), /CLUB_COLLECTION_ALREADY_INITIALIZED/);
    await db.exec('reset role');
    const store: ClubAcquisitionStore = {
      read: async (owner, sid) => (await db.query<{state: ClubAcquisitionState}>(
        'select state from touchline_club_collections where user_id=$1 and season_id=$2', [owner, sid])).rows[0]?.state ?? null,
      commit: async (owner, before, next, cmd) => (await db.query<{state: ClubAcquisitionState}>(
        'select touchline_club_commit_acquisition($1,$2,$3,$4::jsonb,$5::jsonb) state',
        [owner, before.seasonId, before.revision, JSON.stringify(next), JSON.stringify(cmd)])).rows[0].state,
    };
    // An actual transaction rehearsal leaves no debit or receipt behind.
    await db.exec('begin; set local role service_role;');
    const rehearsal = await purchaseClubPlayer(store, authority, command);
    assert.equal(rehearsal.state.balanceEur, 485_000_000);
    await db.exec('rollback');
    assert.deepEqual(await store.read(uid, season), initial);
    assert.equal((await db.query('select count(*)::int n from touchline_club_collection_operations')).rows[0].n, 0);
    await db.exec('set role service_role');
    const bought = await purchaseClubPlayer(store, authority, command);
    assert.equal(bought.state.players.length, 1);
    assert.deepEqual(await store.read(uid, season), bought.state, 'fresh read preserves exact contract and wallet');
    const retry = await purchaseClubPlayer(store, { ...authority, marketOpen: false, offer: null }, command);
    assert.equal(retry.replayed, true);
    assert.equal(retry.state.balanceEur, 485_000_000);
    assert.deepEqual(await store.commit(uid, initial, bought.state, command), bought.state, 'storage retries are also idempotent');
    await assert.rejects(() => store.commit(uid, initial, bought.state, { ...command, slot: 1 }), /CLUB_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(() => store.commit(uid, initial, bought.state, { ...command, idempotencyKey: 'acquire_two' }), /CLUB_STALE_REVISION/);
    await db.exec('reset role');
    const persisted = await store.read(uid, season);
    await db.exec("update touchline_fantasy_gameweeks set locks_at=now()-interval '1 second'");
    await assert.rejects(() => store.commit(uid, bought.state, bought.state, { ...command, expectedRevision: 1, idempotencyKey: 'acquire_two' }), /CLUB_MARKET_CLOSED/);
    assert.deepEqual(await store.read(uid, season), persisted);
    await db.exec("update touchline_fantasy_entitlements set status='inactive'");
    await assert.rejects(() => store.commit(uid, bought.state, bought.state, { ...command, expectedRevision: 1, idempotencyKey: 'acquire_two' }), /CLUB_ACCESS_REQUIRED/);
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => store.read(uid, season), /permission denied/);
      await assert.rejects(() => store.commit(uid, initial, bought.state, command), /permission denied/);
      await db.exec('reset role');
    }
    assert.equal((await db.query('select count(*)::int n from touchline_club_collection_operations')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from football_players')).rows[0].n, 1);
    await db.exec("update touchline_fantasy_entitlements set status='active'; update touchline_fantasy_gameweeks set locks_at=clock_timestamp()+interval '1 hour'");
    const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY['4-3-3'];
    await db.query("insert into touchline_formation_geometry_versions values('4-3-3','published',1,$1::jsonb)",[JSON.stringify(geometry)]);
    const form: ClubAllocationCommand = {action:'formation',formationCode:'4-3-3',expectedRevision:1,idempotencyKey:'formation_1'};
    const formed = allocateClubPlayers(bought.state,form,{marketOpen:true,geometry,reservedIds:[]});
    const allocation = (before: ClubAcquisitionState,next: ClubAcquisitionState,cmd: ClubAllocationCommand) => db.query<{state: ClubAcquisitionState}>(
      'select touchline_club_commit_allocation($1,$2,$3,$4::jsonb,$5::jsonb) state',[uid,season,before.revision,JSON.stringify(next),JSON.stringify(cmd)]);
    await db.exec('set role service_role');
    assert.deepEqual((await allocation(bought.state,formed,form)).rows[0].state,formed);
    assert.deepEqual((await allocation(bought.state,formed,form)).rows[0].state,formed,'allocation retries are readbacks');
    const move: ClubAllocationCommand = {action:'move',playerId:pid,area:'starters',slot:geometry.slots.findIndex(s=>s.allowedPositions.includes('goalkeeper')),expectedRevision:2,idempotencyKey:'movement_1'};
    const moved = allocateClubPlayers(formed,move,{marketOpen:true,geometry,reservedIds:[]});
    await assert.rejects(()=>allocation(formed,{...moved,balanceEur:moved.balanceEur+1},move),/CLUB_INVALID_TRANSITION/);
    await assert.rejects(()=>allocation(formed,{...moved,players:[{...moved.players[0],valueEur:1}]},move),/CLUB_INVALID_TRANSITION/);
    assert.deepEqual((await allocation(formed,moved,move)).rows[0].state,moved);
    assert.deepEqual(await store.read(uid,season),moved);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from touchline_club_collection_operations')).rows[0].n,3);
  } finally { await db.close(); }
});
