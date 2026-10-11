import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Isolated, in-memory PostgreSQL. It applies the real lifecycle chain and
// 10000, using canonical membership/publication relations. It is not a
// multi-connection lock proof and must use the separately installed harness.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
type Row = Record<string, unknown>;
type Db = { exec(sql: string): Promise<unknown>; query<T extends Row = Row>(sql: string, args?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> };
const sql = (name: string) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = {
  competition: id(1), season: id(2), beta: id(3), legacy: id(4), betaCarry: id(5), betaCarryRejected: id(6), standard: id(7), pro: id(8), master: id(9), vip: id(10), downgrade: id(11), ineligibleCarry: id(12), allowed22: id(22), allowed117: id(117),
  allowed116: id(116), allowed52: id(52), blocked: id(19), spoofed22: id(220), previousRound: id(30), nextRound: id(31),
  previousFixture: id(32), nextFixture: id(33), locked: id(35), carryLocked: id(36), rejectedLocked: id(37), legacyLocked: id(38),
};
const player = (n: number) => id(100 + n);

function actualFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, `missing real ${name}`);
  return source.slice(start, end + 4);
}

function actualTable(source: string, name: string) {
  const start = source.indexOf(`create table if not exists public.${name} (`);
  const end = source.indexOf("\n);", start);
  assert.ok(start >= 0 && end > start, `missing real ${name}`);
  return source.slice(start, end + 3);
}

async function makeDatabase(): Promise<Db> {
  const { PGlite } = await import(modulePath!);
  const db: Db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.users(id uuid primary key);
      create table public.football_competitions(id uuid primary key);
      create table public.football_seasons(id uuid primary key);
      create table public.football_clubs(id uuid primary key, provider text, provider_team_id text);
      create table public.football_players(id uuid primary key, provider text, provider_player_id text, current_club_id uuid, position text, detailed_position text);
      create table public.football_rounds(id uuid primary key, competition_id uuid, season_id uuid, name text);
      create table public.football_fixtures(id uuid primary key,round_id uuid,competition_id uuid,season_id uuid,provider text,provider_fixture_id text,starts_at timestamptz,status text,home_club_id uuid,away_club_id uuid,finalized_at timestamptz,provider_updated_at timestamptz,source_updated_at timestamptz,updated_at timestamptz default now());
      create table public.football_squad_members(id uuid primary key,provider text,club_id uuid,player_id uuid,position text,detailed_position text,status text);
      create table public.football_player_market_values(id uuid primary key,player_id uuid,market_value_eur bigint,status text,confidence text);
      create table public.touchline_card_publications(id uuid primary key,player_id uuid,current_membership_id uuid,market_value_id uuid,publication_status text,published_at timestamptz);
      create table public.touchline_formation_geometry_versions(formation_code text,geometry_version integer,status text,geometry jsonb,primary key(formation_code,geometry_version));
    `);
    const base = await sql("20260825165821_touchline_fantasy_gameweek_v1");
    const tableStart = base.indexOf("create table if not exists public.touchline_fantasy_configs");
    const tableEnd = base.indexOf("create or replace function public.touchline_fantasy_position_bucket");
    assert.ok(tableStart >= 0 && tableEnd > tableStart);
    await db.exec(base.slice(tableStart, tableEnd));
    await db.exec(base.split("\n").filter(line =>
      /^(?:alter table public\.touchline_fantasy_\w+ enable row level security;|revoke all on table public\.touchline_fantasy_|grant .* on table public\.touchline_fantasy_)/.test(line)).join("\n"));
    for (const name of ["position_bucket", "fixture_is_final", "fixture_is_live", "entitlement_is_active", "sync_gameweeks", "reconcile_gameweek"]) {
      await db.exec(actualFunction(base, `touchline_fantasy_${name}`));
    }
    await db.exec(actualTable(await sql("048_touchline_player_season_statistics_read_model"), "football_player_fixture_statistics"));
    await db.exec(actualTable(await sql("015_sportmonks_fantasy_data_foundation"), "football_fantasy_fixture_feeds"));
    await db.exec(await sql("20260825202938_touchline_fantasy_markt_gameweek_xi"));
    const functionPermissions = base.split("\n").filter(line => /^(?:revoke all|grant execute) on function public\.touchline_fantasy_(?:lock_gameweek|reconcile_gameweek|prepare_user_gameweek)\(/.test(line));
    assert.equal(functionPermissions.length, 6);
    await db.exec(functionPermissions.join("\n"));
    await db.exec(await sql("20260825213744_touchline_fantasy_wall_clock_deadline"));
    const finality = await sql("20260826173229_touchline_fantasy_inter_round_market_window");
    await db.exec(finality.slice(0, finality.indexOf("create or replace function public.touchline_fantasy_sync_gameweeks")));
    await db.exec(await sql("20260919151427_touchline_fantasy_kickoff_final_whistle_market_window"));
    await db.exec(await sql("20260920153000_touchline_fantasy_safe_rollover_settlement"));
    await db.exec(await sql("20261011010000_touchline_fantasy_market_plan_policy"));
    await db.exec(await sql("20261011014000_touchline_fantasy_server_owned_plan_budgets"));
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function seed(db: Db) {
  const slots = Array.from({ length: 11 }, (_, index) => ({ id: `slot-${index + 1}`, priority: index + 1, role: "midfielder", allowedPositions: ["midfield"] }));
  await db.exec(`
    insert into public.users values ('${ids.beta}'),('${ids.legacy}'),('${ids.betaCarry}'),('${ids.betaCarryRejected}'),('${ids.standard}'),('${ids.pro}'),('${ids.master}'),('${ids.vip}'),('${ids.downgrade}'),('${ids.ineligibleCarry}');
    insert into public.football_competitions values ('${ids.competition}'); insert into public.football_seasons values ('${ids.season}');
    insert into public.football_clubs values
      ('${ids.allowed22}','sportmonks','22'),('${ids.allowed117}','sportmonks','117'),('${ids.allowed116}','sportmonks','116'),('${ids.allowed52}','sportmonks','52'),
      ('${ids.blocked}','sportmonks','19'),('${ids.spoofed22}','other-provider','22');
    insert into public.touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values ('england','${ids.competition}','${ids.season}',2990,'GBP',500000000,3);
    insert into public.touchline_fantasy_entitlements(user_id,status,source,plan_key) values
      ('${ids.beta}','active','qa_grant','beta'),('${ids.legacy}','active','qa_grant',null),
      ('${ids.betaCarry}','active','qa_grant','beta'),('${ids.betaCarryRejected}','active','qa_grant','beta'),
      ('${ids.standard}','active','qa_grant','standard'),('${ids.pro}','active','qa_grant','pro'),
      ('${ids.master}','active','qa_grant','master'),('${ids.vip}','active','qa_grant','vip'),
      ('${ids.downgrade}','active','qa_grant','standard'),('${ids.ineligibleCarry}','active','qa_grant','master');
    insert into public.touchline_formation_geometry_versions(formation_code,geometry_version,status,geometry)
      values ('4-3-3',1,'published','${JSON.stringify({ slots }).replace(/'/g, "''")}'::jsonb);
    insert into public.football_rounds values ('${ids.previousRound}','${ids.competition}','${ids.season}','Gameweek 1'),('${ids.nextRound}','${ids.competition}','${ids.season}','Gameweek 2');
    insert into public.football_fixtures(id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id,finalized_at)
      values ('${ids.previousFixture}','${ids.previousRound}','${ids.competition}','${ids.season}','sportmonks','10001',clock_timestamp()-interval '2 days','FT','${ids.allowed22}','${ids.allowed117}',clock_timestamp()-interval '1 day'),
             ('${ids.nextFixture}','${ids.nextRound}','${ids.competition}','${ids.season}','sportmonks','10002',clock_timestamp()+interval '2 days','NS','${ids.allowed22}','${ids.allowed117}',null);
  `);
  const clubs = [ids.allowed22, ids.allowed117, ids.allowed116, ids.allowed52, ids.allowed22, ids.allowed117, ids.allowed116, ids.allowed52, ids.allowed22, ids.allowed117, ids.allowed116];
  for (let n = 1; n <= 11; n++) {
    const club = clubs[n - 1];
    await db.exec(`insert into public.football_players values ('${player(n)}','sportmonks','${10000 + n}','${club}','CM','CM');
      insert into public.football_squad_members values ('${id(200 + n)}','sportmonks','${club}','${player(n)}','CM','CM','active');
      insert into public.football_player_market_values values ('${id(300 + n)}','${player(n)}',4000000,'verified','verified');
      insert into public.touchline_card_publications values ('${id(400 + n)}','${player(n)}','${id(200 + n)}','${id(300 + n)}','published',clock_timestamp());`);
  }
  // A canonical player at a blocked Sportmonks team and a same-provider-id impostor.
  for (const [n, club] of [[12, ids.blocked], [13, ids.spoofed22]] as const) {
    await db.exec(`insert into public.football_players values ('${player(n)}','sportmonks','${10000 + n}','${club}','CM','CM');
      insert into public.football_squad_members values ('${id(200 + n)}','sportmonks','${club}','${player(n)}','CM','CM','active');
      insert into public.football_player_market_values values ('${id(300 + n)}','${player(n)}',4000000,'verified','verified');
      insert into public.touchline_card_publications values ('${id(400 + n)}','${player(n)}','${id(200 + n)}','${id(300 + n)}','published',clock_timestamp());`);
  }
  await db.exec("select public.touchline_fantasy_sync_gameweeks()");
  const gameweeks = (await db.query<{ id: string; round_id: string }>("select id,round_id from public.touchline_fantasy_gameweeks order by gameweek_number")).rows;
  assert.equal(gameweeks.length, 2);
  const previous = gameweeks[0].id, next = gameweeks[1].id;
  for (const [lockedId,userId,legalBeta] of [[ids.locked,ids.beta,false],[ids.carryLocked,ids.betaCarry,true],
    [ids.rejectedLocked,ids.betaCarryRejected,true],[ids.legacyLocked,ids.legacy,false]] as const) {
    await db.query(`insert into public.touchline_fantasy_user_gameweeks(id,user_id,gameweek_id,formation_code,selected_coach_id,locked_coach_id,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur,locked_at)
      values ($1,$2,$3,'4-3-3','307','307','LOCKED',$4,3,44000000,clock_timestamp()-interval '1 day')`,[lockedId,userId,previous,legalBeta ? 50000000 : 500000000]);
    for(let slot=1;slot<=11;slot++) {
      const playerNumber=slot===11 && !legalBeta ? 12 : slot;
      await db.query(`insert into public.touchline_fantasy_locked_selections(user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur,locked_at)
        select $1,$2,$3,id,current_club_id,'midfielder','midfield',4000000,clock_timestamp()-interval '1 day' from public.football_players where id=$4`,
      [lockedId,`slot-${slot}`,slot,player(playerNumber)]);
    }
  }
  return { previous, next };
}

const selections = (count = 11) => Array.from({ length: count }, (_, index) => ({ playerId: player(index + 1), slotId: `slot-${index + 1}` }));
const legacySelections = () => [...selections(10), { playerId: player(12), slotId: "slot-11" }];
const save = (db: Db, user: string, gameweek: string, value: unknown[], action: "draft" | "confirm", key: string) => db.query<{ result: Row }>(
  "select public.touchline_fantasy_save_lineup($1,$2,'307','4-3-3',$3::jsonb,$4,$5) as result", [user, gameweek, JSON.stringify(value), action, key],
);
async function rejected(db: Db, call: () => Promise<unknown>, pattern: RegExp) {
  await db.exec("savepoint rejected");
  await assert.rejects(call, pattern);
  await db.exec("rollback to savepoint rejected");
}

async function seedLockedXi(db: Db, userId: string, userGameweekId: string, gameweekId: string, budgetEur: number | null, planKey: string | null, valueEur: number) {
  await db.query(`insert into public.touchline_fantasy_user_gameweeks
    (id,user_id,gameweek_id,formation_code,selected_coach_id,locked_coach_id,state,budget_eur_snapshot,market_plan_key_snapshot,max_players_per_club_snapshot,total_market_value_eur,locked_at)
    values ($1,$2,$3,'4-3-3','307','307','LOCKED',$4,$5,3,$6,clock_timestamp()-interval '1 day')`,
  [userGameweekId, userId, gameweekId, budgetEur, planKey, valueEur * 11]);
  for (let slot = 1; slot <= 11; slot++) {
    await db.query(`insert into public.touchline_fantasy_locked_selections
      (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur,locked_at)
      select $1,$2,$3,id,current_club_id,'midfielder','midfield',$4,clock_timestamp()-interval '1 day'
      from public.football_players where id=$5`, [userGameweekId, `slot-${slot}`, slot, valueEur, player(slot)]);
  }
}

test("market-plan 10000 enforces Beta atomically through the real save/prepare SQL", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec("begin");
    const { next } = await seed(db);
    assert.deepEqual((await db.query("select public.touchline_fantasy_position_bucket('CM') as valid, public.touchline_fantasy_position_bucket('MID') as unsupported")).rows[0],
      { valid: "midfield", unsupported: null }, "fixture positions must satisfy the real eligibility parser; do not broaden production rules for a test alias");
    const lockedBefore=(await db.query("select to_jsonb(locked) as row from public.touchline_fantasy_locked_selections locked order by user_gameweek_id,slot_index")).rows;
    const prepare=async(userId:string)=>(await db.query<{id:string}>("select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id",[userId,next])).rows[0].id;
    const carried=await prepare(ids.betaCarry);
    const carriedRows=(await db.query("select player_id,club_id,market_value_eur from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 order by slot_index",[carried])).rows;
    assert.deepEqual(carriedRows.map(row=>row.player_id),selections().map(row=>row.playerId),"all eleven still-eligible Beta players carry, without substitutions");
    assert.equal((await db.query("select state,confirmed_at,total_market_value_eur from public.touchline_fantasy_user_gameweeks where id=$1",[carried])).rows[0].state,"DRAFT");
    assert.equal((await db.query("select confirmed_at from public.touchline_fantasy_user_gameweeks where id=$1",[carried])).rows[0].confirmed_at,null);
    assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1",[carried])).rows[0].n,0,"carry does not grant past points");
    assert.equal((await db.query("select max(n)::int as n from (select count(*) n from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 group by club_id) clubs",[carried])).rows[0].n,3);
    assert.equal(await prepare(ids.betaCarry),carried,"retry preserves the already-created draft");
    assert.deepEqual((await db.query("select player_id,club_id,market_value_eur from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 order by slot_index",[carried])).rows,carriedRows);
    for(const [reason,change] of [
      ["current prices exceed 50M",()=>db.query("update public.football_player_market_values set market_value_eur=11000000 where player_id=$1",[player(11)])],
      ["a previously published card is no longer published",()=>db.query("update public.touchline_card_publications set publication_status='draft' where player_id=$1",[player(11)])],
    ] as const) {
      await db.exec("savepoint carry_rejected");await change();const empty=await prepare(ids.betaCarryRejected);
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1",[empty])).rows[0].n,0,reason);
      assert.deepEqual((await db.query("select to_jsonb(locked) as row from public.touchline_fantasy_locked_selections locked order by user_gameweek_id,slot_index")).rows,lockedBefore);
      await db.exec("rollback to savepoint carry_rejected");
    }
    await db.exec("savepoint legal_club_transfer");
    await db.query("update public.football_players set current_club_id=$1 where id=$2",[ids.allowed22,player(11)]);
    await db.query("update public.football_squad_members set club_id=$1 where player_id=$2",[ids.allowed22,player(11)]);
    const legalCarry=await prepare(ids.betaCarryRejected);
    assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1",[legalCarry])).rows[0].n,11,"a legal transfer within the four allowed clubs still carries the XI; the old three-player club cap is retired");
    await db.exec("rollback to savepoint legal_club_transfer");
    await rejected(db, () => prepare(ids.legacy), /TL_FANTASY_PLAN_INVALID/);
    assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_user_gameweeks where user_id=$1 and gameweek_id=$2",[ids.legacy,next])).rows[0].n,0,"a missing plan cannot create a new XI with the retired budget");
    const prepared = (await db.query<{ id: string }>("select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id", [ids.beta, next])).rows[0].id;
    assert.equal(Number((await db.query("select budget_eur_snapshot from public.touchline_fantasy_user_gameweeks where id=$1", [prepared])).rows[0].budget_eur_snapshot), 50_000_000);
    assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1", [prepared])).rows[0].n, 0, "one ineligible club leaves the entire Beta draft empty rather than choosing players");
    assert.deepEqual((await db.query("select to_jsonb(locked) as row from public.touchline_fantasy_locked_selections locked order by user_gameweek_id,slot_index")).rows,lockedBefore,"all predecessor snapshots remain immutable");
    const beta = (await save(db, ids.beta, next, selections(), "confirm", "beta-confirm-0001")).rows[0].result;
    assert.equal(Number(beta.budgetRemainingEur), 6_000_000);
    assert.equal(Number((await db.query("select budget_eur_snapshot,state from public.touchline_fantasy_user_gameweeks where user_id=$1 and gameweek_id=$2", [ids.beta, next])).rows[0].budget_eur_snapshot), 50_000_000);
    // Market stays open: remove/re-add and confirm->draft edits are accepted without a hidden limit.
    await save(db, ids.beta, next, [], "draft", "beta-remove-0002");
    await save(db, ids.beta, next, selections(1), "draft", "beta-readd-0003");
    await save(db, ids.beta, next, selections(), "confirm", "beta-confirm-0004");
    await save(db, ids.beta, next, selections(10), "draft", "beta-edit-open-0005");
    assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=(select id from public.touchline_fantasy_user_gameweeks where user_id=$1 and gameweek_id=$2)", [ids.beta, next])).rows[0].n, 10);
    await rejected(db, () => save(db, ids.beta, next, [{ playerId: player(12), slotId: "slot-1" }], "draft", "blocked-club-0006"), /TL_FANTASY_SELECTION_INELIGIBLE/);
    await rejected(db, () => save(db, ids.beta, next, [{ playerId: player(13), slotId: "slot-1" }], "draft", "spoof-provider-0007"), /TL_FANTASY_SELECTION_INELIGIBLE/);
    await db.query("update public.football_player_market_values set market_value_eur=50000000 where player_id=$1", [player(11)]);
    await rejected(db, () => save(db, ids.beta, next, selections(), "confirm", "budget-exceed-0008"), /TL_FANTASY_BUDGET_EXCEEDED/);
    await rejected(db, () => save(db, ids.legacy, next, legacySelections(), "confirm", "no-plan-denied-0009"), /TL_FANTASY_PLAN_INVALID/);
    // Save synchronizes the schedule first: close through the canonical kickoff,
    // not a transient manual state that the real synchronizer would reopen.
    await db.query("update public.football_fixtures set starts_at=clock_timestamp()-interval '1 minute',status='LIVE' where id=$1", [ids.nextFixture]);
    await rejected(db, () => save(db, ids.beta, next, [], "draft", "closed-denied-0010"), /TL_FANTASY_GAMEWEEK_LOCKED/);
    const acl = (await db.query(`select has_function_privilege('anon','public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)','EXECUTE') as anon,
      has_function_privilege('authenticated','public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)','EXECUTE') as authenticated,
      has_function_privilege('service_role','public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)','EXECUTE') as service`)).rows[0];
    assert.deepEqual(acl, { anon: false, authenticated: false, service: true });
  } finally { await db.exec("rollback"); await db.close(); }
});

test("14000 snapshots only server-owned plan budgets and revalidates every carried XI", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec("begin");
    const { previous, next } = await seed(db);
    const prepare = async (userId: string) => (await db.query<{ id: string }>(
      "select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id", [userId, next],
    )).rows[0].id;

    for (const [userId, planKey, budgetEur] of [
      [ids.beta, "beta", 50_000_000], [ids.standard, "standard", 500_000_000],
      [ids.pro, "pro", 1_000_000_000], [ids.master, "master", 2_000_000_000],
      [ids.vip, "vip", null],
    ] as const) {
      const gameweekId = await prepare(userId);
      const snapshot = (await db.query("select budget_eur_snapshot,market_plan_key_snapshot from public.touchline_fantasy_user_gameweeks where id=$1", [gameweekId])).rows[0];
      assert.equal(snapshot.market_plan_key_snapshot, planKey);
      assert.equal(snapshot.budget_eur_snapshot === null ? null : Number(snapshot.budget_eur_snapshot), budgetEur);
    }
    await rejected(db, () => prepare(ids.legacy), /TL_FANTASY_PLAN_INVALID/);

    await db.query("update public.football_player_market_values set market_value_eur=46000000");
    await rejected(db, () => save(db, ids.standard, next, selections(), "confirm", "standard-over-500m"), /TL_FANTASY_BUDGET_EXCEEDED/);
    await db.query("update public.football_player_market_values set market_value_eur=100000000");
    await rejected(db, () => save(db, ids.pro, next, selections(), "confirm", "pro-over-1b-00001"), /TL_FANTASY_BUDGET_EXCEEDED/);
    await db.query("update public.football_player_market_values set market_value_eur=200000000");
    await rejected(db, () => save(db, ids.master, next, selections(), "confirm", "master-over-2b-01"), /TL_FANTASY_BUDGET_EXCEEDED/);
    await db.query("update public.football_player_market_values set market_value_eur=300000000");
    const vip = (await save(db, ids.vip, next, selections(), "confirm", "vip-unlimited-01")).rows[0].result;
    assert.equal(vip.budgetRemainingEur, null, "VIP remains unlimited without an unsafe numeric sentinel");
    assert.deepEqual((await db.query("select budget_eur_snapshot,market_plan_key_snapshot from public.touchline_fantasy_user_gameweeks where user_id=$1 and gameweek_id=$2", [ids.vip, next])).rows[0], {
      budget_eur_snapshot: null, market_plan_key_snapshot: "vip",
    });

    const downgradeLocked = id(60);
    await db.query("update public.football_player_market_values set market_value_eur=60000000");
    await seedLockedXi(db, ids.downgrade, downgradeLocked, previous, 2_000_000_000, "master", 60_000_000);
    const downgradeBefore = (await db.query("select to_jsonb(row) as value from public.touchline_fantasy_user_gameweeks row where id=$1", [downgradeLocked])).rows[0];
    const downgradeDraft = await prepare(ids.downgrade);
    assert.equal((await db.query("select count(*)::int as count from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1", [downgradeDraft])).rows[0].count, 0,
      "a Master XI above Standard's budget is not silently carried into the lower plan");
    assert.deepEqual((await db.query("select to_jsonb(row) as value from public.touchline_fantasy_user_gameweeks row where id=$1", [downgradeLocked])).rows[0], downgradeBefore);
    await rejected(db, () => db.query("update public.touchline_fantasy_user_gameweeks set budget_eur_snapshot=500000000 where id=$1", [downgradeLocked]), /TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE/);

    const ineligibleLocked = id(61);
    await db.query("update public.football_player_market_values set market_value_eur=4000000");
    await seedLockedXi(db, ids.ineligibleCarry, ineligibleLocked, previous, 2_000_000_000, "master", 4_000_000);
    const ineligibleBefore = (await db.query("select to_jsonb(row) as value from public.touchline_fantasy_user_gameweeks row where id=$1", [ineligibleLocked])).rows[0];
    await db.query("update public.touchline_card_publications set publication_status='draft' where player_id=$1", [player(11)]);
    const ineligibleDraft = await prepare(ids.ineligibleCarry);
    assert.equal((await db.query("select count(*)::int as count from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1", [ineligibleDraft])).rows[0].count, 0,
      "a carry is all-or-nothing when one player is no longer currently eligible");
    assert.deepEqual((await db.query("select to_jsonb(row) as value from public.touchline_fantasy_user_gameweeks row where id=$1", [ineligibleLocked])).rows[0], ineligibleBefore);
  } finally { await db.exec("rollback"); await db.close(); }
});
