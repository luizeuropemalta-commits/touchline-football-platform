import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import test from "node:test";
import ts from "typescript";
import { touchlinePlayerAppearanceLabel, touchlinePlayerDataSourceLabel, TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES } from "../lib/touchlineArena/player-appearance-presentation.ts";
import { localizedStatLabel } from "../lib/touchlineArena/player-statistic-labels.ts";
import { formatTouchlineProfileTimestamp } from "../lib/touchlineArena/profile-timestamp.ts";
import { emptyTouchLinePlayerSeasonStatistics, touchLinePlayerSeasonCoverageMessage } from "../lib/touchlineArena/player-season-statistics.ts";
import { getTouchlineCoachProfileCopy } from "../lib/touchlineArena/coach-profile-i18n.ts";
import { touchlineArenaContractHref } from "../lib/touchlineArena/arena-navigation.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const presentations = [
  { locale: "ar-SA", internal: false, enabled: undefined, expected: "en-GB" },
  { locale: "ar-SA", internal: true, enabled: undefined, expected: "en-GB" },
  { locale: "ar-SA", internal: true, enabled: false, expected: "en-GB" },
  ...locales.map(locale => ({ locale, internal: true, enabled: true, expected: locale })),
  ...locales.map(locale => ({ locale, internal: false, enabled: true, expected: locale })),
];
type Element = React.ReactElement<Record<string, unknown>>;
function walk(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child) ? [child, ...walk(child.props.children as React.ReactNode)] : []);
}
/** Real local modules (including catalogues/formatters) with explicit server
 * boundaries and inert client component leaves. Never invokes provider/DB. */
function pageHarness(overrides: Record<string, unknown>) {
  const env: Record<string, string | undefined> = { NODE_ENV: "production" };
  const cache = new Map<string, Record<string, unknown>>();
  function load(name: string, from = root): unknown {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "server-only") throw Error("Unmocked server boundary");
    if (name === "next/navigation") return { notFound: () => { throw Error("NOT_FOUND"); } };
    if (name === "next/link") return { __esModule: true, default: (props: { children?: React.ReactNode; href: string }) => React.createElement("a", { href: props.href }, props.children) };
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/components/")) return new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : (props: { children?: React.ReactNode }) => React.createElement("div", { "data-boundary": `${name}:${String(key)}` }, props.children) });
    if (!name.startsWith("@/") && !name.startsWith(".") && !name.startsWith("/")) return nodeRequire(name);
    const base = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(from, name);
    const path = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`].find(value => existsSync(value));
    assert.ok(path, `Missing module ${name}`);
    if (path.endsWith(".json")) return JSON.parse(readFileSync(path, "utf8"));
    if (cache.has(path)) return cache.get(path)!;
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    // Native ESM imports are instantiated before body evaluation even when
    // written at EOF (country-flags imports its generated ISO table there).
    // A per-file CommonJS transpile otherwise emits that require too late.
    // Hoist declarations only, preserving their relative order and every body
    // statement; do not substitute the real module/catalogue implementation.
    const seam = path.endsWith("/app/touchline-players/[player]/page.tsx")
      ? '\nexports.internalPage = typeof renderPlayerProfilePage === "function" ? renderPlayerProfilePage : undefined;'
      : path.endsWith("/app/touchline-coaches/[coach]/page.tsx")
        ? '\nexports.internalPage = typeof renderCoachProfilePage === "function" ? renderCoachProfilePage : undefined; exports.internalMetadata = typeof generateCoachProfileMetadata === "function" ? generateCoachProfileMetadata : undefined;'
        : "";
    const code = ts.transpileModule(readFileSync(path, "utf8") + seam, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      transformers: { before: [() => source => ts.factory.updateSourceFile(source, [
        ...source.statements.filter(ts.isImportDeclaration),
        ...source.statements.filter(statement => !ts.isImportDeclaration(statement)),
      ])] },
    }).outputText;
    runInNewContext(code, { exports, module: { exports }, require: (id: string) => load(id, dirname(path)), process: { env }, URL, URLSearchParams, Intl, Date, Map, Set, fetch: () => assert.fail("No network") });
    return exports;
  }
  return { load, setReleaseFlag: (value?: string) => { env.TOUCHLINE_SITE_LOCALES_ENABLED = value; } };
}

test("profile appearance helpers select eight existing catalogues only with explicit opt-in", () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const) {
    for (const status of ["started", "substitute", "unused", "absent", null] as const) {
      assert.equal(touchlinePlayerAppearanceLabel(status, locale, true), TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES[locale][status ?? "unavailable"]);
      assert.equal(touchlinePlayerAppearanceLabel(status, locale), TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES[locale === "pt-BR" ? "pt-BR" : "en-GB"][status ?? "unavailable"]);
    }
    assert.equal(touchlinePlayerDataSourceLabel(locale, true), TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES[locale].source);
  }
  assert.equal(touchlinePlayerAppearanceLabel("started", "de-DE", true), "Startelf");
  assert.equal(touchlinePlayerAppearanceLabel(null, "constructor", true), "Unavailable");
});

test("profile statistics and UTC dates opt in without changing facts or unknown fallback", () => {
  assert.equal(localizedStatLabel("goals", "goals", "es-ES", true), "Goles");
  assert.equal(localizedStatLabel("goals", "goals", "es-ES"), "Goals");
  assert.equal(localizedStatLabel("unknown", "official_value", "es-ES", true), "Official value");
  const statistics = Object.freeze({ ...emptyTouchLinePlayerSeasonStatistics({}), coverageStatus: "partial" as const, synchronizedFixtureCount: 0, expectedFixtureCount: 3 });
  const before = JSON.stringify(statistics);
  assert.match(touchLinePlayerSeasonCoverageMessage(statistics, "es-ES", true)!, /0.*3/);
  assert.notEqual(touchLinePlayerSeasonCoverageMessage(statistics, "es-ES", true), touchLinePlayerSeasonCoverageMessage(statistics, "es-ES"));
  assert.equal(JSON.stringify(statistics), before);
  const instant = "2026-10-04T12:30:00Z";
  assert.equal(formatTouchlineProfileTimestamp(instant, "es-ES"), formatTouchlineProfileTimestamp(instant, "en-GB"));
  assert.notEqual(formatTouchlineProfileTimestamp(instant, "es-ES", true), formatTouchlineProfileTimestamp(instant, "en-GB"));
  assert.equal(formatTouchlineProfileTimestamp("2026-10-04T12:30:00", "es-ES", true), null);
});

// Structural boundary only: full profile rendering requires the separately
// serialized route harness; these assertions do not claim browser/SSR proof.
test("both profile routes keep draft gate OFF and mount one brand with no duplicate nav audio", () => {
  for (const name of ["touchline-players/[player]", "touchline-coaches/[coach]"]) {
    const source = readFileSync(new URL(`../app/${name}/page.tsx`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const gates: ts.VariableDeclaration[] = [];
    const brands: ts.JsxSelfClosingElement[] = [];
    const nav: ts.JsxSelfClosingElement[] = [];
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "draftLocalesEnabled") gates.push(node);
      if (ts.isJsxSelfClosingElement(node)) {
        if (node.tagName.getText(ast) === "TouchlineBrandHeader") brands.push(node);
        if (node.tagName.getText(ast) === "TouchlineGlobalNavigation") nav.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(gates.length, 0, "gate must be an internal parameter, not a closed module constant");
    const wrapper = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
    assert.ok(wrapper && ts.isFunctionDeclaration(wrapper) && wrapper.body);
    const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
    assert.ok(call && ts.isCallExpression(call));
    const target = name.startsWith("touchline-players") ? "renderPlayerProfilePage" : "renderCoachProfilePage";
    assert.equal(call.expression.getText(ast), target);
    assert.equal(call.arguments.length, 2);
    assert.equal(call.arguments[1].getText(ast), `isTouchLineSiteLocalesEnabled("/${name}")`);
    const renderer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === target);
    assert.ok(renderer && ts.isFunctionDeclaration(renderer));
    assert.equal(renderer.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
    assert.equal(renderer.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
    if (name.startsWith("touchline-coaches")) {
      const metadata = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "generateMetadata");
      assert.ok(metadata && ts.isFunctionDeclaration(metadata) && metadata.body);
      const metadataCall = metadata.body.statements.find(ts.isReturnStatement)?.expression;
      assert.ok(metadataCall && ts.isCallExpression(metadataCall));
      assert.equal(metadataCall.expression.getText(ast), "generateCoachProfileMetadata");
      assert.equal(metadataCall.arguments[1]?.getText(ast), `isTouchLineSiteLocalesEnabled("/${name}")`);
      const privateMetadata = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "generateCoachProfileMetadata");
      assert.ok(privateMetadata && ts.isFunctionDeclaration(privateMetadata));
      assert.equal(privateMetadata.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
      assert.equal(privateMetadata.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
    }
    assert.equal(brands.length, 1);
    assert.equal(nav.length, 1);
    const audio = nav[0].attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === "showAudioControl");
    assert.ok(audio && ts.isJsxAttribute(audio) && audio.initializer && ts.isJsxExpression(audio.initializer));
    assert.equal(audio.initializer.expression?.kind, ts.SyntaxKind.FalseKeyword);
    for (const element of [...brands, ...nav]) {
      const flag = element.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === "draftLocalesEnabled");
      assert.ok(flag && ts.isJsxAttribute(flag) && flag.initializer && ts.isJsxExpression(flag.initializer));
      assert.equal(flag.initializer.expression?.getText(ast), "draftLocalesEnabled");
    }
  }
});

test("real player route SSR keeps gate and single auth receipt boundaries", async () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const cases = [
    { receipt: { data: { user: null }, error: new AuthSessionMissingError() }, mode: "guest" },
    { receipt: { data: { user: null }, error: new Error("unavailable") }, mode: "unavailable" },
    { receipt: { data: { user: { id, email: "test@example.invalid", app_metadata: { touchline_arena_access_v1: true } } }, error: null }, mode: "account" },
    { receipt: { data: { user: null }, error: new Error("rejected auth") }, mode: "throws" },
  ];
  for (const presentation of presentations) for (const { receipt, mode } of cases) {
    let authCalls = 0;
    const h = pageHarness({
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { authCalls++; if (mode === "throws") throw receipt.error; return receipt; } } }) },
      "@/lib/touchlineArena/player-profile-official": { loadTouchLineOfficialPlayerIdentity: async () => ({ status: "pending", player: null, providerPlayerId: "999", seasonId: null, seasonName: null, fetchedAt: null, stats: [], transfers: [{ id: "verified-transfer-fixture", date: "2026-10-04T12:30:00Z", fromTeamName: "Official Origin Club", toTeamName: "Official Destination Club", type: "Permanent" }], transferStatus: "live", transfersFetchedAt: "2026-10-04T12:30:00Z" }) },
      "@/lib/touchlineArena/market-value-read-model": { loadTouchlinePublicPlayerProjections: async () => ({ projections: [] }) },
      "@/lib/touchlineArena/canonical-public-player-profile-server": { resolveTouchlineCanonicalPublicPlayerProfile: async () => assert.fail("No canonical lookup for provider-only test") },
      "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: async () => ({ phase: "preseason", players: [], fixtureIds: [], expectedFixtureIds: [], snapshotId: null }) },
      "@/lib/touchlineArena/card-publication-read-model": { loadTouchlinePublishedCardPresentations: async () => new Map() },
      "@/lib/touchlineArena/player-season-statistics-server": { loadTouchLinePlayerStatisticsReadModel: async () => ({ touchlinePlayerId: null, providerPlayerId: "999", mappingStatus: "unavailable", previousCompletedSeason: emptyTouchLinePlayerSeasonStatistics(), currentSeason: emptyTouchLinePlayerSeasonStatistics(), matchHistory: [], lastFiveMatches: [], currentOrSelectedFixture: null }) },
    });
    h.setReleaseFlag(!presentation.internal && presentation.enabled ? "true" : undefined);
    const pageModule = h.load("@/app/touchline-players/[player]/page") as Record<string, (props: object, enabled?: boolean) => Promise<Element>>;
    const Page = pageModule[presentation.internal ? "internalPage" : "default"];
    assert.equal(typeof Page, "function", "private player render seam must exist");
    const output = Page({ params: Promise.resolve({ player: "999" }), searchParams: Promise.resolve({ playerId: "999", lang: presentation.locale, draftLocalesEnabled: true }) }, presentation.enabled);
    if (mode === "throws") {
      await assert.rejects(output, error => error === receipt.error);
      assert.equal(authCalls, 1);
      continue;
    }
    const tree = await output;
    const brand = walk(tree).find(node => node.props.accountLocaleContext);
    assert.ok(brand);
    assert.equal((brand.props.accountLocaleContext as { mode: string }).mode, mode);
    if (mode === "account") assert.equal((brand.props.accountLocaleContext as { accountId: string }).accountId, id);
    assert.equal(brand.props.locale, presentation.expected);
    assert.equal(brand.props.draftLocalesEnabled, presentation.enabled === true);
    assert.equal(new URL(String(brand.props.href), "https://example.test").searchParams.get("lang"), presentation.expected);
    for (const child of walk(tree).filter(node => Object.hasOwn(node.props, "draftLocalesEnabled"))) {
      assert.equal(child.props.draftLocalesEnabled, presentation.enabled === true);
      if (Object.hasOwn(child.props, "locale")) assert.equal(child.props.locale, presentation.expected);
    }
    assert.equal(authCalls, 1);
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes('dir="ltr"'));
    assert.ok(!html.includes("NaN"));
    assert.ok(html.includes("Official Origin Club"));
    assert.ok(html.includes("Official Destination Club"));
    if (presentation.expected === "ar-SA") assert.ok(html.includes("أكتوبر ٢٠٢٦"), "verified Gregorian October 2026 must not become a Hijri transfer date");
    for (const element of walk(tree)) {
      assert.equal(element.props.purchaseHref, undefined, "no active purchase offer is introduced by this fixture");
      assert.equal(element.props.contractHref, undefined, "contract gate stays closed");
      assert.equal(element.props.defaultActionHref, undefined, "feed must not invent a contract action");
    }
  }
});

test("real coach route SSR keeps one canonical account read and unchanged provider identity", async () => {
  for (const presentation of presentations) {
  let contextCalls = 0, rankingCalls = 0;
  const context = { mode: "account", accountId: "12345678-1234-1234-1234-123456789abc" };
  const h = pageHarness({
    "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: async () => { contextCalls++; return context; } },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { rankingCalls++; return { phase: "unavailable", rows: [], snapshotId: null, fixtureIds: [] }; } },
  });
  const live = h.load("@/lib/touchlineArena/live-coaches") as { TOUCHLINE_LIVE_COACHES: { coach: { providerId: string; displayName: string } }[] };
  const coach = live.TOUCHLINE_LIVE_COACHES[0].coach;
  h.setReleaseFlag(!presentation.internal && presentation.enabled ? "true" : undefined);
  const pageModule = h.load("@/app/touchline-coaches/[coach]/page") as Record<string, (props: object, enabled?: boolean) => Promise<Element>>;
  const Page = pageModule[presentation.internal ? "internalPage" : "default"];
  assert.equal(typeof Page, "function", "private coach render seam must exist");
  const tree = await Page({ params: Promise.resolve({ coach: coach.providerId }), searchParams: Promise.resolve({ lang: presentation.locale, draftLocalesEnabled: true }) }, presentation.enabled);
  const brand = walk(tree).find(node => node.props.accountLocaleContext);
  assert.ok(brand);
  assert.equal(brand.props.accountLocaleContext, context);
  assert.equal(brand.props.locale, presentation.expected);
  assert.equal(brand.props.draftLocalesEnabled, presentation.enabled === true);
  assert.equal(new URL(String(brand.props.href), "https://example.test").searchParams.get("lang"), presentation.expected);
  assert.equal(contextCalls, 1); assert.equal(rankingCalls, 1);
  const card = walk(tree).find(node => node.props.coach);
  assert.equal((card?.props.coach as { providerId: string }).providerId, coach.providerId);
  assert.equal(card?.props.draftLocalesEnabled, presentation.enabled === true);
  for (const child of walk(tree).filter(node => Object.hasOwn(node.props, "draftLocalesEnabled"))) {
    assert.equal(child.props.draftLocalesEnabled, presentation.enabled === true);
    if (Object.hasOwn(child.props, "locale")) assert.equal(child.props.locale, presentation.expected);
  }
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes(coach.displayName));
  assert.ok(html.includes('dir="ltr"'));
  }
});

test("coach metadata uses the private opt-in without translating official identity or reading data", async () => {
  const h = pageHarness({
    "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: () => assert.fail("Metadata must not read account context") },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: () => assert.fail("Metadata must not read rankings") },
  });
  const mod = h.load("@/app/touchline-coaches/[coach]/page") as Record<string, (props: object, enabled?: boolean) => Promise<{ title: string }>>;
  assert.equal(typeof mod.internalMetadata, "function");
  const live = h.load("@/lib/touchlineArena/live-coaches") as { TOUCHLINE_LIVE_COACHES: { coach: { providerId: string; displayName: string } }[] };
  const coach = live.TOUCHLINE_LIVE_COACHES[0].coach;
  for (const locale of locales) {
    const props = { params: Promise.resolve({ coach: "invalid-coach" }), searchParams: Promise.resolve({ lang: locale }) };
    assert.equal((await mod.internalMetadata(props, true)).title, getTouchlineCoachProfileCopy(locale, true).metadataFallback);
    assert.equal((await mod.generateMetadata(props)).title, getTouchlineCoachProfileCopy(locale).metadataFallback);
    assert.equal((await mod.internalMetadata(props)).title, getTouchlineCoachProfileCopy(locale).metadataFallback);
    assert.equal((await mod.internalMetadata({ ...props, params: Promise.resolve({ coach: coach.providerId }) }, true)).title, `${coach.displayName} | TouchLine England`);
  }
});

test("latent contract destination preserves draft locale without enabling the inactive offer", () => {
  const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("player.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const renderer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderPlayerProfilePage");
  assert.ok(renderer && ts.isFunctionDeclaration(renderer) && renderer.body);
  const declarations = renderer.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
  const offer = declarations.find(node => node.name.getText(ast) === "hasActiveContractOffer");
  assert.equal(offer?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  const href = declarations.find(node => node.name.getText(ast) === "marketHref")?.initializer;
  assert.ok(href && ts.isCallExpression(href));
  const actualInitializer = href.getText(ast);
  for (const locale of locales) for (const draftLocalesEnabled of [false, true]) {
    const expected = draftLocalesEnabled || locale === "pt-BR" ? locale : "en-GB";
    const actual = runInNewContext(actualInitializer, {
      touchlineArenaContractHref, locale, draftLocalesEnabled,
      exactPlayer: { sportmonksPlayerId: "999" }, card: { id: "official-id", name: "Official Player" }, club: { teamId: "official-team" },
    });
    assert.equal(actual, `/clubowner?lang=${expected}`);
  }
});
