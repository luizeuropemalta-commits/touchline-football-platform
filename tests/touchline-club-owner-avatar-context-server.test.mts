import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as sdk from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(import.meta.dirname, ".."), native = createRequire(import.meta.url);
const host = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app", database = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const actor = "11111111-1111-4111-8111-111111111111", operation = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const avatar = `/api/account/avatar?version=${operation}`, oldPhoto = "https://legacy.invalid/photo.jpg";
const auth = (id = actor) => ({ data: { user: { id, email: "customer@example.invalid", app_metadata: { touchline_arena_access_v1: true }, user_metadata: { full_name: "Real Customer", avatar_url: oldPhoto } } }, error: null });
type Context = { accountId: string; revision: string; avatarUrl: string | null; canUpload: false; generation: string; uploadAllowed: boolean; readyForSelection: false } | null;
type Reader = (authentication: unknown, accountId: string, signal?: AbortSignal) => Promise<Context>;

function fixture(patch: Record<string, string | undefined> = {}) {
  const environment: Record<string, string | undefined> = {
    TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", VERCEL_BRANCH_URL: host, VERCEL_URL: host,
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy", NEXT_PUBLIC_SUPABASE_URL: database, SUPABASE_URL: database,
    NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: `https://${host}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key-not-a-credential",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-not-a-credential", TOUCHLINE_OWNER_EMAILS: "admin@example.invalid", ...patch,
  };
  const calls: string[] = [], accounts: string[] = [], headerProps: Record<string, unknown>[] = [], fantasyProps: Record<string, unknown>[] = [];
  const timers = new Map<number, () => void>(); let sequence = 0, time = 0;
  const state: { authentication: unknown; host: string; isolated: string | null; rpcError: boolean; row: Record<string, unknown> | null; headersWait?: Promise<void>;
    rpcWait?: Promise<void>; afterRpc?: () => void; authDrift?: boolean; signal?: AbortSignal; generation: string } = {
    authentication: auth(), host, isolated: null, rpcError: false, generation: "0",
    row: { actorId: actor, revision: "1", avatarUrl: avatar, operationId: operation, digest: "a".repeat(64) },
  };
  const cache = new Map<string, unknown>();
  function load(path: string): unknown {
    if (cache.has(path)) return cache.get(path);
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    const require = (name: string): unknown => {
      if (name === "server-only") return {};
      if (name === "next/headers") return { headers: async () => {
        calls.push("headers"); await state.headersWait;
        return { get: (key: string) => key === "host" ? state.host : key === "x-touchline-isolated-preview" ? state.isolated : null };
      }, cookies: async () => { calls.push("cookies"); return { getAll: () => [], set: () => {} }; } };
      if (name === "@supabase/ssr") return { createServerClient: () => {
        calls.push("session"); return { auth: { getUser: async () => {
          calls.push("getUser"); if (state.authDrift) environment.SUPABASE_URL = "https://changed.invalid";
          return state.authentication;
        } } };
      } };
      if (name === "@supabase/supabase-js") return { ...sdk, createClient: (url: string, key: string) => {
        calls.push("privileged"); assert.equal(url, database); assert.equal(key, "synthetic-service-key-not-a-credential");
        return { rpc: (name: string, args: Record<string, string>) => {
          assert.ok(["touchline_read_club_owner_avatar", "touchline_read_club_owner_avatar_operation_status"].includes(name));
          calls.push(name === "touchline_read_club_owner_avatar" ? "readCurrent" : "status"); accounts.push(args.p_actor);
          const builder = { abortSignal: (signal: AbortSignal) => { state.signal = signal; return builder; }, retry: (value: boolean) => { assert.equal(value, false); return builder; },
            then: (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) => Promise.resolve().then(async () => {
              await state.rpcWait; state.afterRpc?.();
              return state.rpcError ? { data: null, status: 500, error: { message: "PRIVATE_SCHEMA_ERROR" } }
                : { data: name === "touchline_read_club_owner_avatar" ? state.row : { version: 1, actorId: actor,
                  revision: state.row?.revision, generation: state.generation, activeOperationId: null, fencedThroughGeneration: "-1", requestedOperationId: null, operation: null }, error: null, status: 200 };
            }).then(yes, no) };
          return builder;
        } };
      } };
      if (name === "next/navigation") return { redirect: (url: string) => { throw Error(`REDIRECT:${url}`); }, notFound: () => { throw Error("NOT_FOUND"); } };
      if (name === "@/components/touchline/ClubOwnerMarketHeader") return { default: (props: Record<string, unknown>) => { headerProps.push(props); return null; }, __esModule: true };
      if (name === "@/app/fantasy/FantasyGameweekClient") return { default: (props: Record<string, unknown>) => { fantasyProps.push(props); return null; }, __esModule: true };
      if (name === "@/components/touchline/TouchlineGlobalNavigation" || name === "@/components/touchline/notifications/TouchlineMarketNotifications") return { default: () => null, __esModule: true };
      // Keep the real new brand frame; audio/auth client controls are outside
      // this server identity/context contract, like the existing UI leaves.
      if (name === "./TouchlinePageControls") return { default: () => null, __esModule: true };
      if (name === "@/lib/touchlineFantasy/server") return { loadTouchlineFantasySnapshot: async () => { calls.push("fantasy"); return { marker: "unchanged-real-account-snapshot-boundary" }; } };
      if (name === "@/lib/touchlineArena/demo-data") return { TOUCHLINE_ENGLAND_CLUBS: [] };
      if (name.endsWith(".css")) return {};
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        if (!/\.[cm]?tsx?$/.test(target)) {
          const resolved = [".ts", ".tsx"].map(extension => target + extension).find(candidate => existsSync(candidate));
          assert.ok(resolved, `Missing local dependency: ${target}`); target = resolved;
        }
        return load(target);
      }
      return native(name);
    };
    const source = readFileSync(path, "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports, require, process: { env: environment }, Buffer, URL, Request, Response, AbortController, AbortSignal, performance: { now: () => time },
        setTimeout: (callback: () => void, ms: number) => { assert.ok(ms > 0 && ms <= 8000); const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id) }, { filename: path });
    return exports;
  }
  const create = () => (load(resolve(root, "lib/touchlineArena/club-owner-avatar-context-server.ts")) as { createClubOwnerAvatarContextReader: () => Reader }).createClubOwnerAvatarContextReader();
  const createSelection = (enabled = false, retentionReady = false) => (load(resolve(root, "lib/touchlineArena/club-owner-avatar-context-server.ts")) as {
    createClubOwnerAvatarSelectionContextReader: (enabled: boolean, retentionReady: boolean) => (...args: Parameters<Reader>) => Promise<{ recovery: Context; selection: { accountId: string; generation: string } | null }>;
  }).createClubOwnerAvatarSelectionContextReader(enabled, retentionReady);
  const page = async () => {
    const pageModule = load(resolve(root, "app/clubowner/page.tsx")) as { default: (props: unknown) => Promise<React.ReactNode> };
    return renderToStaticMarkup(await pageModule.default({ searchParams: Promise.resolve({ lang: "en-GB" }) }));
  };
  return { create, createSelection, page, environment, calls, accounts, state, headerProps, fantasyProps, timers,
    expire: () => { time = 8001; for (const callback of [...timers.values()]) callback(); }, advance: () => { time = 8001; } };
}
async function flush() { for (let index = 0; index < 35; index++) await Promise.resolve(); }

test("selection projection reuses exactly one C1 context read and independent gates default off", async () => {
  for (const [enabled, retentionReady] of [[false, false], [true, false], [false, true], [true, true]]) {
    const h = fixture({ TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: actor });
    const result = await h.createSelection(enabled, retentionReady)(auth(), actor);
    assert.equal(result.recovery?.canUpload, false); assert.equal(result.recovery?.readyForSelection, false);
    assert.equal(result.selection?.accountId ?? null, enabled && retentionReady ? actor : null);
    assert.deepEqual(h.calls, ["headers", "privileged", "status", "readCurrent", "status"]);
    assert.ok(!h.calls.includes("getUser"));
  }
});

test("default OFF and unadmitted QA environments yield null without privileged reads", async () => {
  for (const patch of [{ TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: undefined }, { TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "false" },
    { VERCEL_ENV: "production" }, { VERCEL_URL: undefined }, { VERCEL_URL: "bad" }, { VERCEL_GIT_COMMIT_REF: "main" },
    { SUPABASE_URL: "https://other.invalid" }, { TOUCHLINE_DATA_SOURCE: "qa-mirror" }, { STRIPE_SECRET_KEY: "synthetic-forbidden" },
    { TOUCHLINE_OWNER_EMAILS: "" }, { TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" }]) {
    const h = fixture(patch); assert.equal(await h.create()(auth(), actor), null); assert.ok(!h.calls.includes("privileged")); assert.equal(h.timers.size, 0);
  }
});

test("control context brackets authoritative reads and projects safe generation fields without upload readiness", async () => {
  const h = fixture(); const result = await h.create()(auth(), actor);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { accountId: actor, revision: "1", avatarUrl: avatar, canUpload: false,
    generation: "0", activeOperationId: null, fencedThroughGeneration: "-1", operationId: null, operationState: null,
    committedRevision: null, uploadAllowed: false, readyForSelection: false });
  assert.ok(Object.isFrozen(result)); assert.deepEqual(h.accounts, [actor, actor, actor]); assert.deepEqual(h.calls, ["headers", "privileged", "status", "readCurrent", "status"]);
  assert.equal(h.timers.size, 0);
});

test("unknown/error-bearing auth, admin, user_metadata-only and account mismatch never create a privileged client", async () => {
  const variants = [null, {}, { data: { user: null }, error: null }, { ...auth(), error: { message: "PRIVATE_AUTH_ERROR" } },
    { data: { user: { ...auth().data.user, app_metadata: {}, user_metadata: { touchline_arena_access_v1: true } } }, error: null },
    { data: { user: { ...auth().data.user, email: " ADMIN@example.invalid " } }, error: null },
    { data: { user: { ...auth().data.user, id: "bad" } }, error: null }, auth(other)];
  for (const value of variants) { const h = fixture(); assert.equal(await h.create()(value, actor), null); assert.ok(!h.calls.includes("privileged")); }
});

test("host and isolated-request metadata are denied, but absent GET-style Origin is normal", async () => {
  for (const patch of [{ host: "foreign.invalid" }, { host: `${host}:443` }, { isolated: "true" }]) {
    const h = fixture(); Object.assign(h.state, patch); assert.equal(await h.create()(auth(), actor), null); assert.ok(!h.calls.includes("privileged"));
  }
});

test("schema/empty/malformed/other-account replies degrade to null, never an invented revision zero", async () => {
  for (const row of [null, {}, { actorId: actor, revision: 0, avatarUrl: null }, { ...fixture().state.row, actorId: other },
    { actorId: actor, revision: "1", operationId: operation, digest: "a".repeat(64), avatarUrl: "https://foreign.invalid/photo" }]) {
    const h = fixture(); h.state.row = row; assert.equal(await h.create()(auth(), actor), null);
  }
  const h = fixture(); h.state.rpcError = true; assert.equal(await h.create()(auth(), actor), null);
});

test("confirmed zero keeps legacy/null media and decimal bigint revisions remain exact", async () => {
  for (const avatarUrl of [null, oldPhoto]) {
    const h = fixture(); h.state.row = { actorId: actor, revision: "0", avatarUrl, operationId: null, digest: null };
    const result = await h.create()(auth(), actor); assert.equal(result?.revision, "0"); assert.equal(result?.avatarUrl, avatarUrl); assert.equal(result?.canUpload, false);
  }
  const h = fixture(); h.state.row!.revision = "9007199254740993"; assert.equal((await h.create()(auth(), actor))?.revision, "9007199254740993");
});

test("factory snapshots before auth, detects config drift, and never retargets a mutated captured account", async () => {
  const before = fixture(), reader = before.create(); before.environment.SUPABASE_URL = "https://changed.invalid";
  assert.equal(await reader(auth(), actor), null); assert.ok(!before.calls.includes("privileged"));
  const h = fixture(); let release!: () => void; h.state.headersWait = new Promise(resolve => { release = resolve; });
  const authentication = auth(); const pending = h.create()(authentication, actor); await flush(); authentication.data.user.id = other;
  release(); assert.equal((await pending)?.accountId, actor); assert.deepEqual(h.accounts, [actor, actor, actor]);
  const drift = fixture(); drift.state.afterRpc = () => { drift.environment.TOUCHLINE_OWNER_EMAILS = "changed@example.invalid"; };
  assert.equal(await drift.create()(auth(), actor), null);
});

test("control context policy permission is distinct from readiness and torn status remains null", async () => {
  for (const configured of [actor, other, undefined]) {
    const h = fixture({ TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: configured });
    const result = await h.create()(auth(), actor); assert.equal(result?.uploadAllowed, configured === actor);
    assert.equal(result?.canUpload, false); assert.equal(result?.readyForSelection, false);
  }
  const h = fixture(); h.state.afterRpc = () => { if (h.calls.at(-1) === "readCurrent") h.state.generation = "1"; };
  assert.equal(await h.create()(auth(), actor), null);
});

test("finite deadline and abort prevent late privileged creation and late DTO settlement", async () => {
  const initial = fixture(), alreadyAborted = new AbortController(); alreadyAborted.abort();
  assert.equal(await initial.create()(auth(), actor, alreadyAborted.signal), null); assert.equal(initial.calls.length, 0); assert.equal(initial.timers.size, 0);
  const h = fixture(); let release!: () => void; h.state.headersWait = new Promise(resolve => { release = resolve; });
  const pending = h.create()(auth(), actor); await flush(); h.expire(); assert.equal(await pending, null);
  release(); await flush(); assert.ok(!h.calls.includes("privileged")); assert.equal(h.timers.size, 0);
  const aborted = fixture(), controller = new AbortController(); aborted.state.rpcWait = new Promise(() => {});
  const waiting = aborted.create()(auth(), actor, controller.signal); await flush(); controller.abort();
  assert.equal(await waiting, null); assert.equal(aborted.state.signal?.aborted, true); assert.equal(aborted.timers.size, 0);
  const late = fixture(); late.state.afterRpc = () => queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => late.advance())));
  assert.equal(await late.create()(auth(), actor), null);
  const lateAbort = fixture(), abortAtSettlement = new AbortController();
  lateAbort.state.afterRpc = () => queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => abortAtSettlement.abort())));
  assert.equal(await lateAbort.create()(auth(), actor, abortAtSettlement.signal), null);
});

test("real page authenticates once, preserves Fantasy and uses canonical stored avatar without enabling photo controls", async () => {
  const h = fixture(); await h.page(); assert.equal(h.calls.filter(call => call === "getUser").length, 1);
  assert.equal((h.headerProps[0].owner as { avatarUrl: string }).avatarUrl, avatar);
  assert.equal((h.fantasyProps[0].clubOwner as { avatarUrl: string }).avatarUrl, avatar);
  assert.equal((h.fantasyProps[0].initialSnapshot as { marker: string }).marker, "unchanged-real-account-snapshot-boundary");
  assert.equal(h.fantasyProps[0].marketPage, true); assert.equal(h.fantasyProps[0].embedded, true);
  assert.equal(h.headerProps[0].accountId, actor);
  assert.deepEqual(JSON.parse(JSON.stringify(h.headerProps[0].avatarContext)), { accountId: actor, revision: "1", avatarUrl: avatar,
    generation: "0", activeOperationId: null, fencedThroughGeneration: "-1", operationId: null, operationState: null,
    committedRevision: null, uploadAllowed: false, canUpload: false, readyForSelection: false });
});

test("real page rejects error-bearing identity before avatar admission or account snapshot", async () => {
  const h = fixture();
  h.state.authentication = { ...auth(), error: { message: "PRIVATE_AUTH" } };
  await assert.rejects(h.page(), { message: "REDIRECT:/login?lang=en-GB&returnTo=%2Fclubowner%3Flang%3Den-GB" });
  assert.equal(h.calls.filter(call => call === "getUser").length, 1);
  for (const call of ["privileged", "status", "readCurrent", "fantasy"]) assert.ok(!h.calls.includes(call), call);
  assert.deepEqual(h.accounts, []);
  assert.equal(h.headerProps.length, 0);
  assert.equal(h.fantasyProps.length, 0);
  assert.equal(h.timers.size, 0);
});

test("real page degrades schema/config failures to same-account metadata after verified authentication", async () => {
  for (const mode of ["schema", "drift", "off"] as const) {
    const h = fixture(mode === "off" ? { TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: undefined } : {});
    if (mode === "schema") h.state.rpcError = true;
    if (mode === "drift") h.state.authDrift = true;
    await h.page(); assert.equal(h.calls.filter(call => call === "getUser").length, 1);
    assert.equal((h.headerProps[0].owner as { avatarUrl: string }).avatarUrl, oldPhoto); assert.equal(h.fantasyProps.length, 1);
    assert.equal(h.headerProps[0].avatarContext, null);
    if (mode !== "schema") assert.ok(!h.calls.includes("privileged"));
  }
});

test("real page keeps original unauthenticated redirect and admin not-found boundaries", async () => {
  const guest = fixture(); guest.state.authentication = { data: { user: null }, error: null };
  await assert.rejects(guest.page(), /REDIRECT:.*login/); assert.ok(!guest.calls.includes("privileged")); assert.equal(guest.fantasyProps.length, 0);
  const admin = fixture(); admin.state.authentication = { data: { user: { ...auth().data.user, email: "admin@example.invalid" } }, error: null };
  await assert.rejects(admin.page(), /NOT_FOUND/); assert.ok(!admin.calls.includes("privileged")); assert.equal(admin.fantasyProps.length, 0);
});
