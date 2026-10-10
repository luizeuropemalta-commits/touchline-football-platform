import assert from "node:assert/strict";
import test from "node:test";
const load = () => import("../lib/touchlineArena/club-owner-avatar-retention-rpc.ts");
const origin = "https://xgxbwqxjssxxuihuwmgy.supabase.co", project = "xgxbwqxjssxxuihuwmgy";
test("RPC transport permits only named retention methods with bounded JSON", async () => {
  const { createAvatarRetentionRpc } = await load(); let calls = 0;
  const rpc = createAvatarRetentionRpc({ supabaseOrigin: origin, serviceRoleKey: "test-secret", assertEnvironment() {}, fetchImpl: async (url, init) => {
    calls++; assert.equal(String(url), `${origin}/rest/v1/rpc/touchline_list_due_qa_avatar_retention_candidates`);
    assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_project_ref: project, p_limit: 5 });
    return Response.json({ version: 1, candidates: [] });
  } });
  assert.deepEqual(await rpc("touchline_list_due_qa_avatar_retention_candidates", { p_project_ref: project, p_limit: 5 }, new AbortController().signal), { data: { version: 1, candidates: [] }, error: null });
  for (const [name, args] of [["touchline_publish_club_owner_avatar", { p_project_ref: project }], ["touchline_list_due_qa_avatar_retention_candidates", { p_project_ref: "other", p_limit: 5 }], ["touchline_list_due_qa_avatar_retention_candidates", { p_project_ref: project, p_limit: 5, other: true }]] as const) {
    assert.ok((await rpc(name, args, new AbortController().signal)).error);
  }
  assert.equal(calls, 1);
});
test("RPC errors, compressed or excessive responses never become success or retry", async () => {
  const { createAvatarRetentionRpc } = await load();
  for (const response of [new Response("private-error", { status: 500 }), Response.json({}, { headers: { "content-encoding": "br" } }), Response.json({}, { headers: { "content-length": "65537" } }), new Response("invalid", { headers: { "content-type": "application/json" } })]) {
    let calls = 0;
    const rpc = createAvatarRetentionRpc({ supabaseOrigin: origin, serviceRoleKey: "test-secret", assertEnvironment() {}, fetchImpl: async () => { calls++; return response; } });
    const result = await rpc("touchline_list_due_qa_avatar_retention_candidates", { p_project_ref: project, p_limit: 5 }, new AbortController().signal);
    assert.equal(result.data, null); assert.ok(result.error); assert.doesNotMatch(JSON.stringify(result), /private-error|test-secret/); assert.equal(calls, 1);
  }
});
