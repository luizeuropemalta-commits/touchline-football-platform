import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mapSportmonksFixtureCoaches } from "../lib/football-data/fixture-coach-attribution.ts";

const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const catalogue = [{ coach_provider_id: "101", club_provider_id: "10" }, { coach_provider_id: "102", club_provider_id: "11" }];
const reviewedCatalogue = [...catalogue, { coach_provider_id: "103", club_provider_id: "10" }];
function fixture(number = 901, coach = 101) {
  const raw = { id: number, league_id: 8, season_id: 701,
    participants: [{ id: 10, meta: { location: "home" } }, { id: 11, meta: { location: "away" } }],
    coaches: [{ id: coach, meta: { fixture_id: number, coach_id: coach, participant_id: 10 } },
      { id: 102, meta: { fixture_id: number, coach_id: 102, participant_id: 11 } }],
  };
  return { provider: "sportmonks", providerId: String(number), competitionId: "8", seasonId: "701",
    startsAt: `2026-09-${String(1 + (number - 901) * 7).padStart(2, "0")}T00:00:00Z`,
    homeTeam: { providerId: "10" }, awayTeam: { providerId: "11" }, homeScore: 2, awayScore: 1, status: "Full Time",
    coachAttribution: mapSportmonksFixtureCoaches(raw) };
}
function sqlFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end + 4);
}
type Receipt = { ok: boolean; reconciled: number; attributionFixturesChecked: number; pending: { fixtureProviderId: string; reason: string }[];
  ranking: { ok: boolean; snapshotId?: string; reason?: string; pendingCoachIds?: string[] } };

test("coach transfer follows the same provider identity and contract window without rewriting purchased club or legacy history", async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(`insert into football_clubs values('${uuid(12)}','sportmonks','12','Synthetic new club');
      insert into football_seasons values('${uuid(3)}','${uuid(1)}','700',false,'2026-07-01Z');
      insert into touchline_coach_contracts values('${uuid(23)}','101','${uuid(10)}','2026-09-01Z','2026-09-20Z','coach_scoring_v2');`);
    const contractsBefore = (await db.query("select * from touchline_coach_contracts order by id")).rows;
    const add = async (n: number, home: number, away: number, homeCoach: number, awayCoach: number, date: string, season = 701) => {
      const raw = { id: n, league_id: 8, season_id: season,
        participants: [{ id: home, meta: { location: "home" } }, { id: away, meta: { location: "away" } }],
        coaches: [{ id: homeCoach, meta: { fixture_id: n, coach_id: homeCoach, participant_id: home } },
          { id: awayCoach, meta: { fixture_id: n, coach_id: awayCoach, participant_id: away } }] };
      const payload = { ...fixture(), providerId: String(n), startsAt: date, seasonId: String(season),
        homeTeam: { providerId: String(home) }, awayTeam: { providerId: String(away) }, coachAttribution: mapSportmonksFixtureCoaches(raw) };
      await db.query("insert into football_fixtures values($1,'sportmonks',$2,$3,$4,$5,$6,$7,'Full Time',2,1,now())",
        [uuid(n), String(n), uuid(1), uuid(season === 701 ? 2 : 3), uuid(home), uuid(away), date]);
      await db.query("insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload) values('sportmonks',$1,$2::jsonb)", [String(n), JSON.stringify(payload)]);
    };
    await add(901, 10, 11, 101, 102, "2026-09-01T00:00:00Z");
    await add(902, 12, 11, 101, 102, "2026-09-08T00:00:00Z", 700);
    await add(903, 10, 11, 103, 102, "2026-09-15T00:00:00Z");
    await add(904, 10, 12, 103, 101, "2026-09-20T00:00:00Z");
    await add(905, 12, 11, 101, 102, "2026-07-31T00:00:00Z");
    const legacy = async (contract: number, match: number) => db.query(`insert into touchline_coach_fixture_points(
      contract_id,fixture_id,fixture_context,outcome,home_score,away_score,touchline_points,settlement_status,scoring_version)
      values($1,$2,'home','win',2,1,3,'final','coach_scoring_v2') returning *`, [uuid(contract), uuid(match)]);
    const legacyBefore = (await legacy(21, 902)).rows[0];
    const reconcile = async () => (await db.query<{ result: Receipt }>("select touchline_reconcile_verified_coach_fixture_points(null,$1::jsonb) result", [JSON.stringify(reviewedCatalogue)])).rows[0].result;
    let result = await reconcile();
    assert.deepEqual(result.pending, []);
    const settled = (await db.query("select contract_id,fixture_id,fixture_context,touchline_points from touchline_coach_fixture_points order by contract_id,fixture_id")).rows;
    assert.deepEqual(settled.filter(r => r.contract_id === uuid(21)).map(r => [r.fixture_id,r.fixture_context,r.touchline_points]),
      [[uuid(901),"home",3],[uuid(902),"home",3],[uuid(904),"away",-1]], "same coach moves club and faces the original club without receiving replacement's points");
    assert.deepEqual(settled.filter(r => r.contract_id === uuid(23)).map(r => r.fixture_id), [uuid(901),uuid(902)], "inclusive start and exclusive end survive a real-club move");
    assert.deepEqual((await db.query("select * from touchline_coach_fixture_points where contract_id=$1 and fixture_id=$2", [uuid(21),uuid(902)])).rows[0], legacyBefore);
    assert.equal((await reconcile()).reconciled, 0);
    // A legacy receipt for the wrong coach at the new club must be reviewed,
    // even though neither contract's purchased club is in this fixture.
    await add(906, 12, 11, 101, 102, "2026-09-21T00:00:00Z");
    const wrongLegacy = (await legacy(22, 906)).rows[0];
    result = await reconcile();
    assert.deepEqual(result.pending, [{ fixtureProviderId: "906", reason: "PCC05" }]);
    assert.deepEqual((await db.query("select * from touchline_coach_fixture_points where fixture_id=$1", [uuid(906)])).rows, [wrongLegacy]);
    assert.deepEqual((await db.query("select * from touchline_coach_contracts order by id")).rows, contractsBefore);
    const current = async () => (await db.query<{ result: Record<string, unknown> | null }>("select touchline_read_verified_coach_current_fixture($1) result", [uuid(21)])).rows[0].result;
    await add(908, 12, 11, 101, 102, new Date(Date.now() + 86_400_000).toISOString());
    await db.query("update football_fixtures set status='Not Started' where id=$1", [uuid(908)]);
    assert.equal(await current(), null, "upcoming match without receipt must remain pending");
    await add(907, 10, 12, 103, 101, new Date(Date.now() - 60_000).toISOString());
    await db.query("update football_fixtures set status='Live' where id=$1", [uuid(907)]);
    const feedStatus = (status: string) => db.query("update football_fantasy_fixture_feeds set fixture_payload=jsonb_set(fixture_payload,'{status}',to_jsonb($1::text)),last_synced_at=clock_timestamp() where provider_fixture_id='907'", [status]);
    await feedStatus("Live"); await reconcile();
    const verified = await current();
    assert.equal(verified?.context, "away"); assert.equal(verified?.provisionalPoints, -1);
    assert.equal(verified?.coachProviderId, "101"); assert.equal(verified?.contractId, uuid(21));
    await feedStatus("Full Time");
    assert.equal(await current(), null, "status mismatch cannot expose stale receipt");
    await feedStatus("Live");
    assert.equal(await current(), null, "receipt must match the latest source revision, even with unchanged identity/score");
    await reconcile();
    assert.equal((await current())?.context, "away", "reconciliation restores verified presentation");
    // Six deliberately stale receipts must not cause an unbounded scan to a
    // seventh valid live match. This tests the actual SQL limit, not a mock.
    for (let n = 910; n < 916; n++) {
      await add(n, 12, 11, 101, 102, new Date(Date.now() - (917 - n) * 60_000).toISOString());
      await db.query("update football_fixtures set status='Live' where id=$1", [uuid(n)]);
      await db.query(`insert into touchline_coach_fixture_points(contract_id,fixture_id,fixture_context,outcome,home_score,away_score,
        touchline_points,settlement_status,scoring_version,source_feed_revision_id,attribution_coach_provider_id,attribution_checksum)
        select $1,$2,'home','win',2,1,3,'provisional','coach_scoring_v2',id,'101',md5(payload::text)
        from football_feed_revisions where provider_fixture_id=$3 order by id desc limit 1`, [uuid(21),uuid(n),String(n)]);
    }
    assert.equal(await current(), null, "one SQL roundtrip validates at most six candidates");
    await db.exec("update football_fixtures set status='Full Time' where provider_fixture_id in ('910','911','912','913','914','915')");
    assert.equal((await current())?.provider_fixture_id, "907", "terminal candidates are skipped before the bounded validation");
    for (const status of ["FT", "AET", "PEN", "Finished", "Final", "Full Time", "Full-Time", "After Extra Time", "After Penalties", "Penalties Finished",
      "FT_PEN", "FT-Penalties", "Cancelled", "Abandoned", "Not Started"]) {
      const normalizedCase = `  ${status.toUpperCase()}  `;
      await db.query("update football_fixtures set status=$1 where provider_fixture_id='907'", [normalizedCase]);
      await feedStatus(normalizedCase);
      // Even a provisional legacy receipt with the latest revision cannot
      // make a completed or non-scoreable fixture current.
      await db.exec(`update touchline_coach_fixture_points points set source_feed_revision_id=revision.id,attribution_checksum=md5(revision.payload::text)
        from (select * from football_feed_revisions where provider_fixture_id='907' order by id desc limit 1) revision
        where points.fixture_id='${uuid(907)}' and points.settlement_status='provisional'`);
      assert.equal(await current(), null, status);
    }
    await db.exec("update football_fixtures set status='Live' where provider_fixture_id='907'");
    await feedStatus("Live"); await reconcile();
    assert.equal((await current())?.provider_fixture_id, "907");

    // Same coach, valid evidence and contract window, but another league.
    await db.exec(`insert into football_competitions values('${uuid(4)}','sportmonks','9');
      insert into football_seasons values('${uuid(5)}','${uuid(4)}','702',false,'2026-08-01Z');`);
    const outside = (await db.query<{ fixture_payload: Record<string, unknown> }>("select fixture_payload from football_fantasy_fixture_feeds where provider_fixture_id='907'")).rows[0].fixture_payload;
    Object.assign(outside, { providerId: "920", competitionId: "9", seasonId: "702", startsAt: new Date(Date.now() - 120_000).toISOString(),
      coachAttribution: { ...outside.coachAttribution as object, fixtureProviderId: "920", competitionProviderId: "9", seasonProviderId: "702" } });
    await db.query("insert into football_fixtures values($1,'sportmonks','920',$2,$3,$4,$5,$6,'Live',2,1,now())",
      [uuid(920),uuid(4),uuid(5),uuid(10),uuid(12),outside.startsAt]);
    await db.query("insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload) values('sportmonks','920',$1::jsonb)", [JSON.stringify(outside)]);
    await reconcile();
    assert.equal((await db.query("select count(*)::int n from touchline_coach_fixture_points where fixture_id=$1", [uuid(920)])).rows[0].n, 0, "another league never awards England contract points");
    await assert.rejects(db.query("select touchline_read_fixture_coach_evidence($1)", [uuid(920)]), /TL_COACH_FIXTURE_IDENTITY_MISMATCH/);
    await db.query(`insert into touchline_coach_fixture_points(contract_id,fixture_id,fixture_context,outcome,home_score,away_score,touchline_points,
      settlement_status,scoring_version,source_feed_revision_id,attribution_coach_provider_id,attribution_checksum)
      select $1,$2,'away','loss',2,1,-1,'provisional','coach_scoring_v2',id,'101',md5(payload::text)
      from football_feed_revisions where provider_fixture_id='920' order by id desc limit 1`, [uuid(21),uuid(920)]);
    assert.equal((await current())?.provider_fixture_id, "907", "even a pre-existing other-league receipt cannot become current");
    assert.deepEqual((await db.query("select * from touchline_coach_contracts order by id")).rows, contractsBefore);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set request.jwt.claim.role='${role}'`);
      await assert.rejects(current(), /TL_COACH_ADMIN_REQUIRED/);
      assert.equal((await db.query<{ allowed: boolean }>(`select has_function_privilege('${role}','public.touchline_read_verified_coach_current_fixture(uuid)','EXECUTE') allowed`)).rows[0].allowed, false);
    }
  } finally { await db.close(); }
});

async function createTestDatabase(install = true) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
      create table football_competitions(id uuid primary key,provider text,provider_competition_id text);
      create table football_seasons(id uuid primary key,competition_id uuid,provider_season_id text,is_current boolean,starts_at timestamptz);
      create table football_clubs(id uuid primary key,provider text,provider_team_id text,name text);
      create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text,competition_id uuid,season_id uuid,
        home_club_id uuid,away_club_id uuid,starts_at timestamptz,status text,home_score int,away_score int,source_updated_at timestamptz default now());
      create table touchline_coach_contracts(id uuid primary key,coach_provider_id text,club_id uuid,started_at timestamptz,ended_at timestamptz,scoring_version text);
      create table touchline_coach_fixture_points(id uuid default gen_random_uuid(),contract_id uuid,fixture_id uuid,fixture_context text,outcome text,
        home_score int,away_score int,touchline_points int,settlement_status text,scoring_version text,
        provider_source_updated_at timestamptz,settled_at timestamptz,updated_at timestamptz,unique(contract_id,fixture_id,scoring_version));
      create table touchline_coach_ranking_snapshots(snapshot_id text primary key,league_key text,season_id uuid,scoring_version text,
        fixture_ids jsonb,generated_at timestamptz,checksum text,ranking_payload jsonb);
      create table touchline_coach_ranking_active_snapshots(league_key text primary key,snapshot_id text,activated_at timestamptz,updated_at timestamptz);
      insert into football_competitions values('${uuid(1)}','sportmonks','8');
      insert into football_seasons values('${uuid(2)}','${uuid(1)}','701',true,'2026-08-01Z');
      insert into football_clubs values('${uuid(10)}','sportmonks','10','Synthetic A'),('${uuid(11)}','sportmonks','11','Synthetic B');
      insert into touchline_coach_contracts values('${uuid(21)}','101','${uuid(10)}','2026-08-01Z',null,'coach_scoring_v2'),
        ('${uuid(22)}','103','${uuid(10)}','2026-09-08Z',null,'coach_scoring_v2');
      set request.jwt.claim.role='service_role';`);
    const foundation = await readFile(new URL("../supabase/migrations/015_sportmonks_fantasy_data_foundation.sql", import.meta.url), "utf8");
    await db.exec(foundation.slice(0, foundation.indexOf("create table if not exists public.football_provider_capabilities")));
    await db.exec(await readFile(new URL("../supabase/migrations/20261026121254_football_feed_revision_history.sql", import.meta.url), "utf8"));
    const legacy = await readFile(new URL("../supabase/qa/037_touchline_qa_restore_canonical_coach_scoring_v2.sql", import.meta.url), "utf8");
    await db.exec(sqlFunction(legacy, "touchline_coach_points_v2"));
    for (const [file, name] of [
      ["019_touchline_qa_score_points_engine_v2_coach_status_gate.sql", "touchline_is_scoreable_fixture_status"],
      ["021_touchline_qa_score_points_engine_v2_final_status_normalization.sql", "touchline_is_final_fixture_status"],
    ]) await db.exec(sqlFunction(await readFile(new URL(`../supabase/qa/${file}`, import.meta.url), "utf8"), name));
    const contracts = await readFile(new URL("../supabase/qa/013_touchline_qa_coach_contract_scoring.sql", import.meta.url), "utf8");
    await db.exec(sqlFunction(contracts, "touchline_coach_final_points_are_immutable"));
    await db.exec(`create trigger final_points_immutable before update or delete on touchline_coach_fixture_points
      for each row execute function touchline_coach_final_points_are_immutable();`);
    if (install) await db.exec(await readFile(new URL("../supabase/migrations/20261027200540_fixture_coach_attribution_guard.sql", import.meta.url), "utf8"));
    return db;
  } catch (error) { await db.close(); throw error; }
}

for (const change of ["drop function touchline_is_final_fixture_status(text)", "drop table touchline_coach_ranking_active_snapshots",
  "drop trigger final_points_immutable on touchline_coach_fixture_points",
  "create or replace function touchline_coach_points_v2(p_context text,p_outcome text) returns integer language sql as $$select 99$$"]) {
  test(`migration rejects incomplete canonical prerequisites before adding columns: ${change}`, async () => {
    const db = await createTestDatabase(false);
    try {
      await db.exec(change);
      await assert.rejects(db.exec(await readFile(new URL("../supabase/migrations/20261027200540_fixture_coach_attribution_guard.sql", import.meta.url), "utf8")), /TL_COACH_ATTRIBUTION_PREREQUISITE/);
      assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='touchline_coach_fixture_points' and column_name='attribution_checksum'")).rows[0].n, 0);
    } finally { await db.close(); }
  });
}

test("fixture-aware SQL isolates pending matches, preserves A history and attributes only B matches to B", async () => {
  const db = await createTestDatabase();
  try {
    const reconcile = async (map = catalogue) => (await db.query<{ result: Receipt }>("select touchline_reconcile_verified_coach_fixture_points(null,$1::jsonb) result", [JSON.stringify(map)])).rows[0].result;
    const addFixture = (n: number) => db.query(`insert into football_fixtures values($1,'sportmonks',$2,$3,$4,$5,$6,$7,'Full Time',2,1,now())`,
      [uuid(n), String(n), uuid(1), uuid(2), uuid(10), uuid(11), fixture(n).startsAt]);
    const save = (payload: unknown, n = 901) => db.query(`insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload)
      values('sportmonks',$1,$2::jsonb) on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,last_synced_at=clock_timestamp()`, [String(n), JSON.stringify(payload)]);
    const points = async () => (await db.query("select id,contract_id,fixture_id,touchline_points,source_feed_revision_id from touchline_coach_fixture_points order by fixture_id,contract_id")).rows;
    const active = async () => (await db.query("select snapshot_id from touchline_coach_ranking_active_snapshots")).rows[0]?.snapshot_id;
    await addFixture(901);
    let result = await reconcile();
    assert.equal(result.ok, false); assert.equal(result.reconciled, 0);
    assert.equal(result.pending[0].reason, "PCC01");
    await save(fixture());
    result = await reconcile();
    assert.equal(result.ok, true); assert.equal(result.reconciled, 1);
    const firstSnapshot = await active(); assert.ok(firstSnapshot);
    const firstReceipt = (await points())[0];
    assert.equal(firstReceipt.contract_id, uuid(21)); assert.equal(firstReceipt.touchline_points, 3);
    assert.equal((await reconcile()).reconciled, 0);
    await save(fixture());
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from football_feed_revisions")).rows[0].n, 1);
    await addFixture(902); await save(fixture(902, 103), 902); await addFixture(903);
    result = await reconcile();
    assert.equal(result.ok, false); assert.equal(result.reconciled, 1, "missing 903 must not block verified 902");
    assert.deepEqual(result.pending, [{ fixtureProviderId: "903", reason: "PCC01" }]);
    assert.deepEqual((await points()).map(r => [r.contract_id, r.fixture_id, r.touchline_points]), [
      [uuid(21), uuid(901), 3], [uuid(22), uuid(902), 3],
    ], "active A contract cannot score B's match; B receives no pre-contract A match");
    assert.deepEqual((await points())[0], firstReceipt);
    assert.equal(await active(), firstSnapshot, "incomplete factual coverage does not replace the public ranking");
    const ambiguous = fixture(903, 103);
    ambiguous.coachAttribution = { ...ambiguous.coachAttribution, assignments: [ambiguous.coachAttribution.assignments[0], ambiguous.coachAttribution.assignments[0]] } as typeof ambiguous.coachAttribution;
    await save(ambiguous, 903);
    assert.equal((await reconcile()).pending[0].reason, "PCC02");
    await save({ ...fixture(903, 103), seasonId: "999" }, 903);
    assert.equal((await reconcile()).pending[0].reason, "PCC03");
    await save(fixture(903, 103), 903);
    result = await reconcile();
    assert.equal(result.reconciled, 1); assert.deepEqual(result.pending, []);
    assert.equal(result.ranking.reason, "coach-editorial-identity-pending");
    assert.deepEqual(result.ranking.pendingCoachIds, ["103"]);
    assert.equal(await active(), firstSnapshot);
    result = await reconcile(reviewedCatalogue);
    assert.equal(result.ok, true); assert.equal(result.reconciled, 0);
    assert.notEqual(await active(), firstSnapshot);
    const snapshot = (await db.query<{ ranking_payload: { coachProviderId: string; touchlinePoints: number }[]; attribution_revisions: unknown[] }>("select ranking_payload,attribution_revisions from touchline_coach_ranking_snapshots where snapshot_id=$1", [result.ranking.snapshotId])).rows[0];
    assert.deepEqual(new Map(snapshot.ranking_payload.map(r => [r.coachProviderId,r.touchlinePoints])), new Map([["101",3],["103",6],["102",-3]]));
    assert.equal(snapshot.attribution_revisions.length, 3);
    const lastSnapshot = await active(), receipts = await points();
    assert.equal((await reconcile(reviewedCatalogue)).reconciled, 0);
    assert.equal(await active(), lastSnapshot);
    await save(fixture(901, 103));
    result = await reconcile(reviewedCatalogue);
    assert.equal(result.pending[0].reason, "PCC05", "reclassified final historical attribution needs review, never reassignment");
    assert.deepEqual(await points(), receipts); assert.equal(await active(), lastSnapshot);
    await save({ ...fixture(), coachAttribution: undefined });
    assert.equal((await reconcile(reviewedCatalogue)).pending[0].reason, "PCC02", "a missing latest observation cannot borrow a prior complete one");
    await save(fixture());
    assert.equal((await reconcile(reviewedCatalogue)).ok, true, "valid refetch recovers the isolated fixture without deleting history");
    const history = (await db.query<{ coach: string | null }>("select payload->'fixture'->'coachAttribution'->'assignments'->0->>'coachProviderId' coach from football_feed_revisions where provider_fixture_id='901' order by id")).rows;
    assert.deepEqual(history.map(r => r.coach), ["101","103",null,"101"]);
    await addFixture(904); await save(fixture(904, 103), 904);
    await db.exec(`update football_fixtures set status='Live' where id='${uuid(904)}';`);
    await save({ ...fixture(904, 103), status: "Live" }, 904);
    assert.equal((await reconcile(reviewedCatalogue)).reconciled, 1);
    await db.exec(`update football_fixtures set home_score=0 where id='${uuid(904)}';`);
    await save({ ...fixture(904, 103), homeScore: 0, status: "Live" }, 904);
    assert.equal((await reconcile(reviewedCatalogue)).reconciled, 1, "same coach's provisional score can change");
    const provisional = (await points()).find(r => r.fixture_id === uuid(904))!;
    assert.equal(provisional.touchline_points, -2);
    await save({ ...fixture(904, 101), homeScore: 0, status: "Live" }, 904);
    assert.equal((await reconcile(reviewedCatalogue)).pending[0].reason, "PCC05", "a provisional attribution correction cannot leave two coaches credited");
    assert.deepEqual((await points()).find(r => r.fixture_id === uuid(904)), provisional);
    await save({ ...fixture(904, 103), homeScore: 0, status: "Live" }, 904);
    await db.exec(`update football_fixtures set status='Full Time' where id='${uuid(904)}';`);
    assert.equal((await reconcile(reviewedCatalogue)).pending[0].reason, "PCC03", "unchanged score with stale live feed cannot finalize a receipt");
    assert.equal((await db.query("select settlement_status from touchline_coach_fixture_points where fixture_id=$1", [uuid(904)])).rows[0].settlement_status, "provisional");
    await save({ ...fixture(904, 103), homeScore: 0 }, 904);
    assert.equal((await reconcile(reviewedCatalogue)).reconciled, 1);
    const finalized = await points(), finalizedSnapshot = await active();
    // Infrastructure errors are not converted to a successful partial receipt.
    // A late write failure rolls back the complete transaction.
    await addFixture(905); await save(fixture(905, 103), 905);
    await db.exec(`alter table touchline_coach_ranking_snapshots add constraint injected_failure check (not fixture_ids @> '["905"]'::jsonb);`);
    await assert.rejects(reconcile(reviewedCatalogue), /injected_failure/);
    assert.deepEqual(await points(), finalized); assert.equal(await active(), finalizedSnapshot);
    await db.exec("alter table touchline_coach_ranking_snapshots drop constraint injected_failure;");
    assert.equal((await reconcile(reviewedCatalogue)).reconciled, 1);
    await db.exec("begin");
    await reconcile(reviewedCatalogue);
    const tableLocks = (await db.query<{ mode: string }>("select mode from pg_locks where locktype='relation' and relation in ('football_fixtures'::regclass,'football_fantasy_fixture_feeds'::regclass,'touchline_coach_contracts'::regclass)")).rows;
    assert.ok(tableLocks.length > 0);
    assert.ok(tableLocks.every(lock => !["ShareLock","ExclusiveLock","AccessExclusiveLock"].includes(lock.mode)), "no whole-table SHARE lock blocks unrelated ingestion");
    await db.exec("commit");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set request.jwt.claim.role='${role}'`);
      await assert.rejects(reconcile(), /TL_COACH_ADMIN_REQUIRED/);
      for (const fn of ["touchline_reconcile_verified_coach_fixture_points(uuid,jsonb)", "touchline_read_fixture_coach_evidence(uuid)"]) {
        assert.equal((await db.query<{ allowed: boolean }>(`select has_function_privilege('${role}','public.${fn}','EXECUTE') allowed`)).rows[0].allowed, false);
      }
    }
    await assert.rejects(db.exec("delete from football_feed_revisions"), /FEED_REVISION_IMMUTABLE/);
    await assert.rejects(db.exec("delete from touchline_coach_fixture_points"), /TL_COACH_FINAL_POINTS_IMMUTABLE/);
    assert.equal((await db.query("select count(*)::int n from touchline_coach_contracts")).rows[0].n, 2);
    assert.equal((await db.query("select name from football_clubs order by provider_team_id")).rows[0].name, "Synthetic A");
  } finally { await db.close(); }
});
