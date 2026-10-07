import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as arena from "../lib/touchlineArena/arena-intro.ts";
import * as accessibility from "../lib/touchlineArena/site-accessibility-i18n.ts";
import { getTouchlineIntroCopy } from "../lib/touchlineArena/intro-i18n.ts";
import { getTouchlineAmbientAudioCopy } from "../lib/touchlineArena/ambient-audio-i18n.ts";

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("intro destination labels name ClubOwner in all eight locales without changing the destination", () => {
  const expected = ["Go to ClubOwner", "Ir ao ClubOwner", "Ir a ClubOwner", "Vai a ClubOwner", "Accéder à ClubOwner", "الانتقال إلى ClubOwner", "ClubOwner’a git", "Zu ClubOwner"];
  for (const [index, locale] of locales.entries()) assert.equal(getTouchlineIntroCopy(locale, true).goToMarket, expected[index]);
  const entry = read("components/touchline/arena/TouchlineGameEntry.tsx");
  assert.match(entry, /router\.replace\(`\/clubowner\?lang=\$\{encodeURIComponent\(locale\)\}`\)/);
  assert.match(entry, /onClick=\{finish\}>\{copy\.goToMarket\}/);
});
function load<T>(path: string, modules: Record<string, unknown>, internalName?: string): T {
  modules["@/lib/touchlineArena/site-locales-release"] = siteLocalePolicy;
  const exports: Record<string, unknown> = {};
  const suffix = internalName ? `\nexports.internal = typeof ${internalName} === "function" ? ${internalName} : undefined;` : "";
  const code = ts.transpileModule(read(path) + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, require(id: string) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; } });
  if (internalName) assert.equal(typeof exports.internal, "function", `${internalName} private seam must exist`);
  return (internalName ? exports.internal : exports.default) as T;
}

test("trusted Intro renderer preserves eight locales and query intent while its default stays closed", async () => {
  const Entry = () => null;
  type Params = { lang?: string | string[]; intro?: string | string[]; skipIntro?: string | string[] };
  type Renderer = (props: { searchParams: Promise<Params> }, enabled?: boolean) => Promise<React.ReactElement<Record<string, unknown>>>;
  const modules = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/touchline/arena/TouchlineGameEntry": { __esModule: true, default: Entry },
    "@/lib/touchlineArena/arena-intro": arena,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
  };
  const internal = load<Renderer>("app/intro/page.tsx", modules, "renderIntroPage");
  const publicPage = load<Renderer>("app/intro/page.tsx", modules);
  for (const locale of locales) for (const enabled of [true, false, undefined]) {
    for (const intent of [{ intro: "replay" }, { skipIntro: "1" }, { intro: "invalid" }, {}]) {
      const params = { lang: [locale, "en-GB"], intro: intent.intro === undefined ? undefined : [intent.intro, "skip"], skipIntro: intent.skipIntro === undefined ? undefined : [intent.skipIntro, "0"] };
      const element = await internal({ searchParams: Promise.resolve(params) }, enabled);
      assert.equal(element.type, Entry);
      assert.equal(element.props.locale, enabled ? locale : locale === "pt-BR" ? "pt-BR" : "en-GB");
      assert.equal(element.props.draftLocalesEnabled, enabled === true);
      assert.equal(element.props.initialIntroIntent, arena.parseTouchlineArenaIntroIntent(intent));
      assert.deepEqual(Object.keys(element.props).sort(), ["draftLocalesEnabled", "initialIntroIntent", "locale"]);
    }
    const forged = { lang: locale, draftLocalesEnabled: true, draft: "true", intro: "replay" };
    const element = await publicPage({ searchParams: Promise.resolve(forged) }, true);
    assert.equal(element.props.locale, locale === "pt-BR" ? "pt-BR" : "en-GB");
    assert.equal(element.props.draftLocalesEnabled, false);
  }
});

test("Intro public export delegates to the server policy and private renderer defaults false", () => {
  const tree = ts.createSourceFile("page.tsx", read("app/intro/page.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "IntroPage");
  assert.ok(page && ts.isFunctionDeclaration(page) && page.body);
  const returns = page.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1);
  const call = returns[0].expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.expression.getText(tree), "renderIntroPage");
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/intro")');
  const internal = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderIntroPage");
  assert.ok(internal && ts.isFunctionDeclaration(internal));
  assert.equal(internal.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(internal.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
});

test("real Intro entry preserves eight locales only with public policy ON", async () => {
  const Entry = () => null;
  const page = load<(props: object) => Promise<React.ReactElement<Record<string, unknown>>>>("app/intro/page.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/touchline/arena/TouchlineGameEntry": { __esModule: true, default: Entry },
    "@/lib/touchlineArena/arena-intro": arena,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
  });
  try {
    for (const flag of [undefined, "false", "true"]) for (const locale of locales) {
      siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      const element = await page({searchParams:Promise.resolve({lang:locale,intro:"replay"})});
      assert.equal(element.props.locale, flag === "true" ? locale : locale === "pt-BR" ? "pt-BR" : "en-GB");
      assert.equal(element.props.draftLocalesEnabled, flag === "true");
      assert.equal(element.props.initialIntroIntent, arena.parseTouchlineArenaIntroIntent({intro:"replay"}));
    }
  } finally { delete siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});

test("actual Intro route forwards its closed opt-in and original intent without widening locale policy", async () => {
  const Entry = () => null;
  const page = load<(props: { searchParams: Promise<{ lang: string[]; intro: string }> }) => Promise<React.ReactElement<Record<string, unknown>>>>("app/intro/page.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/touchline/arena/TouchlineGameEntry": { __esModule: true, default: Entry },
    "@/lib/touchlineArena/arena-intro": arena,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
  });
  for (const locale of locales) {
    const element = await page({ searchParams: Promise.resolve({ lang: [locale, "pt-BR"], intro: "replay" }) });
    assert.equal(element.type, Entry);
    assert.equal(element.props.draftLocalesEnabled, false);
    assert.equal(element.props.locale, catalogueLocale.resolveTouchlineCatalogueLocale(locale));
    assert.equal(element.props.initialIntroIntent, arena.parseTouchlineArenaIntroIntent({ intro: "replay", skipIntro: undefined }));
  }
});

test("real orientation consumer uses explicit catalogue opt-in while preserving child, focus destination and landscape dialog", () => {
  const icon = () => React.createElement("svg");
  const Boundary = load<React.ComponentType<React.PropsWithChildren<{ locale: string; draftLocalesEnabled: boolean; skipLabel: string }>>>("components/touchline/TouchlineLandscapeBoundary.tsx", {
    react: React, "react/jsx-runtime": require("react/jsx-runtime"),
    "lucide-react": { RotateCw: icon, Smartphone: icon },
    "next/image": { __esModule: true, default: (props: Record<string, unknown>) => { const copy = { ...props }; delete copy.unoptimized; return React.createElement("img", copy); } },
    "@/lib/touchlineArena/orientation-gate": { installTouchlineOrientationGate() { throw Error("SSR must not run orientation effects"); }, TOUCHLINE_PORTRAIT_QUERY: "(orientation: portrait)" },
    "@/lib/touchlineArena/site-accessibility-i18n": accessibility,
    "./TouchlineLandscapeBoundary.module.css": { __esModule: true, default: {} },
  });
  for (const locale of locales) for (const enabled of [false, true]) {
    const copy = accessibility.getTouchlineSiteAccessibilityCopy(locale, enabled);
    const html = renderToStaticMarkup(React.createElement(Boundary, { locale, draftLocalesEnabled: enabled, skipLabel: copy.skipToMainContent }, React.createElement("main", {}, "preserved child")));
    for (const text of Object.values(copy)) assert.ok(html.includes(text), `${locale}/${enabled}: ${text}`);
    assert.match(html, /preserved child/);
    assert.match(html, /role="dialog"/);
    assert.match(html, /id="touchline-main-content"/);
    assert.equal(getTouchlineIntroCopy(locale, enabled).sound, getTouchlineAmbientAudioCopy(locale, enabled).sound);
  }
  for (const invalid of [null, undefined, "__proto__", "constructor", "invalid"]) {
    assert.deepEqual(accessibility.getTouchlineSiteAccessibilityCopy(invalid, true), accessibility.getTouchlineSiteAccessibilityCopy("en-GB"));
    assert.deepEqual(getTouchlineIntroCopy(invalid, true), getTouchlineIntroCopy("en-GB"));
  }
});
