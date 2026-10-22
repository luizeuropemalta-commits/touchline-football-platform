import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as commandReader from "../lib/touchlineFantasy/club-request.ts";
import * as authority from "../lib/touchlineFantasy/club-command-authority.ts";
import * as release from "../lib/touchlineFantasy/club-release.ts";

const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const origin = "http://localhost:3319";
const url = `${origin}/api/touchline-fantasy/collection/release`;
const command = { action: "release", playerId: id(3), expectedRevision: 1, idempotencyKey: "release_route_1" };
const envelope = { ...command, expectedAccountId: id(1), expectedSeasonId: id(2) };
const saved = {
  state: { revision: 2, seasonId: id(2), plan: "vip", balanceEur: 1_185_500_000,
    coach: { id: "coach", tier: "sapphire-blue", valueEur: 10_000_000 }, players: [],
    receipts: [{ key: "purchase_original", playerId: id(3), area: "outside", slot: 0, valueEur: 45_000_000, revision: 1 }] },
  receipt: { idempotency_key: command.idempotencyKey, player_id: id(3), paid_credits: 45_000_000,
    fee_credits: 4_500_000, refund_credits: 40_500_000 }, replayed: false,
};
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/touchline-fantasy/collection/release/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Options = { enabled?: boolean; user?: string | null; authError?: boolean; adminAvailable?: boolean;
  season?: string | null; configError?: boolean; rpcError?: string; result?: unknown };

function harness(options: Options = {}) {
  const calls: { auth: number; admin: number; tables: string[]; filters: unknown[][]; rpc: { name: string; args: unknown }[] } = {
    auth: 0, admin: 0, tables: [], filters: [], rpc: [],
  };
  const admin = {
    from(name: string) {
      calls.tables.push(name);
      assert.equal(name, "touchline_fantasy_configs", "route must not update collection or wallet directly");
      const query = {
        select(columns: string) { assert.equal(columns, "season_id"); return query; },
        eq(column: string, value: unknown) { calls.filters.push([column, value]); return query; },
        async single() { return { data: { season_id: options.season === undefined ? id(2) : options.season }, error: options.configError ? { message: "unavailable" } : null }; },
      };
      return query;
    },
    async rpc(name: string, args: unknown) {
      calls.rpc.push({ name, args: JSON.parse(JSON.stringify(args)) });
      return { data: options.result === undefined ? structuredClone(saved) : options.result,
        error: options.rpcError ? { message: options.rpcError } : null };
    },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      calls.auth++; return { data: { user: options.user === null ? null : { id: options.user ?? id(1) } }, error: options.authError ? new Error("auth unavailable") : null };
    } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.admin++; return options.adminAvailable === false ? null : admin; } },
    "@/lib/touchlineFantasy/club-collection-server": { clubReleaseEnabled: () => options.enabled !== false },
    "@/lib/touchlineFantasy/club-acquisition": acquisition,
    "@/lib/touchlineFantasy/club-request": commandReader,
    "@/lib/touchlineFantasy/club-command-authority": authority,
    "@/lib/touchlineFantasy/club-release": release,
  };
  const exports: { POST?: (request: Request & { nextUrl: URL }) => Promise<Response> } = {};
  runInNewContext(compiled, { exports, Error, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  async function post(body: unknown = envelope, requestOrigin: string | null = origin, contentType = "application/json") {
    const headers = new Headers({ "content-type": contentType });
    if (requestOrigin !== null) headers.set("origin", requestOrigin);
    const response = await exports.POST!(Object.assign(new Request(url, { method: "POST", headers, body: JSON.stringify(body) }), { nextUrl: new URL(url) }));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return { status: response.status, body: await response.json() };
  }
  return { post, calls };
}

test("release rejects absent/cross origins and a disabled gate before auth or storage", async () => {
  for (const badOrigin of [null, "https://other.example", `${origin}.attacker.example`]) {
    const h = harness();
    assert.deepEqual(await h.post(envelope, badOrigin), { status: 403, body: { ok: false, error: "INVALID_ORIGIN" } });
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.admin, 0);
  }
  const h = harness({ enabled: false });
  assert.equal((await h.post()).status, 503);
  assert.equal(h.calls.auth, 0); assert.equal(h.calls.admin, 0);
});

test("release requires verified authentication and never accesses admin for rejected auth", async () => {
  for (const options of [{ user: null }, { authError: true }]) {
    const h = harness(options);
    assert.deepEqual(await h.post(), { status: 401, body: { ok: false, error: "AUTH_REQUIRED" } });
    assert.equal(h.calls.admin, 0); assert.equal(h.calls.rpc.length, 0);
  }
});

test("release rejects financial/owner extras and malformed commands before storage", async () => {
  const invalid = [null, [], { ...command }, ...["balanceEur", "refund", "refundCredits", "fee", "paidCredits", "ownerId", "p_user_id"].map(key => ({ ...envelope, [key]: 999 })),
    { ...envelope, expectedRevision: 1.5 }, { ...envelope, action: "move" }, { ...envelope, playerId: "wrong" },
    { ...envelope, idempotencyKey: "short" }, { ...envelope, expectedAccountId: "wrong" }];
  for (const body of invalid) {
    const h = harness();
    assert.deepEqual(await h.post(body), { status: 400, body: { ok: false, error: "INVALID_REQUEST" } });
    assert.equal(h.calls.admin, 0);
  }
  const h = harness();
  assert.equal((await h.post(envelope, origin, "text/plain")).status, 400);
  assert.equal(h.calls.admin, 0);
});

test("release binds account and season to verified session and active config", async () => {
  for (const body of [{ ...envelope, expectedAccountId: id(9) }, { ...envelope, expectedSeasonId: id(9) }]) {
    const h = harness();
    assert.deepEqual(await h.post(body), { status: 409, body: { ok: false, error: "CLUB_CONTEXT_CHANGED" } });
    assert.equal(h.calls.rpc.length, 0);
    assert.deepEqual(h.calls.filters, [["competition_key", "england"], ["status", "active"]]);
  }
});

test("release uses exactly one atomic RPC and returns authoritative snapshot/receipt, including replay", async () => {
  for (const replayed of [false, true]) {
    const result = { ...structuredClone(saved), replayed };
    const h = harness({ result });
    assert.deepEqual(await h.post(), { status: 200, body: { ok: true, ...result } });
    assert.deepEqual(h.calls.rpc, [{ name: "touchline_club_release_player", args: { p_user_id: id(1), p_season_id: id(2), p_command: command } }]);
    assert.deepEqual(h.calls.tables, ["touchline_fantasy_configs"]);
  }
});

test("release fails closed when admin/config/RPC is missing, without fallback writes", async () => {
  for (const options of [{ adminAvailable: false }, { season: null }, { configError: true }]) {
    const h = harness(options);
    assert.equal((await h.post()).status, 503);
    assert.equal(h.calls.rpc.length, 0);
  }
  const h = harness({ rpcError: "Could not find function public.touchline_club_release_player in the schema cache" });
  assert.deepEqual(await h.post(), { status: 503, body: { ok: false, error: "CLUB_STORAGE_UNAVAILABLE" } });
  assert.equal(h.calls.rpc.length, 1);
  const missingReceipt = harness({rpcError:"CLUB_RELEASE_RECEIPT_REQUIRED"});
  assert.deepEqual(await missingReceipt.post(), {status:503,body:{ok:false,error:"CLUB_STORAGE_UNAVAILABLE"}});
});

test("release preserves atomic refusal codes and does not retry the write", async () => {
  for (const code of ["CLUB_STALE_REVISION", "CLUB_PLAYER_NOT_OWNED", "CLUB_PLAYER_RESERVED", "CLUB_PLAYER_ROUND_LOCKED", "CLUB_MARKET_CLOSED", "CLUB_ACCESS_REQUIRED"]) {
    const h = harness({ rpcError: `database: ${code}` });
    assert.deepEqual(await h.post(), { status: 409, body: { ok: false, error: code } });
    assert.equal(h.calls.rpc.length, 1);
  }
});

test("release refuses mismatched or incomplete success payloads", async () => {
  const wrong = [null, {}, { ...saved, state: { ...saved.state, seasonId: id(9) } },
    { ...saved, receipt: { ...saved.receipt, fee_credits: 0, refund_credits: 45_000_000 } },
    { ...saved, receipt: { ...saved.receipt, refund_credits: 45_000_000 } },
    { ...saved, receipt: { ...saved.receipt, player_id: id(9) } },
    { ...saved, receipt: { ...saved.receipt, idempotency_key: "another_key" } }, { ...saved, replayed: "yes" }];
  for (const result of wrong) {
    const h = harness({ result });
    assert.deepEqual(await h.post(), { status: 503, body: { ok: false, error: "CLUB_STORAGE_UNAVAILABLE" } });
  }
  const h = harness({ result: { ...saved, state: { ...saved.state, balanceEur: -1 } } });
  assert.deepEqual(await h.post(), { status: 503, body: { ok: false, error: "CLUB_STORAGE_UNAVAILABLE" } },
    "invalid post-commit snapshot must preserve ambiguous command reconciliation");
  assert.equal(h.calls.rpc.length, 1);
});
