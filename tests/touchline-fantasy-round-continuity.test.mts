import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { recoverFantasyRound, isFantasyContinuityState } from "../lib/touchlineFantasy/round-continuity-client.ts";
import { getFantasyContinuityCopy } from "../lib/touchlineFantasy/round-continuity-i18n.ts";

const actor = "11111111-1111-4111-8111-111111111111", week = "22222222-2222-4222-8222-222222222222";
const draft = "33333333-3333-4333-8333-333333333333";
function saved() { return { ok: true, userId: actor, activeGameweek: { id: week, state: "MARKET_OPEN", locksAt: new Date(Date.now() + 60_000).toISOString() },
  gameweeks: [], userGameweek: { id: draft, state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "previous-coach" },
  selections: Array.from({ length: 11 }, (_, i) => ({ playerId: `player-${i}`, slotId: `slot-${i}` })),
  gameweekScore: 0, seasonScore: 120.27, matchHistory: [], gameweekRanking: [], seasonRanking: [], lineupAlerts: [] }; }
const code = ts.transpileModule(readFileSync(new URL("../app/api/touchline-fantasy/prepare/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function route(options: { authError?: boolean; user?: object | null; denied?: boolean; owner?: boolean; existing?: boolean;
  closed?: boolean; expired?: boolean; changedRound?: boolean; rpcError?: boolean; badReceipt?: boolean; readbackMissing?: boolean;
  unavailable?: boolean } = {}) {
  const calls: Array<{ name: string; args?: unknown }> = [];
  let prepared = options.existing ?? false;
  const customer = options.user === undefined ? { id: actor, email: "customer@example.test", email_confirmed_at: "2026-01-01", app_metadata: {} } : options.user;
  const snapshot = () => {
    const result = saved();
    if (options.changedRound) result.activeGameweek.id = draft;
    if (options.closed) result.activeGameweek.state = "LOCKED";
    if (options.expired) result.activeGameweek.locksAt = new Date(0).toISOString();
    return { ...result, entitlementActive: !options.denied, userGameweek: prepared && !options.readbackMissing ? result.userGameweek : null };
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status?: number; headers?: object } = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/lib/admin/owner": { isOwnerEmail: () => Boolean(options.owner) },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => !options.denied },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { calls.push({ name: "auth" }); return { data: { user: customer }, error: options.authError ? { message: "private" } : null }; } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name: string, args: unknown) => {
      calls.push({ name, args }); if (!options.rpcError) prepared = true;
      return { data: options.badReceipt ? "wrong" : draft, error: options.rpcError ? { message: "private database detail" } : null };
    } }) },
    "@/lib/touchlineArena/server-read-deadline": { resolveServerReadWithin: (promise: Promise<unknown>) => promise },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasyReadSnapshot: async (user: { id: string }) => {
      assert.equal(user.id, actor); calls.push({ name: "read" }); return options.unavailable ? null : snapshot();
    } },
  };
  const exports: { POST?: (request: Request) => Promise<{ body: ReturnType<typeof saved>; status: number; headers: Record<string, string> }> } = {};
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
    setTimeout, clearTimeout, Uint8Array, TextDecoder, Date });
  return { calls, post: (body: unknown = { expectedAccountId: actor, gameweekId: week }, origin = "https://qa.example.test", headers: Record<string, string> = {}) => {
    const request = new Request("https://qa.example.test/api/touchline-fantasy/prepare", { method: "POST",
      headers: { origin, "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    Object.defineProperty(request, "nextUrl", { value: new URL(request.url) });
    return exports.POST!(request);
  } };
}

test("continuity prepares only the authenticated customer's expected round and verifies the saved XI", async () => {
  const h = route(); const response = await h.post();
  assert.equal(response.status, 200); assert.equal(response.body.selections.length, 11);
  assert.equal(response.body.userGameweek.state, "DRAFT"); assert.equal(response.body.gameweekScore, 0);
  assert.equal(response.body.seasonScore, 120.27); assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{ name: "auth" }, { name: "read" },
    { name: "touchline_fantasy_prepare_user_gameweek", args: { p_user_id: actor, p_gameweek_id: week } }, { name: "read" }]);
  assert.ok(!("catalogue" in response.body), "do not return the full catalogue on preparation");
});
test("existing edited draft is returned without preparing or replacing it", async () => {
  const h = route({ existing: true }); const response = await h.post();
  assert.equal(response.status, 200); assert.equal(response.body.userGameweek.id, draft);
  assert.deepEqual(h.calls.map(x => x.name), ["auth", "read"]);
});
test("cross-origin commands never authenticate or read a team", async () => {
  for (const [origin, headers] of [["https://foreign.example.test", {}], ["", {}], ["https://qa.example.test", { "sec-fetch-site": "cross-site" }]] as const) {
    const h = route(); assert.equal((await h.post(undefined, origin, headers)).status, 403); assert.equal(h.calls.length, 0);
  }
});
for (const options of [{ user: null }, { authError: true }, { owner: true }, { denied: true }, { user: { id: actor, email: "customer@example.test" } }]) {
  test(`unverified/ineligible identity cannot prepare: ${JSON.stringify(options)}`, async () => {
    const h = route(options); assert.ok((await h.post()).status >= 400);
    assert.ok(!h.calls.some(call => call.name === "read" || call.name.includes("prepare")));
  });
}
test("wrong account, malformed or extended command never reads or writes a team", async () => {
  for (const body of [{ expectedAccountId: draft, gameweekId: week }, {}, { expectedAccountId: actor, gameweekId: week, plan: "vip" }, "{" , "x".repeat(513)]) {
    const h = route(); assert.ok((await h.post(body)).status >= 400);
    assert.deepEqual(h.calls.map(x => x.name), ["auth"]);
  }
});
for (const options of [{ closed: true }, { expired: true }, { changedRound: true }, { unavailable: true }]) {
  test(`stale/unavailable round never creates a draft: ${JSON.stringify(options)}`, async () => {
    const h = route(options); assert.ok((await h.post()).status >= 400);
    assert.ok(!h.calls.some(call => call.name.includes("prepare")));
  });
}
for (const options of [{ rpcError: true }, { badReceipt: true }, { readbackMissing: true }]) {
  test(`uncertain prepare cannot announce success: ${JSON.stringify(options)}`, async () => {
    const h = route(options); const response = await h.post(); assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(response).includes("private database detail"));
    assert.equal(h.calls.filter(call => call.name.includes("prepare")).length, 1);
  });
}

test("client accepts only the matching account and round, even after success HTTP", async () => {
  const valid = saved(); assert.equal(isFantasyContinuityState(valid, actor, week), true);
  for (const invalid of [{ ...valid, userId: draft }, { ...valid, activeGameweek: { id: draft } },
    { ...valid, userGameweek: null }, { ...valid, selections: null }, { ...valid, seasonScore: NaN }]) {
    assert.equal(isFantasyContinuityState(invalid, actor, week), false);
  }
});
test("a lost POST result is recovered by one read, never a second automatic POST", async () => {
  const calls: string[] = [];
  const value = await recoverFantasyRound({ accountId: actor, gameweekId: week, signal: new AbortController().signal,
    fetcher: (async (_url, init) => { calls.push(init?.method ?? "GET");
      if (init?.method === "POST") throw new Error("lost response");
      return Response.json(saved()); }) as typeof fetch });
  assert.equal(value.selections.length, 11); assert.deepEqual(calls, ["POST", "GET"]);
});
test("manual verification is read-only and an absent/foreign XI stays unconfirmed", async () => {
  for (const response of [{ ...saved(), userGameweek: null }, { ...saved(), userId: draft }]) {
    const methods: string[] = [];
    await assert.rejects(recoverFantasyRound({ accountId: actor, gameweekId: week, signal: new AbortController().signal, prepare: false,
      fetcher: (async (_url, init) => { methods.push(init?.method ?? "GET"); return Response.json(response); }) as typeof fetch }), /UNCONFIRMED/);
    assert.deepEqual(methods, ["GET"]);
  }
});
test("all eight continuity catalogues retain accessible loading and verification actions", () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const copy = getFantasyContinuityCopy(locale, true);
    assert.ok(copy.title && copy.busy && copy.unavailable && copy.verify);
  }
});
