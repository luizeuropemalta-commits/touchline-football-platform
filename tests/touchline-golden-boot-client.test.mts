import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { buildTouchlineRankingSnapshot } from "../lib/touchlineArena/card-ranking.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";

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
async function flush() { for (let i=0;i<20;i++) await Promise.resolve(); }
function harness() {
  const requests: Array<{ url: string; resolve: (response: Response) => void }> = [];
  const intervals = new Map<number, () => void>();
  let timer = 0;
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
    } : load(key.replace(/^\.\//, "")),
    window: { setTimeout: () => ++timer, clearTimeout: () => {},
      setInterval: (fn: () => void) => { intervals.set(++timer, fn); return timer; },
      clearInterval: (id: number) => intervals.delete(id) },
    AbortController,
    fetch: (url: string) => new Promise<Response>(resolve => requests.push({ url, resolve })),
    });
    modules.set(name, exports); return exports;
  }
  const boot = load("golden-boot-client") as typeof import("../lib/touchlineArena/golden-boot-client.ts");
  const crown = load("card-ranking-client") as typeof import("../lib/touchlineArena/card-ranking-client.ts");
  return { requests, intervals,
    read: (enabled = true) => [...boot.useTouchlineGoldenBootPlayers(enabled)],
    connect() { boot.useTouchlineGoldenBootPlayers(true); return subscribe(() => {}); },
    connectCrown() { crown.useTouchlineActiveRanking(true); return subscribe(() => {}); },
    poll() { for (const fn of intervals.values()) fn(); },
  };
}
test("Boot and Crown share exactly one ranking request and polling loop", async () => {
  const h = harness();
  assert.deepEqual(h.read(false), []);
  assert.equal(h.requests.length, 0);
  const close = h.connect(), closeCrown = h.connectCrown();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0]!.url, "/api/touchline-arena/card-ranking/active");
  assert.equal(h.intervals.size, 1);
  h.requests[0]!.resolve(Response.json(state([1,9,2,0,0,0]))); await flush();
  assert.deepEqual(h.read(), [id(2)]);
  assert.deepEqual(h.read(false), []);
  close(); closeCrown(); assert.equal(h.intervals.size, 0);
});
test("next published goals automatically replace leadership, including ties and unrated candidates", async () => {
  const h = harness(), close = h.connect();
  h.requests[0]!.resolve(Response.json(state([5,4]))); await flush();
  assert.deepEqual(h.read(), [id(1)]);
  h.poll();
  // Seventh card does not belong to the six-player rating ranking.
  h.requests[1]!.resolve(Response.json(state([5,6,0,0,0,0,6], "snapshot-2"))); await flush();
  assert.deepEqual(h.read(), [id(2),id(7)]);
  h.poll();
  h.requests[2]!.resolve(Response.json(state([0,0], "snapshot-3"))); await flush();
  assert.deepEqual(h.read(), []);
  close();
});
test("legacy ranking and wrong-snapshot goals render no Boot", async () => {
  const h = harness(), close = h.connect();
  const legacy = state([5]); delete (legacy as {cardGoals?: unknown}).cardGoals;
  h.requests[0]!.resolve(Response.json(legacy)); await flush();
  assert.deepEqual(h.read(), []);
  h.poll();
  const wrong = state([5], "snapshot-2"); wrong.cardGoals.snapshotId = "snapshot-1";
  h.requests[1]!.resolve(Response.json(wrong)); await flush();
  assert.deepEqual(h.read(), []); close();
});
