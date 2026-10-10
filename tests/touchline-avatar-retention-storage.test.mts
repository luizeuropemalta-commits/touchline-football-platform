import assert from "node:assert/strict";
import test from "node:test";

const actorId = "123e4567-e89b-42d3-a456-426614174000";
const operationId = "123e4567-e89b-42d3-a456-426614174001";
const digest = "a".repeat(64);
const candidate = { actorId, operationId, digest, objectKey: `${actorId}/${operationId}/${digest}.webp` };
const origin = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const load = () => import("../lib/touchlineArena/club-owner-avatar-retention-storage.ts");

test("retention transport reauthorizes an exact key immediately before one DELETE", async () => {
  const { createAvatarRetentionStorage } = await load();
  const order: string[] = [];
  const transport = createAvatarRetentionStorage({ supabaseOrigin: origin, serviceRoleKey: "test-secret",
    assertEnvironment() { order.push("guard"); },
    async authorize(value) { assert.deepEqual(value, candidate); order.push("authorize"); return { allowed: true, ...candidate }; },
    fetchImpl: async (url, init) => {
      order.push("delete");
      assert.equal(String(url), `${origin}/storage/v1/object/touchline-club-owner-avatars`);
      assert.equal(init?.method, "DELETE"); assert.equal(init?.redirect, "error");
      assert.deepEqual(JSON.parse(String(init?.body)), { prefixes: [candidate.objectKey] });
      return Response.json([{ name: candidate.objectKey }]);
    },
  });
  assert.equal(await transport.removeCandidate(candidate, new AbortController().signal), "accepted");
  assert.ok(order.indexOf("authorize") < order.indexOf("delete"));
  assert.equal(order.filter(x => x === "delete").length, 1);
});

test("denial, foreign authorization and invalid candidate never issue DELETE", async () => {
  const { createAvatarRetentionStorage } = await load();
  for (const authorization of [{ allowed: false }, { allowed: true, ...candidate, objectKey: "other" }, { allowed: true, ...candidate, digest: "b".repeat(64) }, null]) {
    let calls = 0;
    const transport = createAvatarRetentionStorage({ supabaseOrigin: origin, serviceRoleKey: "test-secret", assertEnvironment() {},
      authorize: async () => authorization, fetchImpl: async () => { calls++; throw Error("unexpected"); } });
    assert.equal(await transport.removeCandidate(candidate, new AbortController().signal), "denied");
    assert.equal(calls, 0);
  }
  let calls = 0;
  const transport = createAvatarRetentionStorage({ supabaseOrigin: origin, serviceRoleKey: "test-secret", assertEnvironment() {},
    authorize: async () => { calls++; return { allowed: true, ...candidate }; }, fetchImpl: async () => { calls++; throw Error(); } });
  for (const objectKey of ["", "../other", `${candidate.objectKey}/other`]) {
    assert.equal(await transport.removeCandidate({ ...candidate, objectKey }, new AbortController().signal), "denied");
  }
  assert.equal(calls, 0);
});

test("post-dispatch errors remain unknown and are not retried or declared cleaned", async () => {
  const { createAvatarRetentionStorage } = await load();
  for (const reply of [() => Promise.reject(Error("private-secret")), async () => new Response("", { status: 500 }), async () => new Response("", { status: 404 })]) {
    let calls = 0;
    const transport = createAvatarRetentionStorage({ supabaseOrigin: origin, serviceRoleKey: "test-secret", assertEnvironment() {},
      authorize: async () => ({ allowed: true, ...candidate }), fetchImpl: async () => { calls++; return reply(); } });
    assert.equal(await transport.removeCandidate(candidate, new AbortController().signal), "unknown");
    assert.equal(calls, 1);
  }
});

test("environment drift or abort after authorization prevents dispatch", async () => {
  const { createAvatarRetentionStorage } = await load();
  for (const mode of ["abort", "drift"] as const) {
    let drift = false, calls = 0;
    const controller = new AbortController();
    const transport = createAvatarRetentionStorage({ supabaseOrigin: origin, serviceRoleKey: "test-secret",
      assertEnvironment() { if (drift) throw Error("private-secret"); },
      authorize: async () => { if (mode === "abort") controller.abort(); else drift = true; return { allowed: true, ...candidate }; },
      fetchImpl: async () => { calls++; throw Error(); } });
    assert.equal(await transport.removeCandidate(candidate, controller.signal), "denied"); assert.equal(calls, 0);
  }
  assert.throws(() => createAvatarRetentionStorage({ supabaseOrigin: "https://production.supabase.co", serviceRoleKey: "test-secret",
    assertEnvironment() {}, authorize: async () => null, fetchImpl: fetch }), /QA_RETENTION_CONFIGURATION/);
});
