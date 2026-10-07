import assert from "node:assert/strict";
import test from "node:test";

// Real policy import: no missing-import skip or fallback implementation.
const load = () => import("../lib/touchlineArena/club-owner-avatar-output-policy.ts");

test("output policy is admission-only: new operation 128 KiB; committed replay keeps historical ceiling", async () => {
  const { getClubOwnerAvatarOutputPolicy } = await load();
  assert.deepEqual(getClubOwnerAvatarOutputPolicy("started"), { admissionVersion: 2, maxBytes: 131_072 });
  assert.deepEqual(getClubOwnerAvatarOutputPolicy("committed"), { admissionVersion: 1, maxBytes: 4_000_000 });
});

test("unknown or non-admitted operation phases cannot obtain an output policy", async () => {
  const { getClubOwnerAvatarOutputPolicy } = await load();
  for (const phase of ["pending", "busy", "fenced", "conflict", "operation_conflict", "unknown", "", "constructor", "__proto__", null, undefined, {}, true]) {
    assert.equal(getClubOwnerAvatarOutputPolicy(phase), null);
  }
});
