import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { readPublishedTouchlineLivePresentationInput } from "../lib/touchlineArena/live-presentation-read-model.ts";

const NOW = Date.parse("2026-10-11T15:30:00.000Z");
const ID = "20000000-0000-4000-8000-000000000001";
const score = (homeScore: number) => ({
  fixtures: [{ id: "sportmonks:19722190", provider: "sportmonks", providerId: "19722190", homeScore,
    source: { provider: "sportmonks", providerId: "19722190" } }],
  fetchedAt: new Date(NOW).toISOString(), storedAt: NOW,
});

function boundary(options: { absent?: boolean; pointerError?: boolean; snapshotError?: boolean; invalidPointer?: boolean; invalidSnapshot?: boolean; invalidPayload?: boolean } = {}) {
  const reads: string[] = [];
  const payload = { version: 1, scopeKey: "touchline-england", windowStart: new Date(NOW - 4 * 60 * 60 * 1_000).toISOString(),
    playerRankingSnapshotId: null, playerRankingFixtureIds: [], coachRankingSnapshotId: null, coachRankingFixtureIds: [],
    fixtures: [{ fixtureId: "19722190", startsAt: new Date(NOW).toISOString(), status: "1H" }],
    liveScoreSnapshotDigest: "b".repeat(32), liveScorePayload: options.invalidPayload ? {} : score(1) };
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
        return { data: { payload: score(2) }, error: null };
      } };
      return query;
    },
  };
  const source = stripTypeScriptTypes(readFileSync(new URL("../lib/football-data/live-score-persistence.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const read = runInNewContext(`${source}\nreadPersistedLiveScoreSnapshot;`, {
    createAdminClient: () => admin, readPublishedTouchlineLivePresentationInput,
    isOfficialSportmonksFixtureId: (value: string) => /^[1-9]\d*$/.test(value),
  }) as (options: { now: number }) => Promise<ReturnType<typeof score> | null>;
  return { read: () => read({ now: NOW }), reads };
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
