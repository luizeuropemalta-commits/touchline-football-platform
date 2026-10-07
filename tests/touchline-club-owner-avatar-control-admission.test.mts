import assert from "node:assert/strict";
import test from "node:test";
import { getClubOwnerAvatarResourceAdmission } from "../lib/touchlineArena/club-owner-avatar-resource-admission.ts";

test("avatar control has one slot, no queue, and remains occupied until original work settles", async () => {
  const { createClubOwnerAvatarControlAdmission } = await import("../lib/touchlineArena/club-owner-avatar-control-admission.ts");
  const pool = createClubOwnerAvatarControlAdmission(), scope = pool.tryAcquire(); assert.ok(scope);
  let settle!: () => void;
  const original = pool.track(scope, () => new Promise<void>(resolve => { settle = resolve; }));
  assert.equal(pool.tryAcquire(), null); pool.close(scope); pool.close(scope);
  assert.equal(pool.tryAcquire(), null, "closing a timed-out request must not release the original promise");
  await assert.rejects(pool.track(scope, async () => {}));
  settle(); await original;
  const next = pool.tryAcquire(); assert.ok(next); pool.close(next);
});

test("avatar control is shared across factories but independent from occupied native capacity", async () => {
  const { getClubOwnerAvatarControlAdmission } = await import("../lib/touchlineArena/club-owner-avatar-control-admission.ts");
  const native = getClubOwnerAvatarResourceAdmission(), nativeScope = native.tryAcquire(); assert.ok(nativeScope);
  const pool = getClubOwnerAvatarControlAdmission(), scope = pool.tryAcquire(); assert.ok(scope);
  try { assert.equal(getClubOwnerAvatarControlAdmission().tryAcquire(), null); }
  finally { pool.close(scope); native.close(nativeScope); }
});

test("avatar control releases rejected original work and rejects foreign scopes", async () => {
  const { createClubOwnerAvatarControlAdmission } = await import("../lib/touchlineArena/club-owner-avatar-control-admission.ts");
  const a = createClubOwnerAvatarControlAdmission(), b = createClubOwnerAvatarControlAdmission(), scope = a.tryAcquire(); assert.ok(scope);
  await assert.rejects(b.track(scope, async () => {}));
  const original = a.track(scope, async () => { throw Error("synthetic"); }); a.close(scope);
  await assert.rejects(original); const next = a.tryAcquire(); assert.ok(next); a.close(next);
});
