import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React, { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { resolveClubOwnerShell } from "./helpers/touchline-resolve-clubowner-shell.mts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";
import { getClubOwnerPlanShowcaseCopy } from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

function extract(file: string, name: string) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn);
  return ts.transpileModule(`${fn.getText(tree).replace(/^export default\s+/, "")}\n${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
}
const headerCode = extract("components/touchline/ClubOwnerMarketHeader.tsx", "ClubOwnerMarketHeader");
const css = new Proxy({}, { get: (_target, key) => String(key) });
const Header = runInNewContext(headerCode, { React, useState: () => [false, () => {}], styles: css, controls: css, planStyles: css,
  Image: () => React.createElement("span"), Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children),
  Camera: () => null, useConfirmedClubCollection: () => ({ verificationStatus: "confirmed" }), CLUB_ACQUISITION_BUDGETS: {},
  getTouchlineClubOwnerMarketCopy: () => ({}), getClubOwnerPlanShowcaseCopy, resolveTouchlineCatalogueLocale,
  getClubOwnerProfileMetricsCopy: () => ({ followers: "Followers", unavailable: "Unavailable" }), getClubCollectionBudgetCopy: () => ({}),
}) as React.ComponentType<Record<string, unknown>>;
test("real MyClub header keeps discovery hidden by default and renders only confirmed follower counts", () => {
  const common = { owner: { name: "Synthetic", avatarUrl: "", city: "", nationality: "", since: "" }, locale: "pt-BR", identityOnly: true };
  const off = renderToStaticMarkup(React.createElement(Header, { ...common, followerCount: 12 }));
  assert.doesNotMatch(off, /\/clubowners\?/); assert.match(off, /Followers<\/dt><dd aria-label="Unavailable">—/);
  for (const [count, expected] of [[null, "—"], [undefined, "—"], [-1, "—"], [NaN, "—"], [0, "0"], [1234, "1.234"]] as const) {
    const html = renderToStaticMarkup(React.createElement(Header, { ...common, publicDiscoveryEnabled: true, followerCount: count }));
    assert.match(html, /href="\/clubowners\?lang=pt-BR"/); assert.ok(html.includes("Encontrar ClubOwners"));
    assert.ok(html.includes(`>${expected}</dd>`));
  }
  const en = renderToStaticMarkup(React.createElement(Header, { ...common, locale: "en-GB", publicDiscoveryEnabled: true, followerCount: 1234 }));
  assert.match(en, /Find ClubOwners/); assert.match(en, />1,234<\/dd>/);
});

const pageCode = extract("app/clubowner/page.tsx", "renderClubOwnerPageContent");
function pageFixture(enabled: boolean, result: unknown) {
  const calls: string[] = [], received: Record<string, unknown>[] = [], deadlines: number[] = [];
  const globals = {
    React, Suspense, AbortSignal, process: { env: { TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED: enabled ? "true" : "false" } }, styles: css,
    marketLocale: async () => "en-GB", TOUCHLINE_ENGLAND_CLUBS: [],
    createClubOwnerAvatarContextReader: () => async () => null,
    touchLineAuthEntryHref: () => "/login", AuthSessionMissingError: class extends Error {}, isOwnerEmail: () => false,
    redirect: () => assert.fail("Unexpected redirect"),
    createClient: async () => { calls.push("client"); return { auth: { getUser: async () => { calls.push("auth"); return { data: { user: { id: "synthetic-self", email: "private@example.test" } }, error: null }; } },
      rpc: (name: string, args?: unknown) => { calls.push(name); assert.equal(args, undefined); return { abortSignal: (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); return Promise.resolve(result); } }; } }; },
    resolveServerReadWithin: <T>(read: PromiseLike<T>, fallback: T, timeout: number) => { deadlines.push(timeout); return resolveServerReadWithin(read, fallback, timeout); },
    loadTouchlineFantasyReadSnapshot: async () => { calls.push("snapshot"); return null; },
    readPersistedLiveRailWithin: async () => { calls.push("live"); return null; },
    readClubCollectionServer: async () => { calls.push("collection"); return { status: "unavailable" }; },
    resolveTouchlineClubOwnerPageIdentity: () => ({ isAuthenticatedClubOwner: true, name: "Synthetic" }),
    normalizeTouchlineMatchCentreTimeZone: () => "UTC", headers: async () => ({ get: () => null }),
    isTouchlineFantasyMarketAccess: () => false, clubCollectionEnabled: () => false, clubCollectionPresentationEnabled: () => false, clubOwnerRankingPosition: () => null,
    ClubCollectionProvider: ({ children }: { children: React.ReactNode }) => children,
    ClubOwnerMarketHeader: (props: Record<string, unknown>) => { received.push(props); return null; },
    FantasyGameweekClient: () => null, TouchlineBrandHeader: () => null, TouchlineGlobalNavigation: () => null, TouchlineSignOutButton: () => null, TouchlineAccountLoading: () => null,
    TouchlineCardLeadershipLayout: ({ children }: { children: React.ReactNode }) => children,
    ClubOwnerDeferredContent: async ({ content }: { content: Promise<React.ReactNode> }) => content,
  };
  const Page = runInNewContext(pageCode, globals) as (...args: unknown[]) => Promise<React.ReactNode>;
  return { calls, received, deadlines, render: async () => {
    const node = await Page({ searchParams: Promise.resolve({}) }, false, { measure: (_stage: string, start: () => Promise<unknown>) => start() }, () => {}, () => {});
    return renderToStaticMarkup(await resolveClubOwnerShell(node));
  } };
}
test("actual MyClub server function reuses one validated session, performs one gated RPC and never invents zero", async () => {
  for (const [enabled, response, count] of [
    [false, { data: { followerCount: 12 }, error: null }, null],
    [true, { data: { followerCount: 12 }, error: null }, 12],
    [true, { data: { followerCount: 0 }, error: null }, 0],
    [true, { data: null, error: null }, null],
    [true, { data: { followerCount: 12 }, error: { message: "PRIVATE_ERROR" } }, null],
    [true, { data: { followerCount: "12" }, error: null }, null],
  ] as const) {
    const f = pageFixture(enabled, response); await f.render();
    assert.equal(f.calls.filter(call => call === "client").length, 1); assert.equal(f.calls.filter(call => call === "auth").length, 1);
    assert.equal(f.calls.filter(call => call === "touchline_people_own_profile").length, enabled ? 1 : 0);
    assert.equal(f.received[0].publicDiscoveryEnabled, enabled); assert.equal(f.received[0].followerCount, count);
    assert.equal(f.deadlines.includes(2_000), enabled);
  }
});
