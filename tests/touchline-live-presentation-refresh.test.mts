import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_LIVE_PRESENTATION_POLL_MS,
  TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS,
  mergeTouchlineLivePresentationRevision,
  parseTouchlineLivePresentationState,
  resolveTouchlineLivePresentationTiming,
  touchlineLivePresentationRevisionChanged,
} from "../lib/touchlineArena/live-presentation-state.ts";
import { createTouchlineSharedCoalescer } from "../lib/touchlineArena/live-presentation-coalescer.ts";
import {
  TOUCHLINE_LIVE_PRESENTATION_DB_QUERY_BUDGET,
  TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS,
  readTouchlineLivePresentationInput,
  readPublishedTouchlineLivePresentationInput,
} from "../lib/touchlineArena/live-presentation-read-model.ts";

const componentSource = readFileSync(
  new URL("../components/touchline/TouchlineLivePresentationRefresh.tsx", import.meta.url),
  "utf8",
);
const clientStoreSource = readFileSync(
  new URL("../lib/touchlineArena/live-presentation-client-store.ts", import.meta.url), "utf8",
);
const endpointSource = readFileSync(
  new URL("../app/api/touchline-arena/live-presentation-state/route.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../lib/touchlineArena/live-presentation-state-server.ts", import.meta.url),
  "utf8",
);
const readerSource = readFileSync(
  new URL("../lib/touchlineArena/live-presentation-read-model.ts", import.meta.url),
  "utf8",
);
const surfaces = [
  "../app/touchline-player-card-rankings/page.tsx",
  "../app/touchline-players/[player]/page.tsx",
  "../app/touchline-coaches/[coach]/page.tsx",
  "../app/rankings/page.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

const now = Date.parse("2026-08-30T14:00:00.000Z");
const fixture = (
  fixtureId: string,
  state: "live" | "upcoming" | "finished" | "unknown",
  startsAt = "2026-08-30T14:00:00.000Z",
) => ({ fixtureId, state, startsAt, scoreable: state === "finished" });

test("one central cadence polls live and settling rankings but stops after final coverage", () => {
  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("live-1", "live")],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  }), { mode: "live", pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null });

  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("final-1", "finished")],
    playerRankingFixtureIds: ["final-1"],
    coachRankingFixtureIds: [],
    now,
  }), { mode: "settling", pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null });

  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("final-1", "finished")],
    playerRankingFixtureIds: ["final-1"],
    coachRankingFixtureIds: ["final-1"],
    now,
  }), { mode: "idle", pollAfterMs: null, resumeAt: null });

  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [{ ...fixture("cancelled-1", "finished"), scoreable: false }],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  }), { mode: "idle", pollAfterMs: null, resumeAt: null });

  assert.equal(touchlineLivePresentationRevisionChanged({
    playerRankingSnapshotId: "player-v4:season-1:digest",
    coachRankingSnapshotId: "coach-v2:season-1:digest",
    livePresentationSnapshotId: "a".repeat(32),
  }, {
    playerRankingSnapshotId: "player-v4:season-1:digest",
    coachRankingSnapshotId: "coach-v2:season-1:digest",
    livePresentationSnapshotId: "b".repeat(32),
  }), true, "a changed shared Live digest triggers a page refresh even when ranking pointers are stable");
});

test("prematch polling starts only inside the official one-hour window", () => {
  const near = resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("next-1", "upcoming", "2026-08-30T14:59:00.000Z")],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  });
  assert.deepEqual(near, { mode: "prematch", pollAfterMs: TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS, resumeAt: null });

  const distant = resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("next-2", "upcoming", "2026-08-30T17:00:00.000Z")],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  });
  assert.deepEqual(distant, {
    mode: "idle",
    pollAfterMs: null,
    resumeAt: "2026-08-30T16:00:00.000Z",
  });
});

test("a delayed kickoff status keeps bounded polling until the published state catches up", () => {
  const kickoff = Date.parse("2026-08-30T14:00:00.000Z");
  const pendingFixture = fixture("19722190", "upcoming");
  const delayed = resolveTouchlineLivePresentationTiming({
    fixtures: [pendingFixture, fixture("19722191", "upcoming", "2026-08-31T14:00:00.000Z")],
    playerRankingFixtureIds: [], coachRankingFixtureIds: [], now: kickoff + 30_000,
  });
  assert.deepEqual(delayed, { mode: "prematch", pollAfterMs: TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS, resumeAt: null });
  assert.equal(pendingFixture.state, "upcoming", "catch-up polling must not invent a live match status");
  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [pendingFixture], playerRankingFixtureIds: [], coachRankingFixtureIds: [], now: kickoff,
  }), delayed, "the kickoff instant must not turn polling off");
  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [{ ...pendingFixture, state: "live" }],
    playerRankingFixtureIds: [], coachRankingFixtureIds: [], now: kickoff + 60_000,
  }), { mode: "live", pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null });
  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [pendingFixture], playerRankingFixtureIds: [], coachRankingFixtureIds: [],
    now: kickoff + 4 * 60 * 60 * 1_000 + 1,
  }), { mode: "idle", pollAfterMs: null, resumeAt: null }, "an unresolved old fixture must not poll forever");
});

test("the public state parser fails closed and revisions change atomically", () => {
  const state = parseTouchlineLivePresentationState({
    version: 1,
    available: true,
    playerRankingSnapshotId: "player-snapshot-2",
    coachRankingSnapshotId: "coach-snapshot-2",
    mode: "live",
    pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS,
    resumeAt: null,
  });
  assert.ok(state);
  assert.equal(touchlineLivePresentationRevisionChanged({
    playerRankingSnapshotId: "player-snapshot-1",
    coachRankingSnapshotId: "coach-snapshot-2",
  }, state), true);
  assert.equal(parseTouchlineLivePresentationState({ ...state, pollAfterMs: 1_000 }), null);
  assert.equal(parseTouchlineLivePresentationState({ ...state, available: false }), null);

  assert.deepEqual(mergeTouchlineLivePresentationRevision({
    playerRankingSnapshotId: "verified-player",
    coachRankingSnapshotId: "verified-coach",
  }, {
    playerRankingSnapshotId: null,
    coachRankingSnapshotId: "next-coach",
  }, { player: true, coach: false }), {
    playerRankingSnapshotId: "verified-player",
    coachRankingSnapshotId: "verified-coach",
  });
});

test("publication revisions accept generated snapshot identities without weakening fixture IDs", () => {
  const snapshotId = "player-rating:1e83121b-b778-459b-b9a0-7cf1eaff5729:8f668692";
  const payload = {
    version: 1, available: true,
    playerRankingSnapshotId: snapshotId,
    coachRankingSnapshotId: "coach-v2:season-1:digest-2",
    mode: "live", pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null,
  };
  const parsed = parseTouchlineLivePresentationState(payload);
  assert.ok(parsed, "real publication IDs must reach the refresh consumer");
  assert.equal(parsed.playerRankingSnapshotId, snapshotId);
  assert.equal(parsed.coachRankingSnapshotId, payload.coachRankingSnapshotId);
  assert.equal(touchlineLivePresentationRevisionChanged({
    playerRankingSnapshotId: "player-rating:season-1:previous",
    coachRankingSnapshotId: payload.coachRankingSnapshotId,
  }, parsed), true);
  for (const invalid of ["", ":", "bad::id", "id:", ":id", "bad id", "<script>", "https://example.com", "id/other"]) {
    assert.equal(parseTouchlineLivePresentationState({ ...payload, playerRankingSnapshotId: invalid }), null);
    assert.equal(parseTouchlineLivePresentationState({ ...payload, coachRankingSnapshotId: invalid }), null);
  }
  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("not:a:fixture", "finished")],
    playerRankingFixtureIds: [], coachRankingFixtureIds: [], now,
  }), { mode: "idle", pollAfterMs: null, resumeAt: null });
});

test("the shared transport deduplicates across boundaries and preserves browser state", () => {
  assert.match(componentSource, /touchlineLivePresentationStore\.subscribe/);
  assert.match(componentSource, /changed \|\| periodicDue \|\| wakeDue/);
  assert.match(componentSource, /claimRefresh\(refreshOwnerRef\.current\)/);
  assert.doesNotMatch(componentSource, /fetch\(|setTimeout|addEventListener/);
  assert.match(clientStoreSource, /fetch\(STATE_URL/);
  assert.match(clientStoreSource, /request\?\.controller === controller/);
  assert.match(clientStoreSource, /visibilitychange/);
  assert.match(clientStoreSource, /window\.addEventListener\("online"/);
  assert.match(clientStoreSource, /window\.addEventListener\("offline"/);
  assert.match(componentSource, /router\.refresh\(\)/);
  assert.doesNotMatch(componentSource, /location\.(?:reload|replace)|window\.location/);
  assert.doesNotMatch(componentSource, /setInterval/);
  assert.match(endpointSource, /Cache-Control": "no-store"/);
  assert.match(endpointSource, /export async function GET\(\)/);
  assert.doesNotMatch(endpointSource, /cookies\(|searchParams|NextRequest|request:/);
  assert.match(serverSource, /unstable_cache/);
  assert.match(serverSource, /\[SHARED_CACHE_KEY\]/);
  assert.match(serverSource, /SHARED_CACHE_SECONDS = 5/);
  for (const source of surfaces) {
    assert.match(source, /<TouchlineLivePresentationRefresh/);
  }
});

test("the public reader owns a minimal six-query budget with no ranking or card payload", () => {
  assert.equal(TOUCHLINE_LIVE_PRESENTATION_DB_QUERY_BUDGET, 6);
  assert.deepEqual(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS, {
    activeSnapshot: "snapshot_id",
    playerSnapshot: "snapshot_id,source,status,scoring_version,coverage_status,expected_player_count,actual_player_count,fixture_ids,expected_fixture_ids",
    coachSnapshot: "snapshot_id,scoring_version,fixture_ids",
    competition: "id",
    fixtures: "provider_fixture_id,starts_at,status",
  });
  assert.doesNotMatch(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.playerSnapshot, /ranking_payload|selection_payload/);
  assert.doesNotMatch(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.coachSnapshot, /ranking_payload|selection_payload/);
  assert.doesNotMatch(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.fixtures, /home_club_id|away_club_id|season_id|round_id|raw/i);
  assert.doesNotMatch(readerSource, /loadTouchLineActiveRanking|loadTouchLineCoachRanking|readPublicCompetitionFixtures/);
});

test("the lightweight reader executes exactly six bounded projections", async () => {
  const calls: Array<{ table: string; projection: string }> = [];
  const rows: Record<string, unknown> = {
    touchline_card_ranking_active_snapshots: { snapshot_id: "player-2" },
    touchline_card_ranking_snapshots: {
      snapshot_id: "player-2",
      source: "sportmonks-audited",
      status: "published",
      scoring_version: "player_scoring_v4",
      coverage_status: "complete",
      expected_player_count: 20,
      actual_player_count: 20,
      fixture_ids: ["19722190"],
      expected_fixture_ids: ["19722190"],
    },
    touchline_coach_ranking_active_snapshots: { snapshot_id: "coach-2" },
    touchline_coach_ranking_snapshots: {
      snapshot_id: "coach-2",
      scoring_version: "coach_scoring_v2",
      fixture_ids: ["19722190"],
    },
    football_competitions: { id: "competition-8" },
    football_fixtures: [{
      provider_fixture_id: "19722190",
      starts_at: "2026-08-30T14:00:00.000Z",
      status: "FT",
    }],
  };
  const admin = {
    from(table: string) {
      let projection = "";
      const builder = {
        select(value: string) { projection = value; return builder; },
        eq() { return builder; },
        gte() { return builder; },
        order() { return builder; },
        async maybeSingle() {
          calls.push({ table, projection });
          return { data: rows[table] ?? null, error: null };
        },
        async limit() {
          calls.push({ table, projection });
          return { data: rows[table] ?? [], error: null };
        },
      };
      return builder;
    },
  };

  const input = await readTouchlineLivePresentationInput(
    admin as never,
    Date.parse("2026-08-30T14:15:00.000Z"),
  );
  assert.equal(calls.length, TOUCHLINE_LIVE_PRESENTATION_DB_QUERY_BUDGET);
  assert.deepEqual(calls, [
    { table: "touchline_card_ranking_active_snapshots", projection: TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.activeSnapshot },
    { table: "touchline_coach_ranking_active_snapshots", projection: TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.activeSnapshot },
    { table: "football_competitions", projection: TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.competition },
    { table: "touchline_card_ranking_snapshots", projection: TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.playerSnapshot },
    { table: "touchline_coach_ranking_snapshots", projection: TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.coachSnapshot },
    { table: "football_fixtures", projection: TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.fixtures },
  ]);
  assert.deepEqual(input, {
    playerRankingSnapshotId: "player-2",
    playerRankingFixtureIds: ["19722190"],
    coachRankingSnapshotId: "coach-2",
    coachRankingFixtureIds: ["19722190"],
    fixtures: [{
      fixtureId: "19722190",
      startsAt: "2026-08-30T14:00:00.000Z",
      status: "FT",
    }],
  });
});

test("the public Live reader consumes one verified immutable pointer revision", async () => {
  const calls: Array<{ table: string; projection: string }> = [];
  const snapshotId = "10000000-0000-4000-8000-000000000001";
  const payload = {
    version: 1,
    scopeKey: "touchline-england",
    windowStart: "2026-08-30T10:00:00.000Z",
    playerRankingSnapshotId: "player-v4:season-1:digest",
    playerRankingFixtureIds: ["19722190"],
    coachRankingSnapshotId: "coach-v2:season-1:digest",
    coachRankingFixtureIds: ["19722190"],
    liveScoreSnapshotDigest: "b".repeat(32),
    liveScorePayload: { fixtures: [{ provider: "sportmonks", providerId: "19722190" }], fetchedAt: "2026-08-30T14:00:00.000Z", storedAt: now },
    fixtures: [{ fixtureId: "19722190", startsAt: "2026-08-30T14:00:00.000Z", status: "FT" }],
  };
  const rows: Record<string, unknown> = {
    touchline_live_presentation_active_snapshots: { snapshot_id: snapshotId },
    touchline_live_presentation_snapshots: {
      id: snapshotId,
      scope_key: "touchline-england",
      content_digest: "a".repeat(32),
      payload,
      created_at: "2026-08-30T14:01:00.000Z",
    },
  };
  const admin = {
    from(table: string) {
      let projection = "";
      const builder = {
        select(value: string) { projection = value; return builder; },
        eq() { return builder; },
        async maybeSingle() {
          calls.push({ table, projection });
          return { data: rows[table] ?? null, error: null };
        },
      };
      return builder;
    },
  };

  const input = await readPublishedTouchlineLivePresentationInput(admin as never);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, [
    { table: "touchline_live_presentation_active_snapshots", projection: "snapshot_id" },
    { table: "touchline_live_presentation_snapshots", projection: "id,scope_key,content_digest,payload,created_at" },
  ]);
  assert.deepEqual(input, {
    snapshotId,
    contentDigest: "a".repeat(32),
    publishedAt: "2026-08-30T14:01:00.000Z",
    playerRankingSnapshotId: "player-v4:season-1:digest",
    playerRankingFixtureIds: ["19722190"],
    coachRankingSnapshotId: "coach-v2:season-1:digest",
    coachRankingFixtureIds: ["19722190"],
    liveScoreSnapshotDigest: "b".repeat(32),
    liveScorePayload: { fixtures: [{ provider: "sportmonks", providerId: "19722190" }], fetchedAt: "2026-08-30T14:00:00.000Z", storedAt: now },
    fixtures: [{ fixtureId: "19722190", startsAt: "2026-08-30T14:00:00.000Z", status: "FT" }],
  });

  rows.touchline_live_presentation_snapshots = {
    ...(rows.touchline_live_presentation_snapshots as Record<string, unknown>),
    payload: { ...payload, scopeKey: "touchline-other" },
  };
  await assert.rejects(readPublishedTouchlineLivePresentationInput(admin as never), /published snapshot payload is invalid/,
    "invalid or cross-scope payloads must not be confused with an absent first publication");
});

test("concurrent public reads share one in-flight load without stacking another cache window", async () => {
  const nowMs = 0;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const coalescer = createTouchlineSharedCoalescer<number>({ ttlMs: 0, now: () => nowMs });
  const loader = async () => {
    calls += 1;
    await gate;
    return 7;
  };
  const pending = Array.from({ length: 40 }, () => coalescer.load(loader));
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all(pending), Array(40).fill(7));
  assert.equal(await coalescer.load(async () => { calls += 1; return 8; }), 8);
  assert.equal(calls, 2);
  assert.match(serverSource, /ttlMs: 0/);
  assert.equal(nowMs, 0);
});

test("a failed shared read is not cached and freshness stays inside fifteen seconds", async () => {
  let nowMs = 0;
  let calls = 0;
  const coalescer = createTouchlineSharedCoalescer<string>({ ttlMs: 5_000, now: () => nowMs });
  await assert.rejects(() => coalescer.load(async () => {
    calls += 1;
    throw new Error("temporary");
  }), /temporary/);
  assert.equal(await coalescer.load(async () => { calls += 1; return "snapshot-1"; }), "snapshot-1");
  assert.equal(calls, 2);

  nowMs = 5_000;
  assert.equal(await coalescer.load(async () => { calls += 1; return "snapshot-2"; }), "snapshot-2");
  assert.equal(calls, 3);
  assert.ok(5_000 + TOUCHLINE_LIVE_PRESENTATION_POLL_MS <= 15_000);
});
