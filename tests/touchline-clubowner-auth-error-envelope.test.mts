import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as workflow from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import * as identity from "../lib/touchlineArena/club-owner-page-identity.ts";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
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
class Navigation extends Error {
  readonly destination: string;
  constructor(destination: string) {
    super(destination);
    this.destination = destination;
  }
}
function fixture(getUser: () => Promise<unknown>) {
  const calls: string[] = [];
  const timers = new Map<number, () => void>();
  let sequence = 0;
  const deadline: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(read("lib/touchlineArena/server-read-deadline.ts"), { compilerOptions: options }).outputText, {
    exports: deadline,
    setTimeout: (callback: () => void, ms: number) => {
      assert.equal(ms, 8_000); const id = ++sequence; timers.set(id, callback); return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocalePolicy,
    "react/jsx-runtime": jsx,
    "next/navigation": { redirect: (href: string) => { throw new Navigation(href); }, notFound: () => { throw new Navigation("not-found"); } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: () => { calls.push("auth"); return getUser(); } } }) },
    "@/lib/admin/owner": { isOwnerEmail: (email: string) => { calls.push("owner-policy"); return ownerPolicy(email); } },
    "@/lib/touchlineArena/server-read-deadline": deadline,
    "@/lib/touchlineArena/auth-i18n": authCopy,
    "@/lib/touchlineArena/catalogue-locale": catalogue,
    "@/lib/touchlineFantasy/market-workflow-i18n": workflow,
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS },
    "@/lib/touchlineArena/club-owner-avatar-context-server": { createClubOwnerAvatarContextReader: () => async () => { calls.push("avatar"); return null; } },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasySnapshot: async (actor: unknown) => { calls.push("snapshot"); return { actor }; } },
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity: (...args: Parameters<typeof identity.resolveTouchlineClubOwnerPageIdentity>) => { calls.push("identity"); return identity.resolveTouchlineClubOwnerPageIdentity(...args); } },
    "./market-game.module.css": { default: { page: "page", content: "content" } },
  };
  for (const [path, name] of [
    ["@/components/touchline/ClubOwnerMarketHeader", "owner-header"],
    ["@/components/touchline/TouchlineBrandHeader", "brand-header"],
    ["@/app/fantasy/FantasyGameweekClient", "fantasy-client"],
    ["@/components/touchline/TouchlineGlobalNavigation", "navigation"],
    ["@/components/touchline/notifications/TouchlineMarketNotifications", "notifications"],
  ]) modules[path] = { default: name };
  const exports: { default?: (props: object) => Promise<React.ReactElement> } = {};
  runInNewContext(page, { exports, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  assert.ok(exports.default);
  return {
    calls, run: () => exports.default!({ searchParams: Promise.resolve({ lang: "pt-BR" }) }),
    expire: () => { for (const callback of [...timers.values()]) callback(); },
  };
}
function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as React.ReactNode)] : []);
}

for (const email of ["owner@example.test", "customer@example.test"]) {
  test(`ClubOwner never trusts an error-bearing ${email} identity`, async () => {
    const h = fixture(async () => ({ data: { user: user(email) }, error: new Error("PRIVATE_AUTH_ERROR") }));
    let returned: unknown;
    try { returned = await h.run(); } catch (error) { assert.ok(error instanceof Navigation); }
    assert.deepEqual(h.calls, ["auth"], "unverified identity must not reach owner policy, avatar, snapshot or identity projection");
    assert.equal(returned, undefined, "no account context or authenticated navigation may be rendered");
  });
}

test("ClubOwner preserves verified customer rendering and verified owner exclusion", async () => {
  const actor = user("customer@example.test");
  const customer = fixture(async () => ({ data: { user: actor }, error: null }));
  const tree = await customer.run();
  assert.deepEqual(customer.calls, ["auth", "owner-policy", "avatar", "snapshot", "identity"]);
  const all = nodes(tree);
  const context = all.find(node => node.type === "brand-header")!.props.accountLocaleContext;
  assert.equal(JSON.stringify(context), JSON.stringify({ mode: "account", accountId: actor.id }));
  assert.equal(all.find(node => node.type === "navigation")!.props.surface, "authenticated");
  const owner = fixture(async () => ({ data: { user: user("owner@example.test") }, error: null }));
  await assert.rejects(owner.run(), error => error instanceof Navigation && error.destination === "not-found");
  assert.deepEqual(owner.calls, ["auth", "owner-policy"]);
});

test("ClubOwner treats absent receipts and missing error verification as unauthenticated", async () => {
  for (const receipt of [null, undefined, { data: { user: user("owner@example.test") } }, { data: { user: user("customer@example.test") } }]) {
    const h = fixture(async () => receipt);
    await assert.rejects(h.run(), error => error instanceof Navigation
      && error.destination === "/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Dpt-BR");
    assert.deepEqual(h.calls, ["auth"]);
  }
});

test("ClubOwner keeps existing guest, rejected-read and timeout login recovery", async () => {
  for (const getUser of [
    async () => ({ data: { user: null }, error: null }),
    async () => { throw new Error("READ_REJECTION"); },
    () => new Promise<unknown>(() => {}),
  ]) {
    const h = fixture(getUser);
    const pending = h.run();
    const rejected = assert.rejects(pending, error => error instanceof Navigation
      && error.destination === "/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Dpt-BR");
    await new Promise<void>(resolve => setImmediate(resolve));
    h.expire();
    await rejected;
    assert.deepEqual(h.calls, ["auth"]);
  }
});
