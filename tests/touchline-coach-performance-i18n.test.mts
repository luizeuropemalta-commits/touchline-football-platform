import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as gate from "../lib/touchlineArena/i18n.ts";
import * as card from "../lib/touchlineArena/coach-card-i18n.ts";
import * as zoom from "../lib/touchlineArena/card-zoom-i18n.ts";
import * as tables from "../lib/touchlineArena/tables-presentation-i18n.ts";
import * as match from "../lib/touchlineArena/match-centre-i18n.ts";
import * as profile from "../lib/touchlineArena/coach-profile-i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("components/touchline/cards/TouchlineCoachPerformance.tsx");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const keys = ["rank", "noContract", "panelAria", "seasonEyebrow", "officialPerformance", "totalScore", "disciplineAria", "disciplineEyebrow", "officialCards", "yellow", "red", "empty"] as const;
const reuses = ["home", "away", "performance", "wins", "draws", "losses", "season", "matches"] as const;
type Copy = Record<typeof keys[number] | typeof reuses[number], string>;
type Catalogue = typeof import("../lib/touchlineArena/coach-performance-i18n.ts");
const load = () => import("../lib/touchlineArena/coach-performance-i18n.ts");
const baseline = {
  "en-GB": ["Rank #{rank}", "No TouchLine contract", "Coach TouchLine performance", "TOUCHLINE SEASON", "Official performance", "Total score", "Coach discipline", "DISCIPLINE", "Official cards", "Yellow", "Red", "This coach has no TouchLine contract with the authenticated account. No points have been invented."],
  "pt-BR": ["Ranking #{rank}", "Sem contrato TouchLine", "Desempenho TouchLine do treinador", "TEMPORADA TOUCHLINE", "Desempenho oficial", "Pontuação total", "Disciplina do treinador", "DISCIPLINA", "Cartões oficiais", "Amarelo", "Vermelho", "Este treinador não possui contrato TouchLine com a conta autenticada. Nenhum ponto foi inventado."],
} as const;
function evaluate<T>(source: string, modules: Record<string, unknown>): T {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, Intl, require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return exports as T;
}
function view(getCopy: (locale?: string | null, draftLocalesEnabled?: boolean) => Copy) {
  return evaluate<{ default: React.ComponentType<Record<string, unknown>> }>(component, {
    "lucide-react": Object.fromEntries(["BadgeCheck", "CalendarClock", "History", "House", "PlaneTakeoff", "ShieldCheck", "Trophy"].map(name => [name, function Icon() { return React.createElement("i", { "data-icon": name }); }])),
    "@/lib/touchlineArena/coach-performance-i18n": { getTouchlineCoachPerformanceCopy: getCopy },
    "./TouchlineCoachPerformance.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }).default;
}
function draft(seen: unknown[] = []) {
  return evaluate<Catalogue>(read("lib/touchlineArena/coach-performance-i18n.ts"), {
    "./i18n.ts": gate,
    "./catalogue-locale.ts": { resolveTouchlineCatalogueLocale: (locale?: string | null, enabled = false) => { seen.push(locale); return resolveTouchlineCatalogueLocale(locale, enabled); } },
    "./coach-card-i18n.ts": card,
    "./card-zoom-i18n.ts": zoom,
    "./tables-presentation-i18n.ts": tables,
    "./match-centre-i18n.ts": match,
    "./coach-profile-i18n.ts": profile,
  });
}
const record = { wins: 0, draws: 1, losses: 2, touchlinePoints: -3 };
const competition = { snapshotId: "snapshot-$&", seasonId: "private-season-id", seasonLabel: "Official $& <season>", rank: 0, scoringVersion: "coach_scoring_v2", home: record, away: { wins: 3, draws: 4, losses: 5, touchlinePoints: 6 }, totalTouchlinePoints: 0 };
const escape = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
function render(Component: React.ComponentType<Record<string, unknown>>, props: Record<string, unknown>) {
  const before = JSON.stringify(props), html = renderToStaticMarkup(React.createElement(Component, props)); assert.equal(JSON.stringify(props), before); return html;
}

test("coach performance real public consumer forwards full locale and binds all twenty fields", () => {
  const seen: unknown[] = [], copy = Object.fromEntries([...keys, ...reuses].map(key => [key, `SENTINEL_${key} <&>${key === "rank" ? "{rank}" : ""}`])) as Copy;
  const Component = view(locale => { seen.push(locale); return copy; });
  const html = render(Component, { contract: null, competition, locale: "ar-SA" }) + render(Component, { contract: null, locale: "ar-SA" });
  assert.deepEqual(seen, ["ar-SA", "ar-SA"]);
  for (const [key, value] of Object.entries(copy)) assert.ok(html.includes(escape(value.replace("{rank}", "0"))), key);
  assert.ok(!html.includes("<season>"));
});

test("coach performance preserves twelve EN/PT literals and exact eight reuses with six drafts gated", async () => {
  const c = await load();
  assert.deepEqual(Object.keys(c.TOUCHLINE_COACH_PERFORMANCE_CATALOGUES), locales);
  assert.deepEqual(c.TOUCHLINE_COACH_PERFORMANCE_DRAFT_LOCALES, locales.slice(2)); assert.equal(c.TOUCHLINE_COACH_PERFORMANCE_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const copy = c.getTouchlineCoachPerformanceCopy(locale);
    assert.deepEqual(Object.keys(c.TOUCHLINE_COACH_PERFORMANCE_CATALOGUES[locale]), keys);
    assert.deepEqual(keys.map(key => copy[key]), baseline[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
    assert.deepEqual(reuses.map(key => copy[key]), [card.getTouchlineCoachCardCopy(locale).home, card.getTouchlineCoachCardCopy(locale).away, zoom.getTouchlineCardZoomCopy(locale).performance,
      tables.getTouchlineTablesPresentationCopy(locale).wins, tables.getTouchlineTablesPresentationCopy(locale).draws, tables.getTouchlineTablesPresentationCopy(locale).losses,
      match.getTouchlineMatchCentreCopy(locale).season, profile.getTouchlineCoachProfileCopy(locale).matches]);
    for (const value of Object.values(c.TOUCHLINE_COACH_PERFORMANCE_CATALOGUES[locale])) assert.ok(value.trim());
    assert.equal(c.TOUCHLINE_COACH_PERFORMANCE_CATALOGUES[locale].rank.match(/\{rank\}/g)?.length, 1);
  }
  for (const locale of locales.slice(2)) assert.equal(gate.isTouchLineLocaleComplete(locale), false);
  for (const locale of [undefined, null, "pt", "constructor", "unknown"]) assert.equal(c.getTouchlineCoachPerformanceCopy(locale).panelAria, baseline["en-GB"][2]);
});

test("coach performance draft SSR preserves source priority, math, IDs, null/zero and discipline validation", () => {
  const seen: unknown[] = [], c = draft(seen), Component = view(c.getTouchlineCoachPerformanceCopy);
  for (const locale of locales) {
    const copy = c.getTouchlineCoachPerformanceCopy(locale, true); assert.equal(seen.at(-1), locale);
    assert.deepEqual(reuses.map(key => copy[key]), [card.TOUCHLINE_COACH_CARD_CATALOGUES[locale].home, card.TOUCHLINE_COACH_CARD_CATALOGUES[locale].away,
      zoom.TOUCHLINE_CARD_ZOOM_CATALOGUES[locale].performance, tables.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[locale].wins,
      tables.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[locale].draws, tables.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[locale].losses,
      match.TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale].season, profile.TOUCHLINE_COACH_PROFILE_CATALOGUES[locale].matches]);
    for (const present of [false, true]) for (const count of [undefined, null, 0, 2, -1, 1.5, NaN, Infinity]) {
      const html = render(Component, { contract: null, competition: present ? competition : null, locale, draftLocalesEnabled: true, discipline: { yellowCards: count, redCards: count } });
      assert.ok(html.includes(`aria-label="${escape(copy.panelAria)}"`));
      assert.ok(html.includes(`data-coach-performance-source="${present ? "competition-ranking" : "unavailable"}"`));
      assert.ok(html.includes('aria-label="TouchLine Points">TP')); assert.ok(html.includes("Total TouchLine Points")); assert.ok(html.includes("<small>TL PTS</small>"));
      assert.ok(html.includes(`aria-label="${escape(copy.wins)}">W`)); assert.ok(html.includes(`aria-label="${escape(copy.draws)}">D`)); assert.ok(html.includes(`aria-label="${escape(copy.losses)}">L`));
      const expected = typeof count === "number" && Number.isInteger(count) && count >= 0 ? String(count) : "—";
      for (const colour of ["yellow", "red"]) assert.match(html, new RegExp(`data-coach-discipline="${colour}"[^]*?<dd>${expected}</dd>`));
      assert.ok(!html.includes('class="history"')); assert.ok(!html.includes('data-coach-contract-history="true"'));
      if (present) { assert.ok(html.includes("Official $&amp; &lt;season&gt;")); assert.ok(!html.includes("private-season-id")); assert.ok(html.includes('data-coach-competition-snapshot="snapshot-$&amp;"')); assert.ok(html.includes("<dd>15</dd>")); assert.ok(html.includes('class="totalValue">0<small>')); assert.ok(html.includes("<dd>-3</dd>")); }
      else { assert.ok(html.includes(escape(copy.empty))); assert.ok(html.includes('class="totalValue">—<small>')); }
    }
    const legacy = { id: "contract-id", status: "active", startedAt: "2026-01-02T12:00:00Z", endedAt: null, home: { ...record, touchlinePoints: 999 }, away: record, totalTouchlinePoints: 999, fixtureHistory: [] };
    const mixed = render(Component, { contract: legacy, competition, locale, draftLocalesEnabled: true }); assert.ok(!mixed.includes("999")); assert.ok(mixed.includes('data-contract-status="competition"'));
    const literalRank = "$& <rank>";
    assert.ok(render(Component, { contract: null, competition: { ...competition, rank: literalRank }, locale, draftLocalesEnabled: true }).includes(escape(copy.rank.replace("{rank}", () => literalRank))));
  }
});

test("coach performance public caller keeps contracts/history off and legacy date/history code unchanged", () => {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  assert.equal(hash(component.slice(component.indexOf("function formatDate"), component.indexOf("function RecordPanel"))), "424ac89a575389f6c257f074ce3d8aa39f421e935259eb68a3d1107a8468f691");
  assert.equal(hash(component.slice(component.indexOf("      {showHistory && contract ? ("))), "f39f189b94b11fa1ebdcd6c4269fe05a686d548af3fdef63916c68f5099f039c");
  assert.equal(hash(component.slice(component.indexOf("      ) : contract ? ("), component.indexOf("      ) : (\n        <p className"))), "7354e7da1bf6a4ee41af74fdb9498e35e6b411a455f5a0d15b5b27619049347a");
  const page = read("app/touchline-coaches/[coach]/page.tsx");
  assert.ok(page.includes("return renderCoachProfilePage(props, isTouchLineSiteLocalesEnabled(\"/touchline-coaches/[coach]\"))"));
  assert.match(page, /CoachProfilePageProps, draftLocalesEnabled = false/);
  assert.match(page, /<TouchlineCoachPerformance contract=\{null\} competition=\{competition\} locale=\{locale\} draftLocalesEnabled=\{draftLocalesEnabled\} \/>/);
  assert.match(component, /showHistory = false/); assert.match(component, /showHistory && contract/); assert.match(component, /showHistory && lifecycle\.length/);
  assert.match(component, /new Intl\.DateTimeFormat\(locale, \{ dateStyle: "medium" \}\)/);
  assert.match(component, /PRESERVED LIFECYCLE/); assert.match(component, /No eligible fixture has been completed during this contract/);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-coaches/[coach]")');
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(wrapper.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: exported, ...releasePolicy, [call.expression.getText(tree)]: (props: unknown, enabled: boolean) => ({ props, enabled }),
  });
  const invoke = exported.default as (props: unknown) => Promise<{ props: unknown; enabled: boolean }>;
  try {
    for (const flag of [undefined, "false", "TRUE", "true"]) {
      if (flag === undefined) delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      else releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
        const props = { searchParams: Promise.resolve({ lang, siteLocalesEnabled: true, draftLocalesEnabled: true, TOUCHLINE_SITE_LOCALES_ENABLED: "true" }) };
        const result = await invoke(props);
        assert.equal(result.props, props, "original route props are forwarded unchanged");
        assert.equal(result.enabled, flag === "true", lang);
      }
    }
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
