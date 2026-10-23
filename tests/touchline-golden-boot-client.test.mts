import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { buildTouchlineRankingSnapshot } from "../lib/touchlineArena/card-ranking.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { parseTouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { parseTouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";
import type { TouchlinePresentationRead } from "../lib/touchlineArena/live-presentation-client-store.ts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function state(goals: number[], snapshotId = "snapshot-1") {
  const ranking = buildTouchlineRankingSnapshot({ snapshotId, roundId: "r1", generatedAt: "2026-10-02T12:00:00Z",
    source: "sportmonks-audited", status: "published",
    players: ["GK","CB","RB","CM","RW","ST"].map((position, i) => ({
      playerId: id(i+1), providerPlayerId: i+1, name: `Player ${i}`, clubName: "Club", position,
      totalRating: 100-i, minutesPlayed: 90, appearances: 1,
    })),
  });
  return { phase: "ranked", leagueKey: "touchline-england", snapshotId, roundId: "r1",
    publishedAt: "2026-10-02T12:00:00Z", priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    scoringVersion: "player_scoring_v4", coverageStatus: "complete", seasonId: id(50),
    fixtureIds: ["f1"], expectedFixtureIds: ["f1"], totalScorePoints: 0, players: ranking.players,
    cardGoals: { source: "published-card-goals-v1", snapshotId,
      rows: goals.map((goals, i) => ({ playerId: id(i+1), goals })) },
  };
}
function harness() {
  let sharedListener: ((read: TouchlinePresentationRead) => void) | null = null;
  let connections = 0; let epoch = 0; let revalidations = 0;
  const shared = {
    getRequestEpoch: () => epoch,
    subscribe(listener: (read: TouchlinePresentationRead) => void, includeSports: boolean) {
      assert.equal(includeSports, true); assert.equal(sharedListener, null); connections++;
      sharedListener = listener; return () => { sharedListener = null; };
    },
    revalidate() { revalidations++; },
  };
  let subscribe: (fn: () => void) => () => void = () => () => {};
  const modules = new Map<string, unknown>();
  function load(name: string): unknown {
    name = name.replace(/\.ts$/, "");
    if (modules.has(name)) return modules.get(name);
    const output = ts.transpileModule(readFileSync(new URL(`../lib/touchlineArena/${name}.ts`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(output, { exports, require: (key: string) => key === "react" ? {
      useMemo: (fn: () => unknown) => fn(),
      useSyncExternalStore: (sub: typeof subscribe, get: () => unknown) => { subscribe = sub; return get(); },
    } : key === "./live-presentation-client-store" ? { touchlineLivePresentationStore: shared }
      : load(key.replace(/^\.\//, "")),
    window: { setTimeout: () => assert.fail("ranking cannot create its own timeout"),
      setInterval: () => assert.fail("ranking cannot create its own poller") },
    fetch: () => assert.fail("ranking cannot fetch independently"),
    });
    modules.set(name, exports); return exports;
  }
  const boot = load("golden-boot-client") as typeof import("../lib/touchlineArena/golden-boot-client.ts");
  const crown = load("card-ranking-client") as typeof import("../lib/touchlineArena/card-ranking-client.ts");
  return { get connections() { return connections; }, get active() { return sharedListener !== null; }, get revalidations() { return revalidations; },
    read: (enabled = true) => [...boot.useTouchlineGoldenBootPlayers(enabled)],
    readPinned: (ranking: ReturnType<typeof parseTouchlineActiveRankingState>) => [...boot.useTouchlineGoldenBootPlayers(true, ranking)],
    connectPinned(ranking: ReturnType<typeof parseTouchlineActiveRankingState>) { boot.useTouchlineGoldenBootPlayers(true, ranking); return subscribe(() => {}); },
    connect() { boot.useTouchlineGoldenBootPlayers(true); return subscribe(() => {}); },
    connectCrown() { crown.useTouchlineActiveRanking(true); return subscribe(() => {}); },
    publish(ranking: unknown) {
      const parsed = parseTouchlineActiveRankingState(ranking);
      const digest = (++epoch).toString(16).padStart(32, "0");
      const publication = parseTouchlineSportsPublication({ version: 1, scopeKey: "touchline-england", publication: {
        snapshotId: id(99), contentDigest: digest, publishedAt: "2026-10-23T08:00:00Z",
        playerRankingSnapshotId: parsed?.snapshotId ?? null, coachRankingSnapshotId: null, liveScoreSnapshotDigest: "a".repeat(32),
      }, playerRanking: ranking, coachRanking: null, live: { fetchedAt: "2026-10-23T08:00:00Z", fixtures: [] } });
      if (!publication) return;
      sharedListener?.({ generation: epoch, requestEpoch: epoch, receivedAt: 0, sportsPublication: publication,
        state: { version: 1, available: true, playerRankingSnapshotId: publication.publication.playerRankingSnapshotId,
          coachRankingSnapshotId: null, livePresentationSnapshotId: digest, mode: "live", pollAfterMs: 10_000, resumeAt: null } });
    },
  };
}
test("Boot and Crown share one publication subscription and create no ranking requests or pollers", () => {
  const h = harness();
  assert.deepEqual(h.read(false), []);
  assert.equal(h.connections, 0);
  const close = h.connect(), closeCrown = h.connectCrown();
  assert.equal(h.connections, 1);
  h.publish(state([1,9,2,0,0,0]));
  assert.deepEqual(h.read(), [id(2)]);
  assert.deepEqual(h.read(false), []);
  close(); assert.equal(h.active, true); closeCrown(); assert.equal(h.active, false);
});

test("pinned card Boot uses its Crown publication and makes no independent request, including explicit null", () => {
  const h = harness();
  const pinned = parseTouchlineActiveRankingState(state([9, 1], "pinned")); assert.ok(pinned);
  const closePinned = h.connectPinned(pinned);
  assert.deepEqual(h.readPinned(pinned), [id(1)]);
  assert.equal(h.connections, 0);
  const closeOther = h.connectCrown();
  h.publish(state([1, 10], "other-current"));
  assert.deepEqual(h.read(), [id(2)], "positive control: unrelated live ranking has advanced");
  assert.deepEqual(h.readPinned(pinned), [id(1)]);
  assert.deepEqual(h.readPinned(null), [], "pinned absence cannot inherit another publication's award");
  closePinned(); closeOther();
});
test("next published goals automatically replace leadership, including ties and unrated candidates", () => {
  const h = harness(), close = h.connect();
  h.publish(state([5,4]));
  assert.deepEqual(h.read(), [id(1)]);
  // Seventh card does not belong to the six-player rating ranking.
  h.publish(state([5,6,0,0,0,0,6], "snapshot-2"));
  assert.deepEqual(h.read(), [id(2),id(7)]);
  h.publish(state([0,0], "snapshot-3"));
  assert.deepEqual(h.read(), []);
  close();
});
test("legacy ranking and wrong-snapshot goals render no Boot", () => {
  const h = harness(), close = h.connect();
  const legacy = state([5]); delete (legacy as {cardGoals?: unknown}).cardGoals;
  h.publish(legacy);
  assert.deepEqual(h.read(), []);
  const wrong = state([5], "snapshot-2"); wrong.cardGoals.snapshotId = "snapshot-1";
  h.publish(wrong);
  assert.deepEqual(h.read(), []); close();
});
