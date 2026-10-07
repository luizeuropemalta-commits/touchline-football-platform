import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { TouchlineCardZoomDetails } from "../components/touchline/cards/TouchlineCardZoom.tsx";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";

type CopyModule = typeof import("../lib/touchlineArena/coach-zoom-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { currentClub: "Current club", nationality: "Nationality", role: "Role", firstTeamCoach: "First-team coach", dateOfBirth: "Date of birth", cardTier: "Card tier", competitionRank: "Competition rank", homeRecord: "Home · W-D-L", homePoints: "Home points", awayRecord: "Away · W-D-L", awayPoints: "Away points", status: "TouchLine status", verifiedIdentity: "Verified identity", matchEvidence: "Match evidence", awaitingVerifiedData: "Awaiting verified data", coachEyebrow: "TouchLine coach", record: "TouchLine record", verifiedOnly: "Verified evidence only", profile: "View full profile", openCard: "Open {coachName} coach card" },
  "pt-BR": { currentClub: "Clube atual", nationality: "Nacionalidade", role: "Função", firstTeamCoach: "Treinador principal", dateOfBirth: "Data de nascimento", cardTier: "Nível do card", competitionRank: "Posição na competição", homeRecord: "Casa · V-E-D", homePoints: "Pontos em casa", awayRecord: "Fora · V-E-D", awayPoints: "Pontos fora", status: "Estado TouchLine", verifiedIdentity: "Identidade verificada", matchEvidence: "Evidência de partidas", awaitingVerifiedData: "Aguardando dados verificados", coachEyebrow: "Treinador TouchLine", record: "Registo TouchLine", verifiedOnly: "Apenas evidência verificada", profile: "Ver perfil completo", openCard: "Ampliar card de {coachName}" },
};
const competition = { rank: 3, seasonLabel: "Official season", totalTouchlinePoints: 0, home: { wins: 2, draws: 1, losses: 0, touchlinePoints: 7 }, away: { wins: 0, draws: 1, losses: 3, touchlinePoints: -3 } };
const contract = { totalTouchlinePoints: 99, home: { wins: 4, draws: 0, losses: 0, touchlinePoints: 12 }, away: { wins: 2, draws: 0, losses: 0, touchlinePoints: 12 }, currentFixture: { context: "home" } };
type ZoomProps = { locale: string; details: TouchlineCardZoomDetails; ariaLabel: string; children: React.ReactElement<Record<string, unknown>>; expandedContent: React.ReactElement<Record<string, unknown>> };

function fixture(copy?: Partial<CopyModule>) {
  const formatLocales: { kind: string; locale: string; options?: unknown }[] = [];
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
    react: { ...React, useState: () => [true, () => {}] }, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: (_, name) => (props: Record<string, unknown>) => React.createElement("svg", { ...props, "data-icon": String(name) }) }),
    "@/lib/touchlineArena/card-rules": { touchlineCardTierPalette, touchlineCardTierName: (tier: string, locale: string) => { formatLocales.push({ kind: "tier", locale }); return touchlineCardTierName(tier, locale); } },
    "@/lib/touchlineArena/country-labels": { localizedCountryLabel: (country: string, locale: string) => { formatLocales.push({ kind: "country", locale }); return localizedCountryLabel(country, locale); } },
    "@/lib/touchlineArena/coach-zoom-i18n": copy,
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale }, "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {},
    "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
    "./TouchlineCoachCard": { default: () => null }, "./TouchlineCardZoom": { default: () => null },
  };
  function compile(file: string) {
    const exports: Record<string, unknown> = {};
    runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, Intl: { DateTimeFormat: function(locale: string, options: Intl.DateTimeFormatOptions) { formatLocales.push({ kind: "date", locale, options }); return new Intl.DateTimeFormat(locale, options); } },
      require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
    });
    return exports;
  }
  const Coach = compile("../components/touchline/cards/TouchlineCoachCardZoom.tsx").default as (props: Record<string, unknown>) => React.ReactElement<ZoomProps>;
  const Panel = compile("../components/touchline/cards/TouchlineCardZoom.tsx").TouchlineCardZoomDetailsPanel as React.ComponentType<Record<string, unknown>>;
  return {
    formatLocales,
    produce(locale: string, records: object = { competition, contract }, coach: object = { displayName: "Coach <&> $&", nationality: "Portugal", dateOfBirth: "1980-02-03" }) {
      return Coach({ locale, coach, slot: { cardTier: "ruby-red" }, clubName: "Canonical Club", profileHref: "/touchline-coaches/789?lang=unchanged", publishedTouchlinePoints: 88, showLeadershipCrown: true, ...records }).props;
    },
    render(props: ZoomProps) { return renderToStaticMarkup(React.createElement(Panel, { details: props.details, locale: props.locale })); },
  };
}

test("producer binds every copy key and normalizes once for copy and all formatters", () => {
  const seen: string[] = [];
  const copy = Object.fromEntries(Object.keys(baseline["en-GB"]).map((key) => [key, `${key}_SENTINEL${key === "openCard" ? " {coachName}" : ""}`])) as typeof baseline["en-GB"];
  const view = fixture({ resolveTouchlineCoachZoomPresentation: (locale) => { seen.push(String(locale)); return { locale: "en-GB", copy }; } });
  const populated = view.produce("pt-BR");
  const empty = view.produce("pt-BR", { competition: null, contract: null });
  const serialized = JSON.stringify([populated.details, empty.details, populated.ariaLabel]);
  for (const key of Object.keys(copy)) assert.ok(serialized.includes(`${key}_SENTINEL`), key);
  assert.deepEqual(seen, ["pt-BR", "pt-BR"]);
  assert.ok(view.formatLocales.every(({ locale }) => locale === "en-GB"));
  assert.equal(populated.details.fields.find(({ value }) => value === "#3")?.icon, "coach-rank");
  assert.equal(populated.ariaLabel, "openCard_SENTINEL Coach <&> $&");
  assert.equal(populated.locale, "pt-BR", "caller prop handoff stays unchanged");
});

test("twenty labels preserve exact EN/PT, protected names, eight catalogues and six draft gates", async () => {
  const copy = await import("../lib/touchlineArena/coach-zoom-i18n.ts");
  const all = copy.TOUCHLINE_COACH_ZOOM_CATALOGUES;
  assert.deepEqual(Object.keys(all), locales);
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(all[locale], baseline[locale]);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(all[locale]).sort(), Object.keys(baseline["en-GB"]).sort());
    assert.equal(Object.values(all[locale]).length, 20); assert.ok(Object.values(all[locale]).every((text) => text.trim().length > 0));
    for (const key of ["coachEyebrow", "status", "record"] as const) assert.match(all[locale][key], /TouchLine/);
    assert.equal(all[locale].openCard.split("{coachName}").length, 2);
  }
  assert.deepEqual(copy.TOUCHLINE_COACH_ZOOM_DRAFT_LOCALES, locales.slice(2)); assert.equal(copy.TOUCHLINE_COACH_ZOOM_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "pt", "bad", null, undefined]) {
    const result = copy.resolveTouchlineCoachZoomPresentation(locale);
    assert.equal(result.locale, "en-GB"); assert.equal(result.copy, all["en-GB"]);
  }
});

test("real catalogue to producer to panel preserves EN/PT copy, canonical values, names and card handoffs", async () => {
  const copy = await import("../lib/touchlineArena/coach-zoom-i18n.ts");
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const view = fixture(copy), props = view.produce(locale), text = baseline[locale];
    const fields = props.details.fields;
    assert.deepEqual(Array.from(fields, ({ label }) => label), [text.currentClub, text.nationality, text.role, text.dateOfBirth, text.cardTier, text.competitionRank, "TouchLine Points", text.homeRecord, text.homePoints, text.awayRecord, text.awayPoints]);
    assert.deepEqual(Array.from(fields.filter(({ group }) => group === "performance"), ({ value }) => value), ["#3", "0", "2-1-0", "7", "0-1-3", "-3"]);
    assert.equal(props.details.title, "Coach <&> $&"); assert.equal(props.details.profileHref, "/touchline-coaches/789?lang=unchanged");
    assert.equal(props.details.performanceSubtitle, "Official season"); assert.equal(props.details.profileActionKind, "coach");
    assert.equal(props.ariaLabel, text.openCard.replace("{coachName}", () => "Coach <&> $&"));
    const html = view.render(props); assert.match(html, /Coach &lt;&amp;&gt; \$&amp;/); assert.ok(html.includes(text.profile)); assert.match(html, /TouchLine Points/);
    assert.match(html, /<strong>0<\/strong>/); assert.match(html, /<strong>-3<\/strong>/);
    assert.ok(view.formatLocales.every((entry) => entry.locale === locale));
    assert.equal((view.formatLocales.find(({ kind }) => kind === "date")?.options as Intl.DateTimeFormatOptions).timeZone, "UTC");
    for (const card of [props.children, props.expandedContent]) { assert.equal(card.props.locale, locale); assert.equal(card.props.publishedTouchlinePoints, 88); assert.equal(card.props.showLeadershipCrown, true); }
    const fallback = view.produce(locale, { competition: null, contract });
    assert.equal(fallback.details.fields.find(({ label }) => label === "TouchLine Points")?.value, "99");
    assert.equal(fallback.details.performanceSubtitle, text.verifiedOnly);
    const missing = view.produce(locale, { competition: null, contract: null }, { displayName: "Canonical Coach" });
    assert.equal(missing.details.fields.filter(({ group }) => group === "identity").length, 3);
    assert.deepEqual(Array.from(missing.details.fields.filter(({ group }) => group === "performance"), ({ value }) => value), [text.verifiedIdentity, text.awaitingVerifiedData]);
    assert.doesNotMatch(view.render(missing), /class="ratingHero"/);
  }
});

test("closed draft locales use English copy and formatter locale without changing caller links or props", async () => {
  const copy = await import("../lib/touchlineArena/coach-zoom-i18n.ts");
  for (const locale of locales.slice(2)) {
    const view = fixture(copy), props = view.produce(locale);
    assert.equal(props.details.performanceTitle, "TouchLine record");
    assert.ok(view.formatLocales.every((entry) => entry.locale === "en-GB"));
    assert.equal(props.details.fields.find(({ value }) => value === "#3")?.icon, "coach-rank");
    assert.equal(props.locale, locale); assert.equal(props.details.profileHref, "/touchline-coaches/789?lang=unchanged");
  }
});

test("future admitted full locales reach formatters and real copy via isolated resolver without opening gates", async () => {
  const actual = await import("../lib/touchlineArena/coach-zoom-i18n.ts");
  for (const locale of locales) {
    const copy = actual.TOUCHLINE_COACH_ZOOM_CATALOGUES[locale];
    const seen: string[] = [];
    const view = fixture({ resolveTouchlineCoachZoomPresentation: (value) => { seen.push(String(value)); return { locale, copy }; } });
    for (const records of [{ competition, contract }, { competition: null, contract: null }]) {
      const props = view.produce(locale, records), html = view.render(props);
      assert.equal(props.details.performanceTitle, copy.record);
      assert.equal(props.details.fields.find(({ icon }) => icon === "coach-role")?.value, copy.firstTeamCoach);
      assert.ok(html.includes(copy.profile)); assert.ok(html.includes(copy.currentClub));
      assert.equal(props.details.fields.find(({ value }) => value === "#3")?.icon, records.competition ? locale === "pt-BR" ? "coach-rank-position" : "coach-rank" : undefined);
    }
    assert.deepEqual(seen, [locale, locale]); assert.ok(view.formatLocales.every((entry) => entry.locale === locale));
  }
});
