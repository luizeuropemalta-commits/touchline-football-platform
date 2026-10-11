import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20261011003000_touchline_live_presentation_immutable_publication.sql",
  import.meta.url,
);
const freshnessMigrationUrl = new URL(
  "../supabase/migrations/20261011004000_touchline_live_presentation_freshness_guard.sql",
  import.meta.url,
);
const scoreContractMigrationUrl = new URL(
  "../supabase/migrations/20261011013000_touchline_live_presentation_score_payload_contract.sql",
  import.meta.url,
);
const id = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const scorePayload = (home: number, source: unknown = { provider: "sportmonks", providerId: "91001" }) => ({
  fixtures: [{ id: "sportmonks:91001", provider: "sportmonks", providerId: "91001", source,
    score: { home, away: 0 }, events: [{ type: "goal" }] }],
  fetchedAt: new Date().toISOString(), storedAt: Date.now(),
});

function malformedScorePayload(mutate: (payload: Record<string, unknown>, fixture: Record<string, unknown>) => void) {
  const payload = JSON.parse(JSON.stringify(scorePayload(3))) as Record<string, unknown>;
  const fixture = (payload.fixtures as Array<Record<string, unknown>>)[0];
  mutate(payload, fixture);
  return payload;
}

test("Live publication captures canonical fixture/ranking inputs immutably behind one atomic pointer", async () => {
  let db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      create table public.football_competitions(id uuid primary key, provider text, provider_competition_id text);
      create table public.football_fixtures(
        id uuid primary key, provider text, provider_fixture_id text, competition_id uuid,
        starts_at timestamptz, status text
      );
      create table public.football_live_snapshots(snapshot_key text primary key, payload jsonb not null, fetched_at timestamptz);
      create table public.touchline_card_ranking_active_snapshots(league_key text primary key, snapshot_id text);
      create table public.touchline_card_ranking_snapshots(
        snapshot_id text, league_key text, source text, status text, scoring_version text,
        coverage_status text, expected_player_count integer, actual_player_count integer,
        fixture_ids jsonb, expected_fixture_ids jsonb
      );
      create table public.touchline_coach_ranking_active_snapshots(league_key text primary key, snapshot_id text);
      create table public.touchline_coach_ranking_snapshots(
        snapshot_id text, league_key text, scoring_version text, fixture_ids jsonb
      );
    `);
    await db.exec(await readFile(fileURLToPath(migrationUrl), "utf8"));
    await db.exec(await readFile(fileURLToPath(freshnessMigrationUrl), "utf8"));
    // QA applied 04000 with this captured publisher body.  Its TEXT[] locals
    // conflict with the actual JSONB ranking fixture columns; 13000 must
    // normalize that known historical shape before adding score validation.
    const qaPublisherPreimage = await readFile(
      new URL("fixtures/qa-live-publisher-preimage-20261011.sql", import.meta.url),
      "utf8",
    );
    const scoreContractMigration = await readFile(fileURLToPath(scoreContractMigrationUrl), "utf8");
    await db.exec(qaPublisherPreimage);
    assert.equal((await db.query("select md5(pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure)) as hash")).rows[0].hash, "59f4ceafc650015edcce8d6e333f0e19");
    const scoreAnchor = "  v_live_score_digest := md5(v_live_score_payload::text);";
    const duplicateScoreAnchorPreimage = qaPublisherPreimage.replace(
      scoreAnchor,
      `${scoreAnchor}\n${scoreAnchor}`,
    );
    assert.notEqual(duplicateScoreAnchorPreimage, qaPublisherPreimage);
    await db.exec(duplicateScoreAnchorPreimage);
    await assert.rejects(
      () => db.exec(scoreContractMigration),
      /TL_LIVE_PRESENTATION_SCORE_CONTRACT_SOURCE_MISMATCH/,
    );
    await db.exec("rollback");
    await db.exec(qaPublisherPreimage);
    await db.exec(scoreContractMigration);
    const normalizedPublisher = (await db.query("select pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure) as definition")).rows[0].definition as string;
    assert.match(normalizedPublisher, /v_player_fixture_ids jsonb := '\[\]'::jsonb/);
    assert.match(normalizedPublisher, /v_coach_fixture_ids jsonb := '\[\]'::jsonb/);
    assert.doesNotMatch(normalizedPublisher, /to_jsonb\(coalesce\(v_player_fixture_ids, '\{\}'\)\)/);
    assert.doesNotMatch(normalizedPublisher, /to_jsonb\(coalesce\(v_coach_fixture_ids, '\{\}'\)\)/);

    const competition = id(1);
    const fixtureA = id(2);
    const fixtureB = id(3);
    const fixtureAProvider = "91001";
    const fixtureBProvider = "91002";
    await db.query("insert into public.football_competitions values ($1,'sportmonks','8')", [competition]);
    await db.query("insert into public.football_live_snapshots (snapshot_key,payload,fetched_at) values ('touchline-england-live',$1,clock_timestamp())", [scorePayload(1)]);
    await db.query("update public.football_live_snapshots set fetched_at=clock_timestamp() where snapshot_key='touchline-england-live'");
    await db.query(`insert into public.football_fixtures values
      ($1,'sportmonks',$2,$3,clock_timestamp()+interval '1 day','NS'),
      ($4,'sportmonks',$5,$3,clock_timestamp()+interval '2 days','NS')`,
    [fixtureA, fixtureAProvider, competition, fixtureB, fixtureBProvider]);
    const fixtureIdsJson = JSON.stringify([fixtureAProvider, fixtureBProvider]);
    await db.query(`insert into public.touchline_card_ranking_snapshots values
      ('player-v4','touchline-england','sportmonks-audited','published','player_scoring_v4','complete',2,2,$1::jsonb,$1::jsonb)`,
    [fixtureIdsJson]);
    await db.query("insert into public.touchline_card_ranking_active_snapshots values ('touchline-england','player-v4')");
    await db.query(`insert into public.touchline_coach_ranking_snapshots values
      ('coach-v2','touchline-england','coach_scoring_v2',$1::jsonb)`, [fixtureIdsJson]);
    await db.query("insert into public.touchline_coach_ranking_active_snapshots values ('touchline-england','coach-v2')");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);

    const first = (await db.query("select public.touchline_live_presentation_publish_current() as result")).rows[0].result;
    const firstId = String(first.snapshotId);
    const payload = first.payload as Record<string, unknown>;
    assert.equal(payload.version, 1);
    assert.equal(payload.scopeKey, "touchline-england");
    assert.equal(payload.playerRankingSnapshotId, "player-v4");
    assert.equal(payload.coachRankingSnapshotId, "coach-v2");
    assert.deepEqual(payload.liveScorePayload, (await db.query("select payload from public.football_live_snapshots where snapshot_key='touchline-england-live'")).rows[0].payload);
    assert.match(String(payload.liveScoreSnapshotDigest), /^[0-9a-f]{32}$/);
    assert.deepEqual(payload.playerRankingFixtureIds, [fixtureAProvider, fixtureBProvider]);
    assert.deepEqual((payload.fixtures as Array<Record<string, unknown>>).map((fixture) => fixture.fixtureId), [fixtureAProvider, fixtureBProvider]);

    const pointerBefore = (await db.query("select snapshot_id from public.touchline_live_presentation_active_snapshots where scope_key='touchline-england'")).rows[0].snapshot_id;
    assert.equal(pointerBefore, firstId);
    const identicalRetry = (await db.query("select public.touchline_live_presentation_publish_current() as result")).rows[0].result;
    assert.equal(String(identicalRetry.snapshotId), firstId, "same content in the same minute reuses the immutable snapshot on retry");
    assert.equal((await db.query("select count(*)::int as count from public.touchline_live_presentation_snapshots")).rows[0].count, 1);
    const immutableBefore = (await db.query("select payload,content_digest from public.touchline_live_presentation_snapshots where id=$1", [firstId])).rows[0];

    await assert.rejects(db.exec(`update public.touchline_live_presentation_snapshots set payload='{}' where id='${firstId}'`), /TL_LIVE_PRESENTATION_SNAPSHOT_IMMUTABLE/);
    await assert.rejects(db.exec(`delete from public.touchline_live_presentation_snapshots where id='${firstId}'`), /TL_LIVE_PRESENTATION_SNAPSHOT_IMMUTABLE/);
    assert.deepEqual((await db.query("select payload,content_digest from public.touchline_live_presentation_snapshots where id=$1", [firstId])).rows[0], immutableBefore);

    await db.query("update public.football_fixtures set status='1H' where id=$1", [fixtureA]);
    await db.query("update public.football_live_snapshots set payload=$1,fetched_at=clock_timestamp() where snapshot_key='touchline-england-live'", [scorePayload(2)]);
    const second = (await db.query("select public.touchline_live_presentation_publish_current() as result")).rows[0].result;
    const secondId = String(second.snapshotId);
    assert.notEqual(secondId, firstId);
    assert.equal((await db.query("select snapshot_id from public.touchline_live_presentation_active_snapshots where scope_key='touchline-england'")).rows[0].snapshot_id, secondId);
    assert.equal((await db.query("select payload->'fixtures'->0->>'status' as status from public.touchline_live_presentation_snapshots where id=$1", [secondId])).rows[0].status, "1H");
    assert.equal((await db.query("select payload->'fixtures'->0->>'status' as status from public.touchline_live_presentation_snapshots where id=$1", [firstId])).rows[0].status, "NS");
    assert.equal((await db.query("select payload->'liveScorePayload'->'fixtures'->0->'score'->>'home' as score from public.touchline_live_presentation_snapshots where id=$1", [firstId])).rows[0].score, "1");
    assert.equal((await db.query("select payload->'liveScorePayload'->'fixtures'->0->'score'->>'home' as score from public.touchline_live_presentation_snapshots where id=$1", [secondId])).rows[0].score, "2");

    assert.equal((await db.query("select has_function_privilege('anon','public.touchline_live_presentation_publish_current()','EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.touchline_live_presentation_publish_current()','EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('service_role','public.touchline_live_presentation_publish_current()','EXECUTE') as allowed")).rows[0].allowed, true);
    const persistedDataDir = await db.dumpDataDir("none");
    await db.close();
    db = new PGlite({ loadDataDir: persistedDataDir });
    await db.waitReady;
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);
    assert.equal((await db.query("select snapshot_id from public.touchline_live_presentation_active_snapshots where scope_key='touchline-england'")).rows[0].snapshot_id, secondId, "published pointer survives database restart");
    assert.equal((await db.query("select count(*)::int as count from public.touchline_live_presentation_snapshots")).rows[0].count, 2, "immutable published snapshots survive database restart");

    const contractPointer = secondId;
    const contractSnapshotCount = 2;
    const invalidContracts = [
      malformedScorePayload((_, fixture) => { delete fixture.id; }),
      malformedScorePayload((_, fixture) => { fixture.id = null; }),
      malformedScorePayload((_, fixture) => { fixture.id = ""; }),
      malformedScorePayload((_, fixture) => { delete fixture.provider; }),
      malformedScorePayload((_, fixture) => { fixture.provider = null; }),
      malformedScorePayload((_, fixture) => { delete fixture.providerId; }),
      malformedScorePayload((_, fixture) => { fixture.providerId = null; }),
      malformedScorePayload((_, fixture) => { fixture.providerId = "0"; }),
      malformedScorePayload((_, fixture) => { fixture.providerId = "abc"; }),
      malformedScorePayload((_, fixture) => { fixture.providerId = "100000000000000000000"; }),
      malformedScorePayload((_, fixture) => { delete fixture.source; }),
      malformedScorePayload((_, fixture) => { fixture.source = null; }),
      malformedScorePayload((_, fixture) => { delete (fixture.source as Record<string, unknown>).provider; }),
      malformedScorePayload((_, fixture) => { (fixture.source as Record<string, unknown>).provider = null; }),
      malformedScorePayload((_, fixture) => { delete (fixture.source as Record<string, unknown>).providerId; }),
      malformedScorePayload((_, fixture) => { (fixture.source as Record<string, unknown>).providerId = null; }),
      malformedScorePayload((payload) => { delete payload.fetchedAt; }),
      malformedScorePayload((payload) => { payload.fetchedAt = null; }),
      malformedScorePayload((payload) => { payload.fetchedAt = ""; }),
      malformedScorePayload((payload) => { payload.fetchedAt = "infinity"; }),
      malformedScorePayload((payload) => { payload.fetchedAt = "2026-10-11T01:02:60Z"; }),
      malformedScorePayload((payload) => { delete payload.storedAt; }),
      malformedScorePayload((payload) => { payload.storedAt = null; }),
      malformedScorePayload((payload) => { payload.storedAt = "1"; }),
      malformedScorePayload((payload) => { payload.storedAt = -1; }),
      malformedScorePayload((payload) => { payload.storedAt = 8_640_000_000_000_001; }),
      malformedScorePayload((_, fixture) => { fixture.source = { provider: "sportmonks", providerId: "91002" }; }),
    ];
    for (const invalidPayload of invalidContracts) {
      await db.query("update public.football_live_snapshots set payload=$1,fetched_at=clock_timestamp() where snapshot_key='touchline-england-live'", [invalidPayload]);
      await assert.rejects(
        db.query("select public.touchline_live_presentation_publish_current()"),
        /TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_CONTRACT_INVALID/,
      );
      assert.equal((await db.query("select snapshot_id from public.touchline_live_presentation_active_snapshots where scope_key='touchline-england'")).rows[0].snapshot_id, contractPointer);
      assert.equal((await db.query("select count(*)::int as count from public.touchline_live_presentation_snapshots")).rows[0].count, contractSnapshotCount);
    }
    await db.query("update public.football_live_snapshots set payload=$1,fetched_at=clock_timestamp() where snapshot_key='touchline-england-live'", [scorePayload(3)]);
    const recovered = (await db.query("select public.touchline_live_presentation_publish_current() as result")).rows[0].result;
    const recoveredId = String(recovered.snapshotId);
    assert.notEqual(recoveredId, contractPointer, "a canonical payload remains publishable after rejected contract attempts");
    assert.equal((await db.query("select snapshot_id from public.touchline_live_presentation_active_snapshots where scope_key='touchline-england'")).rows[0].snapshot_id, recoveredId);
    assert.equal((await db.query("select count(*)::int as count from public.touchline_live_presentation_snapshots")).rows[0].count, contractSnapshotCount + 1);

    await db.query("update public.football_live_snapshots set fetched_at=clock_timestamp()-interval '10 days' where snapshot_key='touchline-england-live'");
    await assert.rejects(
      db.query("select public.touchline_live_presentation_publish_current()"),
      /TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_UNAVAILABLE/,
    );
    assert.equal((await db.query("select count(*)::int as count from public.touchline_live_presentation_snapshots")).rows[0].count, 3);
    assert.equal((await db.query("select snapshot_id from public.touchline_live_presentation_active_snapshots where scope_key='touchline-england'")).rows[0].snapshot_id, recoveredId);
  } finally {
    await db.close();
  }
});
