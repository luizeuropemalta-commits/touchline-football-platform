import { resolveClubOwnerShell } from "./helpers/touchline-resolve-clubowner-shell.mts";
import { createLocalReadTiming } from "../lib/touchlineArena/local-read-timing.ts";
import assert from "node:assert/strict";
import { clubCollectionPresentationEnabled } from "../lib/touchlineFantasy/club-collection-presentation.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import * as marketPolicy from "../lib/touchlineFantasy/market-plan-policy.ts";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as workflow from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import * as identity from "../lib/touchlineArena/club-owner-page-identity.ts";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
import * as profileMetrics from "../lib/touchlineArena/club-owner-profile-metrics.ts";
import { normalizeTouchlineMatchCentreTimeZone } from "../lib/touchlineArena/match-centre.ts";
import { toTouchlineLiveFixtures } from "../lib/touchlineArena/stadium-catalog.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX };
const page = ts.transpileModule(read("app/clubowner/page.tsx"), { compilerOptions: options }).outputText;
const ownerExports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(read("lib/admin/owner.ts"), { compilerOptions: options }).outputText, {
  exports: ownerExports, process: { env: { TOUCHLINE_OWNER_EMAILS: "owner@example.test" } },
});
const ownerPolicy = ownerExports.isOwnerEmail as (email: string | null | undefined) => boolean;
const user = (email: string) => ({ id: "11111111-1111-4111-8111-111111111111", email });
class MissingSession extends Error {}
class Navigation extends Error {
  readonly destination: string;
  constructor(destination: string) {
    super(destination);
    this.destination = destination;
  }
}
function fixture(getUser: () => Promise<unknown>, clientFailure = false, clientWait?: Promise<void>, snapshotWait?: Promise<void>) {
  const calls: string[] = [];
  const timingRecords: Array<{ stage: string; status: string }> = [];
  const timers = new Map<number, () => void>();
  let sequence = 0;
  const deadline: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(read("lib/touchlineArena/server-read-deadline.ts"), { compilerOptions: options }).outputText, {
    exports: deadline,
    setTimeout: (callback: () => void, ms: number) => {
      assert.ok(ms === 8_000 || ms === 30_000); const id = ++sequence; timers.set(id, callback); return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const modules: Record<string, unknown> = {
    "@supabase/supabase-js": { AuthSessionMissingError: MissingSession },
    "@/lib/touchlineFantasy/club-collection-server": { clubCollectionEnabled: () => false },
    "@/lib/touchlineFantasy/club-collection-read-server": { readClubCollectionServer: async (accountId: string) => {
      assert.equal(accountId, user("customer@example.test").id);
      calls.push("collection-read");
      return { status: "unavailable", error: "CLUB_COLLECTION_UNAVAILABLE", httpStatus: 503 };
    } },
    "@/lib/touchlineFantasy/club-collection-presentation": { clubCollectionPresentationEnabled },
    "@/lib/touchlineFantasy/market-plan-policy": marketPolicy,
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    react: React,
    "@/components/touchline/TouchlineAccountLoading": { default: "account-loading" },
    "@/components/touchline/cards/TouchlineCardLeadershipLayout": { default: "leadership-boundary" },
    "react/jsx-runtime": jsx,
    "next/headers": { headers: async () => new Headers({ "x-vercel-ip-timezone": "Europe/Malta" }) },
    "@/lib/touchlineArena/match-centre": { normalizeTouchlineMatchCentreTimeZone },
    "@/lib/touchlineArena/stadium-catalog": { toTouchlineLiveFixtures },
    "@/lib/touchlineArena/persisted-live-rail-server": { readPersistedLiveRailWithin: async () => { calls.push("public-fixtures"); return null; } },
    "@/lib/touchlineArena/club-owner-profile-metrics": profileMetrics,
    "next/navigation": { redirect: (href: string) => { throw new Navigation(href); }, notFound: () => { throw new Navigation("not-found"); } },
    "@/lib/supabase/server": { createClient: async () => {
      if (clientFailure) throw new Error("PRIVATE_CLIENT_FAILURE");
      if (clientWait) await clientWait;
      return { auth: { getUser: () => { calls.push("auth"); return getUser(); } } };
    } },
    "@/lib/admin/owner": { isOwnerEmail: (email: string) => { calls.push("owner-policy"); return ownerPolicy(email); } },
    "@/lib/touchlineArena/local-read-timing": { createLocalReadTiming: () => createLocalReadTiming({ NODE_ENV: "development", TOUCHLINE_LOCAL_READ_TIMING: "1" }, { emit: record => timingRecords.push(record) }) },
    "@/lib/touchlineArena/server-read-deadline": deadline,
    "@/lib/touchlineArena/auth-i18n": authCopy,
    "@/lib/touchlineArena/catalogue-locale": catalogue,
    "@/lib/touchlineFantasy/market-workflow-i18n": workflow,
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS },
    "@/lib/touchlineArena/club-owner-avatar-context-server": { createClubOwnerAvatarContextReader: () => async () => { calls.push("avatar"); return null; } },
    "@/lib/touchlineFantasy/server": {
      // ClubOwner deliberately uses the read-only snapshot: customer page
      // loads must not schedule lifecycle writers.  Keep this VM fixture on
      // the same public contract as the real module.
      loadTouchlineFantasySnapshot: async (actor: unknown) => { calls.push("snapshot"); return { actor, config: { budgetEur: 500_000_000 } }; },
      loadTouchlineFantasyReadSnapshot: async (actor: unknown) => { calls.push("snapshot"); await snapshotWait; return { actor, config: { budgetEur: 500_000_000 } }; },
    },
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity: (...args: Parameters<typeof identity.resolveTouchlineClubOwnerPageIdentity>) => { calls.push("identity"); return identity.resolveTouchlineClubOwnerPageIdentity(...args); } },
    "./market-game.module.css": { default: { page: "page", content: "content" } },
  };
  modules["@/components/touchline/fantasy/ClubCollectionContext"] = { ClubCollectionProvider: "collection-provider" };
  for (const [path, name] of [
    ["@/components/touchline/ClubOwnerMarketHeader", "owner-header"],
    ["@/components/touchline/TouchlineBrandHeader", "brand-header"],
    ["@/app/fantasy/FantasyGameweekClient", "fantasy-client"],
    ["@/components/touchline/TouchlineGlobalNavigation", "navigation"],
    ["@/components/touchline/TouchlineSignOutButton", "sign-out"],
  ]) modules[path] = { default: name };
  const exports: { default?: (props: object) => Promise<React.ReactElement> } = {};
  runInNewContext(page, { exports, process: { env: {} }, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  assert.ok(exports.default);
  return {
    calls, timingRecords, runShell: () => exports.default!({ searchParams: Promise.resolve({ lang: "pt-BR" }) }),
    run: async () => resolveClubOwnerShell(await exports.default!({ searchParams: Promise.resolve({ lang: "pt-BR" }) })),
    expire: () => { for (const callback of [...timers.values()]) callback(); },
  };
}
function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as React.ReactNode), ...nodes(child.props.navigation as React.ReactNode)] : []);
}

for (const email of ["owner@example.test", "customer@example.test"]) {
  test(`ClubOwner never trusts an error-bearing ${email} identity`, async () => {
    const h = fixture(async () => ({ data: { user: user(email) }, error: new Error("PRIVATE_AUTH_ERROR") }));
    let returned: unknown;
    try { returned = await h.run(); } catch (error) {
      assert.ok(error instanceof Navigation);
      assert.match(error.destination, /&error=auth_unavailable$/);
      assert.doesNotMatch(error.destination, /PRIVATE_AUTH_ERROR/);
    }
    assert.deepEqual(h.calls, ["auth"], "unverified identity must not reach owner policy, avatar, snapshot or identity projection");
    assert.equal(returned, undefined, "no account context or authenticated navigation may be rendered");
  });
}

test("ClubOwner preserves verified customer rendering and verified owner exclusion", async () => {
  const actor = user("customer@example.test");
  const customer = fixture(async () => ({ data: { user: actor }, error: null }));
  const tree = await customer.run();
  assert.deepEqual(customer.calls, ["auth", "owner-policy", "avatar", "snapshot", "public-fixtures", "collection-read", "identity"]);
  const all = nodes(tree);
  const context = all.find(node => node.type === "brand-header")!.props.accountLocaleContext;
  assert.equal(JSON.stringify(context), JSON.stringify({ mode: "account", accountId: actor.id }));
  assert.equal(all.find(node => node.type === "navigation")!.props.surface, "authenticated");
  const owner = fixture(async () => ({ data: { user: user("owner@example.test") }, error: null }));
  await assert.rejects(owner.run(), error => error instanceof Navigation && error.destination === "/admin?lang=pt-BR");
  assert.deepEqual(owner.calls, ["auth", "owner-policy"]);
});

test("ClubOwner distinguishes unavailable receipts from confirmed guests", async () => {
  for (const receipt of [null, undefined, { data: { user: user("owner@example.test") } }, { data: { user: user("customer@example.test") } }]) {
    const h = fixture(async () => receipt);
    await assert.rejects(h.run(), error => error instanceof Navigation
      && error.destination === "/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Dpt-BR&error=auth_unavailable");
    assert.deepEqual(h.calls, ["auth"]);
  }
});

test("ClubOwner keeps guest recovery distinct from rejected and timed-out reads", async () => {
  for (const [getUser, unavailable] of [
    [async () => ({ data: { user: null }, error: null }), false],
    [async () => ({ data: { user: user("owner@example.test") }, error: new MissingSession() }), false],
    [async () => { throw new Error("READ_REJECTION"); }, true],
    [() => new Promise<unknown>(() => {}), true],
  ] as const) {
    const h = fixture(getUser);
    const pending = h.run();
    const rejected = assert.rejects(pending, error => error instanceof Navigation
      && error.destination === `/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Dpt-BR${unavailable ? "&error=auth_unavailable" : ""}`);
    await new Promise<void>(resolve => setImmediate(resolve));
    h.expire();
    await rejected;
    assert.deepEqual(h.calls, ["auth"]);
  }
});

test("ClubOwner client setup failure is unavailable and never exposes provider details", async () => {
  const h = fixture(async () => assert.fail("no auth call after client failure"), true);
  await assert.rejects(h.run(), error => error instanceof Navigation
    && error.destination === "/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Dpt-BR&error=auth_unavailable");
  assert.deepEqual(h.calls, []);
});

test("ClubOwner deadline includes client setup and fences a late client before auth starts", async () => {
  let finish!: () => void;
  const clientWait = new Promise<void>(resolve => { finish = resolve; });
  const h = fixture(async () => ({ data: { user: user("customer@example.test") }, error: null }), false, clientWait);
  const pending = h.run();
  const rejected = assert.rejects(pending, error => error instanceof Navigation
    && error.destination === "/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Dpt-BR&error=auth_unavailable");
  await new Promise<void>(resolve => setImmediate(resolve));
  h.expire();
  await rejected;
  assert.deepEqual(h.calls, [], "unresolved setup must not authenticate or read account data");
  finish();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, [], "late setup must not start authentication after the deadline");
});


test("verified shell appears before a pending squad, without duplicating account reads", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const actor = user("customer@example.test");
  const h = fixture(async () => ({ data: { user: actor }, error: null }), false, undefined, pending);
  let shell: React.ReactElement | undefined;
  const rendering = h.runShell().then(value => { shell = value; return value; });
  try {
    for (let turn = 0; turn < 35; turn++) await Promise.resolve();
    assert.ok(shell, "authenticated header must not wait for squad completion");
    const all = nodes(shell);
    assert.equal(all.filter(node => node.type === "main").length, 1);
    const header = all.find(node => node.type === "brand-header")!;
    assert.equal(JSON.stringify(header.props.accountLocaleContext), JSON.stringify({ mode: "account", accountId: actor.id }));
    assert.equal(all.find(node => node.type === "navigation")!.props.surface, "authenticated");
    assert.equal(all.some(node => node.type === "fantasy-client"), false, "account body is still deferred");
    const boundary = all.find(node => node.type === React.Suspense)!;
    assert.equal((boundary.props.fallback as React.ReactElement<{contentOnly: boolean}>).props.contentOnly, true);
    assert.equal(h.calls.filter(call => call === "snapshot").length, 1);
    assert.equal(h.calls.filter(call => call === "auth").length, 1);
    assert.equal(h.timingRecords.some(record => record.stage === "total"), false, "total cannot finish when only the shell is ready");
    release();
    const completed = nodes(await resolveClubOwnerShell(await rendering));
    assert.equal(h.timingRecords.filter(record => record.stage === "total" && record.status === "fulfilled").length, 1);
    assert.equal(completed.filter(node => node.type === "brand-header").length, 1);
    assert.equal(completed.filter(node => node.type === "fantasy-client").length, 1);
    assert.equal(h.calls.filter(call => call === "snapshot").length, 1);
  } finally { release(); await rendering; }
});
