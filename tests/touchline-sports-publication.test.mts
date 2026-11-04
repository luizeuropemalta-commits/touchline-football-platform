import { reader as currentReaders, createCachedRankingReader } from "./helpers/touchline-current-ranking-readers.mts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { buildTouchlineRankingSnapshot } from "../lib/touchlineArena/card-ranking.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { TOUCHLINE_ENGLAND_LEAGUE_KEY, TOUCHLINE_PRESEASON_RANKING_STATE, parseTouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { parsePersistedTouchlinePlayerLeadership } from "../lib/touchlineArena/player-ranking-leadership.ts";
import { legacyCoachCatalogue, parseCoachCatalogue, parseCoachCatalogueTransport, catalogueCoachForId } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { parseTouchlineSportsPublication, touchlinePublishedPlayerFacts } from "../lib/touchlineArena/sports-publication.ts";
import { readPublishedTouchlineLivePresentationInput } from "../lib/touchlineArena/live-presentation-read-model.ts";
import { toPublicTouchlineFixtures } from "../lib/football-data/public-fixture.ts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-10-23T08:00:00.000Z";
const F = "19722190";
const P = "player:publication-a";
const C = "coach:publication-a";
const scope = "touchline-england";
const code = (path: string) => stripTypeScriptTypes(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
  .replace(/^export\s+\{[^}]*\}\s+from[^;]*;\s*$/gm, "")
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");

function readyCatalogue() {
  const entries=legacyCoachCatalogue().current.map((entry,index)=>({id:id(600+index),publicationId:id(700+index),
    providerId:entry.coach.providerId,teamId:entry.coach.teamId,name:entry.coach.name,observedAt:NOW,
    countryCode3:entry.countryCode3,classification:entry.classification,sourceKind:"sportmonks.fixture.coaches"}));
  const catalogue=parseCoachCatalogue({revision:1,current:entries,history:entries});
  assert.equal(catalogue.phase,"ready");return catalogue;
}

function data() {
  const ranking = buildTouchlineRankingSnapshot({ snapshotId: P, roundId: "round-1", generatedAt: NOW,
    source: "sportmonks-audited", status: "published",
    players: ["GK", "CB", "RB", "CM", "RW", "ST"].map((position, index) => ({ playerId: id(index + 1),
      providerPlayerId: index + 1, name: `Player ${index}`, clubName: "Club", position,
      totalRating: 100 - index, minutesPlayed: 90, appearances: 1 })) });
  const fixture = { id: `sportmonks:${F}`, provider: "sportmonks", providerId: F,
    homeTeam: { providerId: "19", name: "Home", source: { private: "do-not-publish" } },
    awayTeam: { providerId: "18", name: "Away" }, homeScore: 1, awayScore: 0, status: "1H",
    startsAt: NOW, source: { provider: "sportmonks", providerId: F, lastSyncedAt: NOW, raw: "private" } };
  const shared = { version: 1, scopeKey: scope, windowStart: NOW,
    playerRankingSnapshotId: P, playerRankingFixtureIds: [F], coachRankingSnapshotId: C, coachRankingFixtureIds: [F],
    fixtures: [{ fixtureId: F, startsAt: NOW, status: "1H" }], liveScoreSnapshotDigest: "b".repeat(32),
    liveScorePayload: { fixtures: [fixture], fetchedAt: NOW, storedAt: Date.parse(NOW) } };
  return {
    football_competitions: [{id:id(200),provider:"sportmonks",provider_competition_id:"8"}],
    football_seasons: [{id:id(50),provider:"sportmonks",provider_season_id:"70001",competition_id:id(200),is_current:true,name:"2026/2027"}],
    football_players: Array.from({length:7},(_,index)=>({id:id(index+1),provider:"sportmonks",provider_player_id:String(index+1),current_club_id:id(300)})),
    football_clubs: readyCatalogue().current.map((entry,index)=>({id:id(300+index),provider:"sportmonks",provider_team_id:entry.coach.teamId,competition_id:id(200),name:`Club ${entry.coach.teamId}`})),
    football_squad_members: Array.from({length:7},(_,index)=>({id:id(index+400),provider:"sportmonks",player_id:id(index+1),club_id:id(300),competition_id:id(200),status:"active",jersey_number:1})),
    touchline_card_publications: Array.from({length:7},(_,index)=>({player_id:id(index+1),current_membership_id:id(index+400),competition_id:id(200),effective_season:"2026-27",publication_status:"published",calculated_tier:"ruby-red",calculated_nominal_price_gbp:10,last_reviewed_at:NOW,internal_source:"editorial"})),
    football_player_market_values: Array.from({length:7},(_,index)=>({player_id:id(index+1),market_value_eur:2500000,verified_season:"2026-27",status:"verified",confidence:"verified",source:"editorial"})),
    touchline_card_editorial_overrides: [],
    touchline_live_presentation_active_snapshots: { scope_key: scope, snapshot_id: id(99) },
    touchline_live_presentation_snapshots: { id: id(99), scope_key: scope, content_digest: "a".repeat(32), payload: shared, created_at: NOW },
    touchline_card_ranking_snapshots: { snapshot_id: P, league_key: scope, season_id: id(50), round_id: "round-1",
      source: "sportmonks-audited", status: "published", scoring_version: "player_scoring_v4", coverage_status: "complete",
      actual_player_count: 6, expected_player_count: 6, published_at: NOW, price_table_version: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
      fixture_ids: [F], expected_fixture_ids: [F], total_score_points: 0,
      ranking_payload: { ...ranking, players: ranking.players.map(player => ({ ...player, userId: "private" })),
        cardGoals: { source: "published-card-goals-v1", snapshotId: P,
          rows: [{ playerId: id(1), goals: 2 }, { playerId: id(7), goals: 3 }] } } },
    touchline_player_ranking_leadership_decisions: null,
    touchline_coach_ranking_snapshots: { snapshot_id: C, league_key: scope, season_id: id(50), scoring_version: "coach_scoring_v2",
      fixture_ids: [F], generated_at: NOW, ranking_payload: [{ rank: 1, coachProviderId: "307", coachName: "Untrusted",
        clubName: "Arsenal", touchlinePoints: 3, wins: 1, draws: 0, losses: 0, awayWins: 0, contractId: "private",
        home: { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 }, away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 } }] },
  };
}

function harness(options: { mutate?: (rows: ReturnType<typeof data>) => void; errorTable?: string; absent?: boolean; noAdmin?: boolean } = {}) {
  const rows = data(); options.mutate?.(rows);
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const admin = { from(table: string) {
    assert.ok(Object.hasOwn(rows, table), `forbidden unpinned/provider table ${table}`);
    const filters: Array<[string, unknown]> = [];
    let columns: string[] = [], exact=false, from=0, to=Infinity;
    const query = { select(value: string, options?:{count?:string}) { assert.equal(value.includes("*"), false);columns=value.split(",");exact=options?.count==="exact";return query; },
      in(key:string, values:unknown[]) { filters.push([key,values]);return query; },
      limit(value:number) {to=value-1;return query;},range(start:number,end:number){from=start;to=end;return query;},order(){return query;},abortSignal(){return query;},
      then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown) {
        return Promise.resolve().then(()=>{
          reads.push({table,filters});
          const all=(rows as Record<string,unknown>)[table];assert.ok(Array.isArray(all),`Expected SELECT rows ${table}`);
          const matched=(all as Record<string,unknown>[]).filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value));
          return {data:matched.slice(from,to+1).map(row=>Object.fromEntries(columns.map(key=>[key,row[key]]))),error:options.errorTable===table?{message:"PRIVATE FAILURE"}:null,count:exact?matched.length:null};
        }).then(resolve,reject);
      },
      eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      async maybeSingle() {
        reads.push({ table, filters });
        const row = (rows as Record<string, unknown>)[table] as Record<string, unknown> | null;
        if (options.absent && table === "touchline_live_presentation_active_snapshots") return { data: null, error: null };
        return { data: row, error: options.errorTable === table ? { message: "PRIVATE FAILURE" } : null };
      } };
    return query;
  } };
  // Emulate request-local memoization only; this does not test React itself.
  const requestCache = (fn: () => Promise<unknown>) => {
    let result: Promise<unknown> | undefined;
    return () => result ??= fn();
  };
  const globals = { createAdminClient: () => options.noAdmin ? null : admin, cache: requestCache,
    TOUCHLINE_ENGLAND_LEAGUE_KEY, TOUCHLINE_PRESEASON_RANKING_STATE, parseTouchlineActiveRankingState,
    parsePersistedTouchlinePlayerLeadership, legacyCoachCatalogue, parseCoachCatalogue, catalogueCoachForId, loadCoachCatalogue: async () => readyCatalogue() };
  const player = runInNewContext(`${code("lib/touchlineArena/card-ranking-snapshot-server.ts")}\nreadTouchlinePlayerRankingSnapshot;`, globals);
  const coach = runInNewContext(`${code("lib/touchlineArena/coach-ranking-snapshot-server.ts")}\nreadTouchlineCoachRankingSnapshot;`, globals);
  const parseLiveScoreSnapshot = runInNewContext(`${code("lib/football-data/live-score-snapshot-contract.ts")}\nparseLiveScoreSnapshot;`, {
    isOfficialSportmonksFixtureId: (value: unknown) => typeof value === "string" && /^[1-9]\d{0,19}$/.test(value),
  });
  const server = runInNewContext(`${code("lib/touchlineArena/sports-publication-server.ts")}\n({ read: readTouchlineSportsPublication, request: loadRequestTouchlineSportsPublication });`, {
    ...globals, ...currentReaders, ...createCachedRankingReader(), readPublishedTouchlineLivePresentationInput, readTouchlinePlayerRankingSnapshot: player,
    readTouchlineCoachRankingSnapshot: coach, parseLiveScoreSnapshot, toPublicTouchlineFixtures, parseTouchlineSportsPublication,
  }) as { read: typeof import("../lib/touchlineArena/sports-publication-server.ts").readTouchlineSportsPublication;
    request: typeof import("../lib/touchlineArena/sports-publication-server.ts").loadRequestTouchlineSportsPublication };
  const publicGlobals = { ...globals, loadRequestTouchlineSportsPublication: server.request,
    EMPTY_COACH_RANKING: { phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null, fixtureIds: [], generatedAt: null, rows: [] } };
  const publicPlayer = runInNewContext(`${code("lib/touchlineArena/card-ranking-server.ts")}\nloadTouchLineActiveRanking;`, publicGlobals);
  const publicCoach = runInNewContext(`${code("lib/touchlineArena/coach-ranking-server.ts")}\nloadTouchLineCoachRanking;`, publicGlobals);
  const snapshotReads=()=>reads.filter(row=>["touchline_live_presentation_active_snapshots","touchline_live_presentation_snapshots","touchline_card_ranking_snapshots","touchline_player_ranking_leadership_decisions","touchline_coach_ranking_snapshots"].includes(row.table));
  return { rows, reads, snapshotReads, publicPlayer, publicCoach, read: () => server.read(admin as never), player: () => player(admin, P), coach: () => coach(admin, C) };
}

test("one published pointer pins all five reads and exposes no raw/private fields", async () => {
  const h = harness(); const result = await h.read();
  assert.ok(result);
  assert.equal(h.snapshotReads().length, 5);
  assert.equal(result.publication.snapshotId, id(99));
  assert.equal(result.playerRanking?.snapshotId, P);
  assert.equal(result.coachRanking?.snapshotId, C);
  assert.equal(result.coachRanking?.rows[0].coachName, "Mikel Arteta");
  assert.equal(result.live.fixtures[0].homeScore, 1);
  assert.doesNotMatch(JSON.stringify(result), /private|userId|contractId|Untrusted|"raw"/);
  assert.doesNotMatch(JSON.stringify(result.live), /"source":\{/,
    "Live fixtures and teams must not expose provider source objects");
  const publicCatalogues = [result.coachRanking?.catalogue, result.currentCoachRanking?.catalogue];
  for (const catalogue of publicCatalogues) {
    assert.ok(catalogue && catalogue.phase === "ready");
    assert.equal(catalogue.current.length, 20);
    assert.equal(catalogue.history.length, 20);
    for (const entry of [...catalogue.current, ...catalogue.history]) {
      assert.deepEqual(entry.coach.source, {
        provider: "sportmonks", providerId: entry.coach.providerId, lastSyncedAt: entry.fetchedAt,
      }, "Coach source contains exactly the public provenance tuple");
    }
  }
  const poisonedCatalogue = structuredClone(readyCatalogue());
  for (const entry of [...poisonedCatalogue.current, ...poisonedCatalogue.history]) {
    assert.ok(entry.coach.source);
    Object.assign(entry.coach.source, { raw: "private:coach-raw", private: "private:coach-source", userId: "private:coach-user" });
  }
  assert.match(JSON.stringify(poisonedCatalogue), /private:coach-raw/);
  const sanitizedCatalogue = parseCoachCatalogueTransport(poisonedCatalogue);
  assert.ok(sanitizedCatalogue);
  assert.deepEqual(sanitizedCatalogue, readyCatalogue(), "The public parser reconstructs rather than forwarding provider metadata");
  assert.doesNotMatch(JSON.stringify(sanitizedCatalogue), /private|userId|contractId|"raw"/);
  for (const read of h.reads.filter(read => read.table.includes("ranking"))) {
    assert.ok(read.filters.some(([key, value]) => key === "league_key" && value === scope));
    assert.ok(read.filters.some(([key, value]) => key === "snapshot_id" && value === (read.table.includes("coach") ? C : P)));
  }
});

test("confirmed absent publication reads no snapshots and differs from read failure", async () => {
  const h = harness({ absent: true }); assert.equal(await h.read(), null); assert.equal(h.reads.length, 1);
  await assert.rejects(harness({ errorTable: "touchline_live_presentation_active_snapshots" }).read());
});

test("null ranking pointers do not fall back to newer active rankings", async () => {
  const h = harness({ mutate(rows) {
    Object.assign(rows.touchline_live_presentation_snapshots.payload, {
      playerRankingSnapshotId: null, playerRankingFixtureIds: [], coachRankingSnapshotId: null, coachRankingFixtureIds: [],
    });
  } });
  const result = await h.read(); assert.ok(result);
  assert.equal(result.playerRanking, null); assert.equal(result.coachRanking, null); assert.equal(h.snapshotReads().length, 2);
});

for (const table of ["touchline_card_ranking_snapshots", "touchline_player_ranking_leadership_decisions", "touchline_coach_ranking_snapshots"]) {
  test(`a failed ${table} rejects the whole publication`, async () => {
    await assert.rejects(harness({ errorTable: table }).read());
  });
}

for (const [name, mutate] of Object.entries({
  "wrong player ID": (rows: ReturnType<typeof data>) => { rows.touchline_card_ranking_snapshots.snapshot_id = "other"; },
  "wrong coach ID": (rows: ReturnType<typeof data>) => { rows.touchline_coach_ranking_snapshots.snapshot_id = "other"; },
  "different seasons": (rows: ReturnType<typeof data>) => { rows.touchline_coach_ranking_snapshots.season_id = id(51); },
  "different fixture coverage": (rows: ReturnType<typeof data>) => { rows.touchline_coach_ranking_snapshots.fixture_ids = ["19722191"]; },
  "duplicate fixtures": (rows: ReturnType<typeof data>) => { rows.touchline_coach_ranking_snapshots.fixture_ids = [F, F]; },
  "blank fixture": (rows: ReturnType<typeof data>) => { rows.touchline_coach_ranking_snapshots.fixture_ids = [""]; },
  "invalid player payload": (rows: ReturnType<typeof data>) => { rows.touchline_card_ranking_snapshots.ranking_payload.players = []; },
  "invalid card goals": (rows: ReturnType<typeof data>) => { rows.touchline_card_ranking_snapshots.ranking_payload.cardGoals.rows[0].goals = -1; },
  "corrupt score": (rows: ReturnType<typeof data>) => { rows.touchline_live_presentation_snapshots.payload.liveScorePayload.fixtures[0].homeScore = -1; },
})) {
  test(`${name} cannot publish a partial/mixed envelope`, async () => { await assert.rejects(harness({ mutate }).read()); });
}

test("unrated published players keep goals; sports selectors never supply price or contracts", async () => {
  const publication = await harness().read(); assert.ok(publication);
  const player = touchlinePublishedPlayerFacts(publication, id(7));
  assert.deepEqual(player, { playerId: id(7), seasonId: id(50), snapshotId: P, totalRating: null, positionRank: null, goals: 3 });
  assert.equal(touchlinePublishedPlayerFacts(publication, id(8)), null);
  assert.equal("priceTc" in player!, false);
});

test("corrected snapshots replace facts downwards without adding duplicate goals or points", async () => {
  const previous = await harness().read(); assert.ok(previous);
  const corrected = await harness({ mutate(rows) {
    rows.touchline_card_ranking_snapshots.ranking_payload.cardGoals.rows[0].goals = 1;
    rows.touchline_live_presentation_snapshots.payload.liveScorePayload.fixtures[0].homeScore = 0;
  } }).read(); assert.ok(corrected);
  assert.equal(touchlinePublishedPlayerFacts(previous, id(1))?.goals, 2);
  assert.equal(touchlinePublishedPlayerFacts(corrected, id(1))?.goals, 1);
  assert.equal(corrected.live.fixtures[0].homeScore, 0);
  assert.deepEqual(parseTouchlineSportsPublication(corrected), parseTouchlineSportsPublication(corrected));
});

test("public route redacts failure and marks every outcome no-store", async () => {
  for (const failure of [false, true]) {
    const get = runInNewContext(`${code("app/api/touchline-arena/sports-publication/route.ts")}\nGET;`, {
      NextResponse: Response, loadTouchlineSportsPublication: async () => { if (failure) throw new Error("PRIVATE"); return null; },
    });
    const response = await get();
    assert.equal(response.status, failure ? 503 : 200);
    assert.doesNotMatch(await response.text(), /PRIVATE/);
    for (const header of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) assert.equal(response.headers.get(header), "no-store");
  }
});


test("SSR player, coach and client publication pin the same envelope instead of newer active pointers", async () => {
  const h = harness();
  const [player, coach] = await Promise.all([h.publicPlayer(), h.publicCoach()]);
  assert.equal(player.snapshotId, P); assert.equal(coach.snapshotId, C);
  assert.equal(h.snapshotReads().length, 5, "both SSR consumers share one request-local envelope");
  const client = await h.read();
  assert.deepEqual(JSON.parse(JSON.stringify(player)), JSON.parse(JSON.stringify(client!.currentPlayerRanking!.state)));
  assert.deepEqual(JSON.parse(JSON.stringify(coach)), JSON.parse(JSON.stringify(client!.currentCoachRanking)));
  assert.ok(h.reads.every(row => !row.table.match(/(?:card|coach)_ranking_active_snapshots/)));
});

test("publication advancing during SSR cannot mix the coach with the already loaded player", async () => {
  const h = harness();
  const player = await h.publicPlayer();
  h.rows.touchline_live_presentation_snapshots.payload.coachRankingSnapshotId = "coach:newer";
  h.rows.touchline_coach_ranking_snapshots.snapshot_id = "coach:newer";
  const coach = await h.publicCoach();
  assert.equal(player.snapshotId, P); assert.equal(coach.snapshotId, C);
  assert.equal(h.snapshotReads().length, 5);
});

test("a later request can observe a legitimate rollback and never selects by newest timestamp", async () => {
  const current = harness({ mutate(rows) {
    rows.touchline_live_presentation_snapshots.id = id(100);
    rows.touchline_live_presentation_active_snapshots.snapshot_id = id(100);
    rows.touchline_live_presentation_snapshots.payload.playerRankingSnapshotId = "player:newer";
    rows.touchline_card_ranking_snapshots.snapshot_id = "player:newer";
    rows.touchline_card_ranking_snapshots.ranking_payload.snapshotId = "player:newer";
    rows.touchline_card_ranking_snapshots.ranking_payload.cardGoals.snapshotId = "player:newer";
  } });
  assert.equal((await current.publicPlayer()).snapshotId, "player:newer");
  const rollback = harness();
  assert.equal((await rollback.publicPlayer()).snapshotId, P);
  assert.equal((await rollback.publicCoach()).snapshotId, C);
});

for (const [label, options] of [
  ["absent envelope", { absent: true }],
  ["missing server client", { noAdmin: true }],
  ["unreadable envelope", { errorTable: "touchline_live_presentation_snapshots" }],
  ["stale player ID", { mutate(rows: ReturnType<typeof data>) { rows.touchline_card_ranking_snapshots.snapshot_id = "newer-mutable"; } }],
  ["invalid coach alongside valid player", { mutate(rows: ReturnType<typeof data>) { rows.touchline_coach_ranking_snapshots.ranking_payload[0].touchlinePoints = 999; } }],
  ["mixed seasons", { mutate(rows: ReturnType<typeof data>) { rows.touchline_coach_ranking_snapshots.season_id = id(51); } }],
] as const) test(`both SSR loaders reject ${label} without a preseason/zero fallback`, async () => {
  const h = harness(options);
  await assert.rejects(h.publicPlayer());
  await assert.rejects(h.publicCoach());
  assert.ok(h.reads.every(row => !row.table.match(/(?:card|coach)_ranking_active_snapshots/)));
});


test("canonical eligibility failure withdraws current ranking without changing the audited publication", async () => {
  const h=harness({errorTable:"football_players"}); const result=await h.read();assert.ok(result);
  assert.equal(result.playerRanking!.players.length,6);assert.equal(result.currentPlayerRanking!.phase,"unavailable");
  await assert.rejects(h.publicPlayer(),/CURRENT_PLAYER_RANKING_UNAVAILABLE/);
});


test("derived coach rows cannot masquerade as the immutable audited coach publication", async () => {
  const result=await harness().read();assert.ok(result?.currentCoachRanking);
  assert.equal(parseTouchlineSportsPublication({...result,coachRanking:result.currentCoachRanking}),null);
});
