import assert from "node:assert/strict";
import test from "node:test";

import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";

test("server reads retain their resolved authoritative value inside the deadline", async () => {
  assert.equal(await resolveServerReadWithin(Promise.resolve("authoritative"), "fallback", 50), "authoritative");
});

test("server reads fail closed when their deadline elapses", async () => {
  const stalled = new Promise<"authoritative">(() => {});
  assert.equal(await resolveServerReadWithin(stalled, "fallback", 1), "fallback");
});
