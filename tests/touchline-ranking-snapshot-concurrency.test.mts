import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve!: (x: unknown) => void, reject!: (x: unknown) => void; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function harness(missing = false, constructionError?: Error) {
  const snapshot = deferred(), leadership = deferred(), reads: string[] = [], filters: unknown[] = [];
  const preseason = { phase: "preseason" };
  const source = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineArena/card-ranking-server.ts", import.meta.url), "utf8")).replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const admin = { from(table: string) {
    if (table.includes("leadership") && constructionError) throw constructionError;
    const q = { select() { return q; }, eq(key: string, value: unknown) { filters.push([table,key,value]); return q; }, maybeSingle() {
      return { then(fulfilled: (value: unknown) => unknown, rejected: (error: unknown) => unknown) {
        reads.push(table);
        const pending = table.includes("active_snapshots") ? Promise.resolve({ data: missing ? null : { snapshot_id: "fixed" }, error: null }) : table.includes("leadership") ? leadership.promise : snapshot.promise;
        return pending.then(fulfilled, rejected);
      } };
    } }; return q;
  } };
  const load = runInNewContext(`${source}\nloadTouchLineActiveRanking;`, { cache: (fn: unknown) => fn, createAdminClient: () => admin, TOUCHLINE_ENGLAND_LEAGUE_KEY: "england", TOUCHLINE_PRESEASON_RANKING_STATE: preseason, parseTouchlineActiveRankingState: (x: unknown) => x, parsePersistedTouchlinePlayerLeadership: (x: unknown) => x });
  const valid = { data: { snapshot_id: "fixed", league_key: "england", season_id: "season", status: "published", source: "sportmonks-audited", scoring_version: "player_scoring_v4", coverage_status: "complete", actual_player_count: 1, expected_player_count: 1, ranking_payload: { players: [{ playerId: "player", totalRating: 0 }] } }, error: null };
  return { load, snapshot, leadership, reads, filters, preseason, valid };
}
test("snapshot and leadership start together but state waits for validated leadership", async () => {
  const h = harness(); let done = false; const result = h.load().then((x: unknown) => { done=true; return x; });
  await turn(); assert.equal(h.reads.length, 3);
  h.snapshot.resolve(h.valid); await turn(); assert.equal(done,false);
  h.leadership.resolve({ data: { ranking_id: "r" }, error: null });
  const state = await result; assert.equal(state.snapshotId, "fixed"); assert.equal(state.players[0].totalRating,0);
  assert.equal(h.filters.filter((x: unknown) => JSON.stringify(x).includes('"snapshot_id","fixed"')).length,2);
});
test("invalid snapshot ignores an observed leadership rejection and missing pointer reads nothing else", async () => {
  const h = harness(), result = h.load(); await turn();
  h.leadership.reject(new Error("private")); await turn();
  h.snapshot.resolve({ data: null, error: null }); assert.equal(await result,h.preseason);
  const absent = harness(true); assert.equal(await absent.load(),absent.preseason); assert.equal(absent.reads.length,1);
});
test("valid snapshot preserves transport rejection identity and response-error fallback", async () => {
  const h = harness(), error = new Error("transport"), result = h.load(); const rejected = assert.rejects(result, (x: unknown) => x === error);
  await turn(); h.leadership.reject(error); h.snapshot.resolve(h.valid); await rejected;
  const soft = harness(), value = soft.load(); await turn(); soft.leadership.resolve({ data: null, error: { message: "db" } }); soft.snapshot.resolve(soft.valid);
  assert.equal((await value).leadershipDecision,null);
});

test("snapshot rejection remains authoritative while later leadership rejection is observed", async () => {
  const h = harness(), error = new Error("snapshot transport");
  const result = h.load(); const rejected = assert.rejects(result, (value: unknown) => value === error);
  await turn(); assert.equal(h.reads.length, 3);
  h.snapshot.reject(error); await rejected;
  h.leadership.reject(new Error("late leadership")); await turn();
});

test("synchronous leadership construction failure is observed and consumed only for valid snapshot", async () => {
  for (const valid of [false, true]) {
    const error = new Error("construction");
    const h = harness(false, error), result = h.load();
    const observed = valid ? assert.rejects(result, (value: unknown) => value === error) : result;
    await turn(); assert.equal(h.reads.length, 2);
    h.snapshot.resolve(valid ? h.valid : { data: null, error: null });
    if (valid) await observed;
    else assert.equal(await observed, h.preseason);
  }
});
