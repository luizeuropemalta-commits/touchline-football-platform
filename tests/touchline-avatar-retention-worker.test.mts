import assert from "node:assert/strict";
import test from "node:test";
const load = () => import("../lib/touchlineArena/club-owner-avatar-retention-worker.ts");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const digest = "a".repeat(64);
const candidate = { candidateId: id(1), actorId: id(2), operationId: id(3), digest, objectKey: `${id(2)}/${id(3)}/${digest}.webp` };
const lease = () => { const now = Date.now(); return { checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString() }; };

test("worker executes list -> fresh durable begin -> exact DELETE -> recurring receipt", async () => {
  const { runAvatarRetentionBatch } = await load(); const calls: string[] = [];
  const result = await runAvatarRetentionBatch({ supabaseOrigin: "https://xgxbwqxjssxxuihuwmgy.supabase.co", serviceRoleKey: "test-secret", assertEnvironment() {},
    rpc: async (name, args) => {
      calls.push(name);
      if (name.includes("list_due")) { assert.equal(args.p_limit, 5); return { data: { version: 1, candidates: [candidate] }, error: null }; }
      if (name.includes("begin")) return { data: { version: 1, allowed: true, ...candidate, attemptId: args.p_attempt,
        ...lease() }, error: null };
      assert.equal(args.p_outcome, "accepted"); return { data: { version: 1, recorded: true, reconciliationRequired: true }, error: null };
    }, fetchImpl: async (_url, init) => { calls.push("DELETE"); assert.deepEqual(JSON.parse(String(init?.body)), { prefixes: [candidate.objectKey] }); return Response.json([]); },
  }, new AbortController().signal);
  assert.deepEqual(result, { status: "processed", inspected: 1, accepted: 1, denied: 0, unknown: 0 });
  assert.deepEqual(calls.map(x => x === "DELETE" ? x : x.includes("list_due") ? "list" : x.includes("begin") ? "begin" : "record"), ["list", "begin", "DELETE", "record"]);
});

test("expired/foreign grants and current-image denial never reach Storage", async () => {
  const { runAvatarRetentionBatch } = await load();
  for (const mode of ["expired", "foreign", "denied"]) {
    let deletes = 0;
    const result = await runAvatarRetentionBatch({ supabaseOrigin: "https://xgxbwqxjssxxuihuwmgy.supabase.co", serviceRoleKey: "test-secret", assertEnvironment() {},
      rpc: async (name, args) => {
        if (name.includes("list_due")) return { data: { version: 1, candidates: [candidate] }, error: null };
        if (name.includes("begin")) return { data: { version: 1, allowed: mode !== "denied", ...candidate,
          candidateId: mode === "foreign" ? id(99) : candidate.candidateId, attemptId: args.p_attempt,
          ...lease(), ...(mode === "expired" ? { expiresAt: new Date(Date.now() - 1).toISOString() } : {}) }, error: null };
        return { data: { version: 1, recorded: true, reconciliationRequired: true }, error: null };
      }, fetchImpl: async () => { deletes++; throw Error(); },
    }, new AbortController().signal);
    assert.equal(deletes, 0); assert.equal(result.accepted, 0);
  }
});

test("uncertain DELETE is recorded unknown; failed receipt stops the batch", async () => {
  const { runAvatarRetentionBatch } = await load(); let begins = 0, deletes = 0, records = 0;
  const result = await runAvatarRetentionBatch({ supabaseOrigin: "https://xgxbwqxjssxxuihuwmgy.supabase.co", serviceRoleKey: "test-secret", assertEnvironment() {},
    rpc: async (name, args) => {
      if (name.includes("list_due")) return { data: { version: 1, candidates: [candidate, { ...candidate, candidateId: id(4), operationId: id(5), objectKey: `${id(2)}/${id(5)}/${digest}.webp` }] }, error: null };
      if (name.includes("begin")) { begins++; return { data: { version: 1, allowed: true, ...candidate, attemptId: args.p_attempt,
        ...lease() }, error: null }; }
      records++; assert.equal(args.p_outcome, "unknown"); return { data: null, error: { message: "private-secret" } };
    }, fetchImpl: async () => { deletes++; throw Error("lost response"); },
  }, new AbortController().signal);
  assert.equal(result.status, "incomplete"); assert.equal(result.unknown, 1); assert.equal(begins, 1); assert.equal(deletes, 1); assert.equal(records, 1);
});

test("lost begin response reports incomplete rather than a successful denial", async () => {
  const { runAvatarRetentionBatch } = await load(); let deletes = 0;
  const result = await runAvatarRetentionBatch({ supabaseOrigin: "https://xgxbwqxjssxxuihuwmgy.supabase.co", serviceRoleKey: "test-secret", assertEnvironment() {},
    rpc: async name => name.includes("list_due") ? { data: { version: 1, candidates: [candidate] }, error: null } : { data: null, error: { message: "lost response" } },
    fetchImpl: async () => { deletes++; throw Error(); },
  }, new AbortController().signal);
  assert.equal(result.status, "incomplete"); assert.equal(deletes, 0);
});
