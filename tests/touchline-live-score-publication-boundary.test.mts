import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { readPublishedTouchlineLivePresentationInput } from "../lib/touchlineArena/live-presentation-read-model.ts";
import { touchlineLiveFreshness, TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS } from "../lib/touchlineArena/live-presentation-state.ts";

const NOW = Date.parse("2026-10-11T15:30:00.000Z");
const ID = "20000000-0000-4000-8000-000000000001";
const score = (homeScore: number) => ({
  fixtures: [{ id: "sportmonks:19722190", provider: "sportmonks", providerId: "19722190", homeScore,
    source: { provider: "sportmonks", providerId: "19722190" } }],
  fetchedAt: new Date(NOW).toISOString(), storedAt: NOW,
});

function boundary(options: { absent?: boolean; pointerError?: boolean; snapshotError?: boolean; invalidPointer?: boolean; invalidSnapshot?: boolean; invalidPayload?: boolean;
  timestamps?: Partial<Pick<ReturnType<typeof score>, "storedAt" | "fetchedAt">> } = {}) {
  const reads: string[] = [];
  const payload = { version: 1, scopeKey: "touchline-england", windowStart: new Date(NOW - 4 * 60 * 60 * 1_000).toISOString(),
    playerRankingSnapshotId: null, playerRankingFixtureIds: [], coachRankingSnapshotId: null, coachRankingFixtureIds: [],
    fixtures: [{ fixtureId: "19722190", startsAt: new Date(NOW).toISOString(), status: "1H" }],
    liveScoreSnapshotDigest: "b".repeat(32), liveScorePayload: options.invalidPayload ? {} : { ...score(1), ...options.timestamps } };
  const admin = {
    from(table: string) {
      reads.push(table);
      const query = { select() { return query; }, eq() { return query; }, async maybeSingle() {
        if (table === "touchline_live_presentation_active_snapshots") return {
          data: options.absent ? null : { snapshot_id: options.invalidPointer ? "invalid" : ID },
          error: options.pointerError ? { code: "XX000" } : null,
        };
        if (table === "touchline_live_presentation_snapshots") return {
          data: options.invalidSnapshot ? null : { id: ID, scope_key: "touchline-england", content_digest: "a".repeat(32),
            payload, created_at: new Date(NOW).toISOString() },
          error: options.snapshotError ? { code: "XX000" } : null,
        };
        assert.equal(table, "football_live_snapshots");
        return { data: { payload: { ...score(2), ...options.timestamps } }, error: null };
      } };
      return query;
    },
  };
  const source = stripTypeScriptTypes(readFileSync(new URL("../lib/football-data/live-score-persistence.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const contract = stripTypeScriptTypes(readFileSync(new URL("../lib/football-data/live-score-snapshot-contract.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const read = runInNewContext(`${contract}\n${source}\nreadPersistedLiveScoreSnapshot;`, {
    createAdminClient: () => admin, readPublishedTouchlineLivePresentationInput,
    touchlineLiveFreshness, TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS,
    isOfficialSportmonksFixtureId: (value: string) => /^[1-9]\d*$/.test(value),
  }) as (options: { now: number; maxAgeMs?: number }) => Promise<ReturnType<typeof score> | null>;
  return { read: (options: { now?: number; maxAgeMs?: number } = {}) => read({ now: NOW, ...options }), reads };
}

test("the Live reader serves the published payload, not the newer mutable source", async () => {
  const run = boundary();
  assert.equal((await run.read())?.fixtures[0].homeScore, 1);
  assert.equal(run.reads.includes("football_live_snapshots"), false);
});

test("only an absent first publication permits legacy snapshot compatibility", async () => {
  const run = boundary({ absent: true });
  assert.equal((await run.read())?.fixtures[0].homeScore, 2);
  assert.equal(run.reads.includes("football_live_snapshots"), true);
});

for (const failure of ["pointerError", "snapshotError", "invalidPointer", "invalidSnapshot", "invalidPayload"] as const) {
  test(`a ${failure} cannot expose unpublished Live data`, async () => {
    const run = boundary({ [failure]: true });
    assert.equal(await run.read(), null);
    assert.equal(run.reads.includes("football_live_snapshots"), false,
      "read errors and corrupted publications must never fall through to mutable input");
  });
}

for (const absent of [false, true]) for (const field of ["storedAt", "fetchedAt"] as const) {
  test(`${absent ? "legacy" : "published"} ${field} rejects future evidence even with unlimited age`, async () => {
    for (const offset of [1, 86_400_000]) {
      const timestamps = { [field]: field === "storedAt" ? NOW + offset : new Date(NOW + offset).toISOString() };
      const copy = structuredClone(timestamps);
      const run = boundary({ absent, timestamps });
      assert.equal(await run.read({ maxAgeMs: Number.MAX_SAFE_INTEGER }), null);
      assert.equal(run.reads.includes("football_live_snapshots"), absent, "Future publication cannot fall through to mutable input");
      assert.deepEqual(timestamps, copy, "Never repair source clocks in a read");
    }
  });
  test(`${absent ? "legacy" : "published"} ${field} observes the injected clock and inclusive five-minute limit`, async () => {
    for (const age of [0, 299_999, 300_000, 300_001]) {
      const timestamps = { [field]: field === "storedAt" ? NOW - age : new Date(NOW - age).toISOString() };
      const result = await boundary({ absent, timestamps }).read();
      assert.equal(result !== null, age <= 300_000, `age=${age}`);
    }
    assert.ok(await boundary({ absent }).read({ now: NOW }));
    assert.equal(await boundary({ absent }).read({ now: NOW - 1 }), null);
  });
}
