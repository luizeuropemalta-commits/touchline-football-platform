import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSportmonksQuotaCooldown } from "../lib/football-data/sportmonks-quota-cooldown.ts";
import type { SportmonksQuotaObservation, SportmonksQuotaTrace } from "../lib/football-data/sportmonks-quota-observation.ts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const observedAt = "2026-10-01T12:00:00.000Z";
const resetAt = "2026-10-01T12:01:00.000Z";
const later = "2026-10-01T12:03:00.000Z";
function observation(operation: "stages" | "topscorers", patch: Partial<SportmonksQuotaObservation> = {}): SportmonksQuotaObservation {
  return { requestId: id(operation === "stages" ? 1 : 2), attempt: 1, operation,
    observedAt, status: 200, requestedEntity: operation === "stages" ? "Stages" : "Topscorers",
    remaining: 7, resetAt, cooldownUntil: null, ...patch };
}
function trace(...observations: SportmonksQuotaObservation[]): SportmonksQuotaTrace {
  return { coverage: "complete", observations, reusedRequestIds: [] };
}
function fixture() { return { stages: trace(observation("stages")), topscorers: trace(observation("topscorers")) }; }

test("both complete nonempty traces give known metadata, not an invented cooldown", () => {
  assert.deepEqual(summarizeSportmonksQuotaCooldown(fixture()), { known: true, cooldownUntil: null });
  for (const input of [null, undefined, {}, [], { stages: null, topscorers: null },
    { ...fixture(), stages: trace() }, { ...fixture(), topscorers: null }]) {
    assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: null });
  }
});

test("429 then 200 preserves the largest original cooldown across both operations and pages", () => {
  const input = fixture();
  input.stages = trace(observation("stages", { remaining: 0, cooldownUntil: resetAt }));
  input.topscorers = trace(
    observation("topscorers", { status: 429, remaining: 0, cooldownUntil: later }),
    observation("topscorers", { attempt: 2 }),
    observation("topscorers", { requestId: id(3), cooldownUntil: "2026-10-01T12:02:00.000Z" }),
  );
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: true, cooldownUntil: later });
});

test("unknown coverage retains independently valid cooldowns", () => {
  const input = fixture();
  input.topscorers = { ...trace(observation("topscorers", { status: 429, remaining: null, resetAt: null, cooldownUntil: later })), coverage: "unknown" };
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: later });
  assert.deepEqual(summarizeSportmonksQuotaCooldown({ stages: null, topscorers: input.topscorers }), { known: false, cooldownUntil: later });
});

test("cache and in-flight duplicate IDs do not renew times or change a summary", () => {
  const input = fixture();
  const value = observation("topscorers", { cooldownUntil: later });
  input.topscorers = { ...trace(value, { ...value }), reusedRequestIds: [value.requestId, value.requestId] };
  const before = structuredClone(input);
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: true, cooldownUntil: later });
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: true, cooldownUntil: later });
  assert.deepEqual(input, before, "summary must not mutate or re-anchor input");
});

test("conflicting duplicate keeps maximum cooldown but makes metadata unknown", () => {
  const input = fixture();
  input.topscorers = trace(observation("topscorers", { cooldownUntil: resetAt }),
    observation("topscorers", { remaining: 6, cooldownUntil: later }));
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: later });
  input.topscorers = trace(observation("topscorers", { requestId: id(1), cooldownUntil: later }));
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: later });
});

test("malformed metadata cannot claim known but cannot erase a valid absolute cooldown", () => {
  const invalid: Record<string, unknown>[] = [
    { requestId: "PRIVATE/token" }, { attempt: 0 }, { attempt: 4 }, { attempt: 1.5 },
    { operation: "other" }, { status: 0 }, { status: Infinity },
    { requestedEntity: null }, { requestedEntity: "Top scorers" }, { requestedEntity: "x".repeat(65) },
    { remaining: null }, { remaining: -1 }, { remaining: "7" }, { remaining: Infinity },
    { remaining: Number.MAX_SAFE_INTEGER + 1 }, { observedAt: null },
    { observedAt: "2026-02-30T12:00:00.000Z" }, { observedAt: "2026-10-01" },
    { resetAt: null }, { resetAt: "2026-10-01T11:59:59.000Z" },
  ];
  for (const patch of invalid) {
    const input = { ...fixture(), topscorers: trace({ ...observation("topscorers", { cooldownUntil: later }), ...patch } as SportmonksQuotaObservation) };
    const result = summarizeSportmonksQuotaCooldown(input);
    assert.deepEqual(result, { known: false, cooldownUntil: later }, JSON.stringify(patch));
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|requestedEntity|requestId/);
  }
});

test("invalid cooldown is not returned; throttled or exhausted metadata requires its deadline", () => {
  for (const patch of [{ cooldownUntil: "2026-02-30T12:00:00.000Z" }, { cooldownUntil: undefined },
    { cooldownUntil: 42 }, { status: 429 }, { remaining: 0 }]) {
    const input = { ...fixture(), topscorers: trace({ ...observation("topscorers"), ...patch } as SportmonksQuotaObservation) };
    assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: null });
  }
  const input = fixture();
  input.topscorers = trace(observation("topscorers", { remaining: 0, cooldownUntil: resetAt }));
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: true, cooldownUntil: resetAt });
});

test("producer limits and contiguous attempts are required; malformed traces remain bounded", () => {
  const input = fixture();
  input.topscorers = trace(...Array.from({ length: 10 }, (_, page) =>
    [1, 2, 3].map(attempt => observation("topscorers", { requestId: id(10 + page), attempt }))).flat());
  assert.equal(summarizeSportmonksQuotaCooldown(input).known, true);
  input.topscorers = trace(...input.topscorers.observations, observation("topscorers", { requestId: id(40), cooldownUntil: later }));
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: later });
  input.topscorers = trace(observation("topscorers", { attempt: 2, cooldownUntil: later }));
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: later });
  input.topscorers = trace(...Array.from({ length: 61 }, () => observation("topscorers", { cooldownUntil: later })));
  assert.deepEqual(summarizeSportmonksQuotaCooldown(input), { known: false, cooldownUntil: later });
  input.stages = trace(observation("stages"), observation("stages", { requestId: id(50) }));
  input.topscorers = fixture().topscorers;
  assert.equal(summarizeSportmonksQuotaCooldown(input).known, false);
});

test("malformed trace/reuse shapes fail closed without leaking input", () => {
  for (const patch of [{ coverage: "other" }, { reusedRequestIds: null }, { reusedRequestIds: [id(99)] },
    { reusedRequestIds: ["PRIVATE"] }, { observations: null }, { observations: [null] }]) {
    const input = { ...fixture(), topscorers: { ...fixture().topscorers, ...patch } };
    const result = summarizeSportmonksQuotaCooldown(input);
    assert.equal(result.known, false);
    assert.deepEqual(Object.keys(result).sort(), ["cooldownUntil", "known"]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
});
