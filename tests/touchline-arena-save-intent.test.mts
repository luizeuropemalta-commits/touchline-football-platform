import assert from "node:assert/strict";
import test from "node:test";
import { createArenaSaveIntent } from "../lib/touchlineArena/arena-save-intent.ts";

test("in-flight writes serialize; unknown completion blocks subsequent edits", () => {
  const gate = createArenaSaveIntent(); gate.scope("a");
  const first = gate.edit("a")!; assert.equal(gate.claim("a", first), true);
  const second = gate.edit("a")!;
  assert.equal(gate.claim("a", second), false, "second write must wait for acknowledgement");
  assert.equal(gate.settle("a", first, true), true);
  assert.equal(gate.claim("a", second), true);
  gate.settle("a", second, false);
  assert.equal(gate.edit("a"), null);
  gate.scope("b"); gate.scope("a");
  assert.equal(gate.edit("a"), null, "switching accounts cannot clear uncertain write");
});

test("mount and repeated hydration never create remote write authority", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  for (let i = 0; i < 5; i++) { gate.scope("a"); assert.equal(gate.ticket("a"), null); }
});
test("explicit edit authorizes one attempt only, including unknown outcome", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  const ticket = gate.edit("a")!;
  assert.equal(gate.claim("a", ticket), true);
  assert.equal(gate.claim("a", ticket), false);
  assert.equal(gate.ticket("a"), null);
});
test("principal change rejects stale timer and acknowledgement", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  const ticket = gate.edit("a")!; gate.scope("b");
  assert.equal(gate.edit("a"), null, "late async edit cannot restore the old principal");
  assert.equal(gate.claim("a", ticket), false);
  assert.equal(gate.current("a", ticket), false);
  assert.equal(gate.ticket("b"), null);
});
test("rapid edits invalidate old timers and preserve the newest intent", () => {
  const gate = createArenaSaveIntent();
  gate.scope("a");
  const first = gate.edit("a")!; const latest = gate.edit("a")!;
  assert.equal(gate.claim("a", first), false);
  assert.equal(gate.claim("a", latest), true);
  const next = gate.edit("a");
  assert.equal(gate.current("a", latest), false);
  assert.equal(gate.ticket("a"), null);
  gate.settle("a", latest, true);
  assert.equal(gate.ticket("a"), next);
});
