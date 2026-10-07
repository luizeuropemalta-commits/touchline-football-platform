import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as directoryCopy from "../lib/touchlineArena/club-hub-directory-i18n.ts";
import * as profileCopy from "../lib/touchlineArena/club-hub-profile-i18n.ts";
import * as rosterCopy from "../lib/touchlineArena/club-hub-roster-i18n.ts";
import * as errorCopy from "../lib/touchlineArena/public-error-i18n.ts";
import * as workflowCopy from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { touchlineFixtureStatusLabel } from "../lib/touchlineArena/match-centre.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const empty = () => null;
type CapturedProps = Record<string, unknown> & { children?: React.ReactNode };
type RenderedElement = React.ReactElement<CapturedProps>;
type PageRenderer = (props: CapturedProps, draft?: boolean) => Promise<React.ReactNode>;
const anchor = ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children);
// The real ClubHubCardLink consumes pendingLabel instead of forwarding it to DOM.
const cardLink = ({ pendingLabel, ...props }: React.ComponentProps<"a"> & { pendingLabel: string }) => {
  assert.ok(pendingLabel.length > 0);
  return anchor(props);
};
function load<T = { default: PageRenderer; isolatedRender: PageRenderer }>(path: string, modules: Record<string, unknown>, appended = "") {
  modules["@/lib/touchlineArena/site-locales-release"] = siteLocalePolicy;
  const exports = {} as T;
  const source = readFileSync(new URL(path, import.meta.url), "utf8") + appended;
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Intl, require(name: string) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      assert.ok(name in modules, name); return modules[name];
    },
  });
  return exports;
}
async function resolveTree(node: React.ReactNode): Promise<React.ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveTree));
  if (!React.isValidElement(node)) return node;
  const element = node as RenderedElement;
  if (typeof element.type === "function") {
    const component = element.type as (props: CapturedProps) => React.ReactNode | Promise<React.ReactNode>;
    const resolved = await resolveTree(await component(element.props));
    // Invoking a function manually skips React's reconciliation boundary.
    // Carry its existing list key to the replacement, never synthesize one.
    return element.key !== null && React.isValidElement(resolved)
      ? React.cloneElement(resolved, { key: element.key }) : resolved;
  }
  if (element.type === React.Suspense) return resolveTree(element.props.children);
  const children = await resolveTree(element.props.children);
  // Keep authored static siblings as separate children, while nested mapped
  // arrays retain their original keys and remain arrays for React validation.
  return Array.isArray(children)
    ? React.cloneElement(element, undefined, ...children)
    : React.cloneElement(element, undefined, children);
}

test("real directory render keeps public gate closed and explicit drafts flow through header/navigation/showcase", async () => {
  const captures: Array<{ child: string; props: CapturedProps }> = [];
  let authReads = 0;
  const leaf = (child: string) => (props: CapturedProps) => { captures.push({ child, props }); return null; };
  const route = load("../app/touchline-clubs/page.tsx", {
    "@/components/touchline/TouchlineBrandHeader": { default: leaf("header") },
    "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: async () => { authReads++; return { mode: "guest" }; } },
    "@/components/touchline/TouchlineGlobalNavigation": { default: leaf("nav") },
    "@/components/touchline/TouchlineCoachCategoryShowcase": { default: leaf("showcase") },
    "@/components/touchline/TouchlineLivePresentationRefresh": { default: empty },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => ({ snapshotId: null }) },
    "@/components/touchline/ClubHubCrestTrace": { default: empty },
    "@/components/touchline/TouchlineClubPerimeterTrace": { default: empty },
    "@/components/touchline/ClubHubCardLink": { default: cardLink },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchlinePublishedCardShowcaseCatalog: async () => [] },
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS_BY_RANK: [{ teamId: "club-id", slug: "official-club", name: "Official $& <club>", shortCode: "OFF", accent: "#fff" }] },
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/club-hub-directory-i18n": directoryCopy,
    "@/lib/touchlineFantasy/market-workflow-i18n": workflowCopy,
  }, "\nexport { renderTouchlineClubsPage as isolatedRender };");
  for (const locale of locales) {
    for (const [draft, publicRelease] of [[false, false], [true, false], [true, true]]) {
      siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED = publicRelease ? "true" : undefined;
      captures.length = 0; const before = authReads;
      const props = { searchParams: Promise.resolve({ lang: locale }) };
      const tree = draft && !publicRelease ? await route.isolatedRender(props, true) : await route.default(props);
      delete siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      const html = renderToStaticMarkup(await resolveTree(tree));
      const expectedLocale = draft || locale === "pt-BR" ? locale : "en-GB";
      assert.equal(authReads - before, 1);
      assert.ok(html.includes("Official $&amp; &lt;club&gt;"));
      assert.ok(html.includes(`/touchline-clubs/official-club?lang=${expectedLocale}`));
      assert.match(html, /<main dir="ltr"/);
      for (const child of ["header", "nav", "showcase"]) {
        const found = captures.filter(item => item.child === child); assert.equal(found.length, 1);
        assert.equal(found[0].props.locale, expectedLocale); assert.equal(found[0].props.draftLocalesEnabled, draft);
      }
      assert.equal(captures.find(item => item.child === "nav")!.props.showAudioControl, false);
    }
  }
});

test("real roster unavailable/retry presentation translates while factual names and links remain intact", () => {
  const roster = load<{ default: React.ComponentType<CapturedProps> }>("../components/touchline/ClubHubOutsideMatchRoster.tsx", {
    "@/lib/touchlineArena/club-hub-roster-i18n": rosterCopy,
    "@/lib/touchlineArena/public-error-i18n": errorCopy,
    "next/link": { default: anchor },
    "@/components/touchline/ClubHubSquadGrid": { default: empty },
    "@/components/touchline/TouchlineClubPerimeterTrace": { default: empty },
  }).default;
  for (const locale of locales) {
    const props = { clubName: "Official $& <club>", cards: [], locale, labels: {}, squadUnavailable: true, retryHref: "/touchline-clubs/official?lang=fr-FR", draftLocalesEnabled: true };
    const before = JSON.stringify(props);
    const html = renderToStaticMarkup(React.createElement(roster, props));
    const copy = rosterCopy.getTouchlineClubHubRosterCopy(locale, true);
    assert.ok(html.includes(copy.squadUnavailableTitle));
    assert.ok(html.includes(errorCopy.getTouchlinePublicErrorCopy(locale, true).error.retry));
    assert.ok(html.includes("Official $&amp; &lt;club&gt;"));
    assert.ok(html.includes('href="/touchline-clubs/official?lang=fr-FR"'));
    assert.equal(JSON.stringify(props), before);
  }
});

test("real profile status/stadium helpers preserve names and select actual draft copy without changing date calendar", () => {
  const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("profile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ["localizedFixtureStatus", "ClubHubHomeStadiumIdentity"].includes(node.name?.text ?? ""));
  assert.equal(helpers.length, 2);
  const exports = {} as { localizedFixtureStatus: (status: string, locale: string, draft?: boolean) => string; ClubHubHomeStadiumIdentity: (props: CapturedProps) => React.ReactNode };
  runInNewContext(ts.transpileModule(helpers.map(node => node.getText(ast)).join("\n") + "\nexport {localizedFixtureStatus,ClubHubHomeStadiumIdentity};", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, ...catalogueLocale, ...profileCopy, touchlineFixtureStatusLabel, require: () => jsxRuntime,
  });
  for (const [locale, expected] of [["fr-FR", "Programmé"], ["ar-SA", "مجدولة"]] as const) {
    assert.equal(exports.localizedFixtureStatus("scheduled", locale, true), expected);
    assert.equal(exports.localizedFixtureStatus("scheduled", locale), "scheduled");
    assert.equal(exports.localizedFixtureStatus("Provider_UNKNOWN", locale, true), "Provider_UNKNOWN");
    const html = renderToStaticMarkup(exports.ClubHubHomeStadiumIdentity({ locale, draftLocalesEnabled: true, stadium: { name: "Official $& <stadium>", clubProfile: { address: { city: "Official City", country: "Official Country" } } } }));
    assert.ok(html.includes("Official $&amp; &lt;stadium&gt;")); assert.ok(html.includes("Official City, Official Country"));
  }
  let dates = 0;
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(ast) === "Intl.DateTimeFormat") {
      assert.match(node.arguments?.[1]?.getText(ast) ?? "", /calendar: "gregory"/); dates++;
    }
    node.forEachChild(visit);
  }
  visit(ast); assert.equal(dates, 2);
});
