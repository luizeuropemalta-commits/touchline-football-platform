import assert from "node:assert/strict";
import test from "node:test";
import { inspectClubOwnership } from "../lib/touchlineFantasy/club-ownership-readiness.ts";

const players = (count: number, prefix = "player") => Array.from({ length: count }, (_, n) => `${prefix}-${n}`);
test("QA conflict: 35 real contracts and 11 different selected players never offer 24 purchases", () => {
  assert.deepEqual(inspectClubOwnership({ activeContractPlayerIds: players(35), selectedPlayerIds: players(11, "selected") }), {
    status: "OWNERSHIP_CONFLICT", ownedCount: 35, selectedCount: 11, overlapCount: 0, vacantCount: null,
  });
});
test("vacancies derive from all contracts, not selected XI or prose counts", () => {
  for (const count of [11, 16, 24, 35]) {
    const result = inspectClubOwnership({ activeContractPlayerIds: players(count), selectedPlayerIds: players(11) });
    assert.equal(result.status, "READY");
    assert.equal(result.vacantCount, 35 - count);
  }
});
test("empty genuine collection differs from missing data and from an uncontracted XI", () => {
  assert.equal(inspectClubOwnership({ activeContractPlayerIds: [], selectedPlayerIds: [] }).vacantCount, 35);
  assert.equal(inspectClubOwnership({ activeContractPlayerIds: [], selectedPlayerIds: players(11) }).status, "LINEUP_IMPORT_REQUIRED");
  for (const input of [
    { activeContractPlayerIds: null, selectedPlayerIds: players(11) },
    { activeContractPlayerIds: players(35), selectedPlayerIds: null },
  ]) assert.equal(inspectClubOwnership(input).status, "UNAVAILABLE");
});
test("duplicate or missing identities and overflow fail closed without repairing data", () => {
  for (const ids of [[null], [""], ["  "], ["a", "a"], players(36)]) {
    const result = inspectClubOwnership({ activeContractPlayerIds: ids, selectedPlayerIds: [] });
    assert.equal(result.status, "INVALID_OWNERSHIP");
    assert.equal(result.vacantCount, null);
  }
  assert.equal(inspectClubOwnership({ activeContractPlayerIds: players(35), selectedPlayerIds: players(12) }).status, "INVALID_OWNERSHIP");
});
test("one foreign selected player blocks acquisition instead of merging ownership silently", () => {
  const owned = players(20), selected = [...players(10), "foreign"];
  assert.equal(inspectClubOwnership({ activeContractPlayerIds: owned, selectedPlayerIds: selected }).status, "OWNERSHIP_CONFLICT");
  assert.equal(owned.length, 20);
  assert.equal(selected.length, 11);
});
