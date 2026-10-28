import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith("@/") ? new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const { readTouchlineCoachContracts } = await import("../lib/touchlineArena/coach-contracts-server.ts");
const startsAt = new Date(Date.now() - 60_000).toISOString();
const verified = { id: "fixture-902", provider_fixture_id: "902", context: "away", status: "Live", starts_at: startsAt,
  contractId: "contract-21", coachProviderId: "101", sourceRevisionId: 3, checksum: "a".repeat(32), provisionalPoints: -1 };

function mock(options: { current?: Record<string, unknown> | null; ended?: boolean; noReceipt?: boolean; error?: boolean } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const contract = { id: "contract-21", coach_provider_id: "101", club_id: "old-club", status: options.ended ? "ended" : "active",
    scoring_version: "coach_scoring_v2", started_at: "2026-08-01T00:00:00Z", ended_at: options.ended ? startsAt : null, end_reason: null };
  const admin = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return { data: options.current === undefined ? verified : options.current, error: options.error ? { code: "57014" } : null };
    },
    from(table: string) {
      const q = { select() { return q; }, eq(key: string, value: string) { assert.equal(key, "user_id"); assert.equal(value, "owner-1"); return q; },
        in() { return q; }, order() { return q; },
        or() { throw Error("Unverified purchased-club fixture fallback is forbidden"); },
        then(resolve: (value: unknown) => unknown) {
          const data = table === "touchline_coach_contracts" ? [contract]
            : table === "football_clubs" ? [{ id: "old-club", provider_team_id: "10" }]
            : table === "touchline_coach_fixture_points" ? options.noReceipt ? [] : [{ contract_id: contract.id, fixture_id: "fixture-902", fixture_context: "away",
              outcome: "loss", home_score: 2, away_score: 1, touchline_points: -1, settlement_status: "provisional", scoring_version: "coach_scoring_v2" }]
            : table === "football_fixtures" ? [{ id: "fixture-902", provider_fixture_id: "902", starts_at: startsAt, status: "Live", home_club_id: "old-club", away_club_id: "new-club" }]
            : assert.fail(`Unexpected table ${table}`);
          return Promise.resolve(resolve({ data, error: null }));
        } };
      return q;
    },
  };
  return { admin: admin as never, calls, contract };
}

test("reader keeps purchased club and derives moved coach's away context from one verified RPC", async () => {
  const { admin, calls, contract } = mock();
  const before = structuredClone(contract);
  const [result] = await readTouchlineCoachContracts(admin, "owner-1");
  assert.equal(result.clubProviderId, "10");
  assert.equal(result.currentFixture?.context, "away");
  assert.equal(result.currentFixture?.provisionalPoints, -1);
  assert.equal(result.fixtureHistory[0].context, "away");
  assert.equal(result.totalTouchlinePoints, -1);
  assert.deepEqual(contract, before);
  assert.deepEqual(calls, [{ name: "touchline_read_verified_coach_current_fixture", args: { p_contract_id: "contract-21" } }]);
});

test("next fixture without receipt is pending and preserves the active contract", async () => {
  const { admin, calls } = mock({ noReceipt: true, current: null });
  const [result] = await readTouchlineCoachContracts(admin, "owner-1");
  assert.equal(result.currentFixture, null);
  assert.equal(result.status, "active");
  assert.equal(result.id, "contract-21");
  assert.deepEqual(result.fixtureHistory, []);
  assert.equal(calls.length, 1);
});

test("stale or missing evidence hides current context but preserves settlement history", async () => {
  const { admin } = mock({ current: null });
  const [result] = await readTouchlineCoachContracts(admin, "owner-1");
  assert.equal(result.currentFixture, null);
  assert.equal(result.fixtureHistory.length, 1);
  assert.equal(result.totalTouchlinePoints, -1);
});

for (const patch of [{ coachProviderId: "999" }, { contractId: "another-owner" }, { context: "unknown" }, { checksum: "" },
  { status: "Full Time" }, { sourceRevisionId: null }, { starts_at: "invalid" }]) {
  test(`reader rejects invalid verified response ${JSON.stringify(patch)}`, async () => {
    const { admin } = mock({ current: { ...verified, ...patch } });
    assert.equal((await readTouchlineCoachContracts(admin, "owner-1"))[0].currentFixture, null);
  });
}

test("unavailable verifier fails explicitly rather than falling back to purchased club", async () => {
  const { admin } = mock({ error: true });
  await assert.rejects(readTouchlineCoachContracts(admin, "owner-1"), /TL_COACH_CURRENT_FIXTURE_READ_FAILED:57014/);
});

test("ended contract keeps history and never invokes current fixture verification", async () => {
  const { admin, calls } = mock({ ended: true });
  const [result] = await readTouchlineCoachContracts(admin, "owner-1");
  assert.equal(result.status, "ended");
  assert.equal(result.fixtureHistory.length, 1);
  assert.equal(result.currentFixture, null);
  assert.deepEqual(calls, []);
});

for (const status of ["FT", "FT_PEN", "FT-Penalties", "FT after extra time", "AET", "PEN", "Finished", "Final", "Full Time", "Full-Time",
  "After Extra Time", "After Penalties", "Penalties Finished", "Cancelled", "Canceled", "Abandoned", "Awarded", "Walkover", "Postponed", "Not Started", "unknown"]) {
  test(`reader never presents terminal or unverified status as current: ${status}`, async () => {
    for (const value of [status, `  ${status.toUpperCase()}  `]) {
      const { admin } = mock({ current: { ...verified, status: value } });
      assert.equal((await readTouchlineCoachContracts(admin, "owner-1"))[0].currentFixture, null);
    }
  });
}
for (const status of ["Live", "In-Play", "In Progress", "1st Half", "2nd Half", "Half Time", "Extra Time", "Penalties", "Penalty Shootout"]) {
  test(`reader preserves canonically live verified status: ${status}`, async () => {
    const { admin } = mock({ current: { ...verified, status } });
    assert.equal((await readTouchlineCoachContracts(admin, "owner-1"))[0].currentFixture?.status, status);
  });
}
