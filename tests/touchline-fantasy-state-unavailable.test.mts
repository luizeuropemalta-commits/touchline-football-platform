import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../app/api/touchline-fantasy/state/route.ts", import.meta.url), "utf8");
const code = stripTypeScriptTypes(source.slice(source.indexOf("export async function GET")).replace("export async", "async") + "\nGET;");
function handler(user: object | null, load: () => Promise<unknown>) {
  return runInNewContext(code, {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
    loadTouchlineFantasySnapshot: load,
    NextResponse: { json: (body: unknown, options?: unknown) => ({ body, options }) },
  }) as () => Promise<{ body: { ok: boolean; error?: string }; options: { status?: number; headers?: Record<string, string> } }>;
}
test("failed or absent fantasy reads produce an uncached sanitized503", async () => {
  for (const load of [async () => null, async () => { throw new Error("private database information"); }]) {
    const response = await handler({ id: "customer" }, load)();
    assert.equal(response.options.status, 503);
    assert.equal(response.body.error, "FANTASY_UNAVAILABLE");
    assert.equal(response.options.headers?.["Cache-Control"], "private, no-store");
    assert.equal(JSON.stringify(response).includes("private database information"), false);
  }
});
test("unauthenticated request never reads team data", async () => {
  const response = await handler(null, async () => assert.fail("unexpected team read"))();
  assert.equal(response.options.status, 401);
  assert.equal(response.body.error, "AUTH_REQUIRED");
});
