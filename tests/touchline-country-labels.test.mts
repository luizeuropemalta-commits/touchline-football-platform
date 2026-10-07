import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { TOUCHLINE_LIVE_COACHES } from "../lib/touchlineArena/live-coaches.ts";
import { isTouchLineLocaleComplete, TOUCHLINE_COMPLETE_LOCALES } from "../lib/touchlineArena/i18n.ts";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";
import { resolveTouchlineCoachZoomPresentation } from "../lib/touchlineArena/coach-zoom-i18n.ts";
import type { TouchlineCardZoomDetails } from "../components/touchline/cards/TouchlineCardZoom.tsx";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const ptBaseline = {
  brazil: "Brasil", england: "Inglaterra", france: "França", norway: "Noruega", spain: "Espanha", portugal: "Portugal", italy: "Itália", germany: "Alemanha",
  netherlands: "Holanda", sweden: "Suécia", denmark: "Dinamarca", croatia: "Croácia", argentina: "Argentina", belgium: "Bélgica", ecuador: "Equador", egypt: "Egito",
  cameroon: "Camarões", japan: "Japão", "south korea": "Coreia do Sul", "korea republic": "Coreia do Sul", "united states": "Estados Unidos", usa: "Estados Unidos",
  austria: "Áustria", scotland: "Escócia", "republic of ireland": "República da Irlanda", "bosnia and herzegovina": "Bósnia e Herzegovina",
};
function compile(file: string, require: (name: string) => unknown) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, Intl });
  return exports;
}

test("eight country catalogues preserve all earlier names and aliases behind six closed draft gates", async () => {
  const copy = await import("../lib/touchlineArena/country-labels.ts");
  assert.ok(copy.TOUCHLINE_COUNTRY_LABEL_CATALOGUES, "eight country catalogues are required");
  assert.deepEqual(Object.keys(copy.TOUCHLINE_COUNTRY_LABEL_CATALOGUES), locales);
  assert.deepEqual(copy.TOUCHLINE_COUNTRY_LABEL_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copy.TOUCHLINE_COUNTRY_LABEL_DRAFT_STATUS, "draft");
  const keys = Object.keys(copy.TOUCHLINE_COUNTRY_LABEL_CATALOGUES["en-GB"]).sort();
  assert.equal(keys.length, 24);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(copy.TOUCHLINE_COUNTRY_LABEL_CATALOGUES[locale]).sort(), keys);
    assert.ok(Object.values(copy.TOUCHLINE_COUNTRY_LABEL_CATALOGUES[locale]).every(value => typeof value === "string" && value.trim()));
  }
  for (const [alias, expected] of Object.entries(ptBaseline)) {
    assert.equal(localizedCountryLabel(alias, "pt-BR"), expected, alias);
    const variant = ` ${alias.toUpperCase().replaceAll(" ", "_")} `;
    assert.equal(localizedCountryLabel(variant, "pt-BR"), expected, variant);
    for (const locale of ["en-GB", ...locales.slice(2), "pt", "unknown"]) assert.equal(localizedCountryLabel(variant, locale), variant);
  }
  assert.deepEqual(TOUCHLINE_COMPLETE_LOCALES, ["en-GB", "pt-BR"]);
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("explicit draft country lookup preserves unknown evidence, codes and protected names", () => {
  const translate = (value: string | null | undefined, locale: string) => localizedCountryLabel(value, locale, true);
  const expected = {
    "es-ES": ["Inglaterra", "Corea del Sur", "Estados Unidos"], "it-IT": ["Inghilterra", "Corea del Sud", "Stati Uniti"],
    "fr-FR": ["Angleterre", "Corée du Sud", "États-Unis"], "ar-SA": ["إنجلترا", "كوريا الجنوبية", "الولايات المتحدة"],
    "tr-TR": ["İngiltere", "Güney Kore", "Amerika Birleşik Devletleri"], "de-DE": ["England", "Südkorea", "Vereinigte Staaten"],
  };
  for (const [locale, labels] of Object.entries(expected)) {
    assert.equal(translate("England", locale), labels[0]);
    for (const alias of ["South Korea", "KOREA_REPUBLIC"]) assert.equal(translate(alias, locale), labels[1]);
    for (const alias of ["USA", " United_States "]) assert.equal(translate(alias, locale), labels[2]);
    // USA is the pre-existing explicit alias, not new generic ISO decoding.
    for (const value of [null, undefined, "", "ESP", "ENG", "GB", "KOR", "ZZZ", "Unverified country", "constructor", "toString", "__proto__", "TouchLine", "ClubOwner", "ClubOwner Table", "ClubHub", "Market Transfer", "TouchLine Cards League", "TouchLine Verified", "Pep Guardiola", "Wembley Stadium"]) assert.equal(translate(value, locale), value);
  }
  for (const locale of ["pt", "unknown", "ar"]) {
    assert.equal(localizedCountryLabel("England", locale, true), localizedCountryLabel("England", locale));
  }
});

test("actual coach zoom consumes the public country helper without mutating coach identity or card props", () => {
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "@/lib/touchlineArena/card-rules": { touchlineCardTierName, touchlineCardTierPalette },
    "@/lib/touchlineArena/country-labels": { localizedCountryLabel },
    "@/lib/touchlineArena/coach-zoom-i18n": { resolveTouchlineCoachZoomPresentation },
    "./TouchlineCoachCard": { default: () => null }, "./TouchlineCardZoom": { default: () => null },
  };
  const Coach = compile("../components/touchline/cards/TouchlineCoachCardZoom.tsx", name => { assert.ok(name in modules, name); return modules[name]; }).default as (props: Record<string, unknown>) => { props: { details: TouchlineCardZoomDetails; children: { props: Record<string, unknown> }; expandedContent: { props: Record<string, unknown> } } };
  const coach = Object.freeze({ providerId: "789", displayName: "Canonical Coach $&", nationality: "England" });
  for (const locale of locales) {
    const result = Coach({ locale, coach, slot: { cardTier: "ruby-red" }, clubName: "Canonical Club", countryCode3: "ENG", contract: null, profileHref: "/coach?keep=1#profile", publishedTouchlinePoints: 0 }).props;
    assert.equal(result.details.fields.find(field => field.icon === "coach-nationality")?.value, locale === "pt-BR" ? "Inglaterra" : "England");
    assert.equal(result.details.title, coach.displayName); assert.equal(result.details.profileHref, "/coach?keep=1#profile");
    for (const card of [result.children, result.expandedContent]) {
      assert.equal(card.props.coach, coach); assert.equal(card.props.countryCode3, "ENG"); assert.equal(card.props.publishedTouchlinePoints, 0);
    }
  }
  assert.equal(coach.nationality, "England");
});

test("all current coach nationalities have Portuguese presentation without changing English identity", () => {
  const expected: Record<string, string> = {
    Spain: "Espanha", Germany: "Alemanha", France: "França", Italy: "Itália", England: "Inglaterra",
    Scotland: "Escócia", Austria: "Áustria", "United States": "Estados Unidos",
    "Republic of Ireland": "República da Irlanda", "Bosnia and Herzegovina": "Bósnia e Herzegovina",
  };
  for (const { coach } of TOUCHLINE_LIVE_COACHES) {
    assert.ok(coach.nationality && expected[coach.nationality], coach.displayName);
    assert.equal(localizedCountryLabel(coach.nationality, "pt-BR"), expected[coach.nationality!]);
    assert.equal(localizedCountryLabel(coach.nationality, "en-GB"), coach.nationality);
  }
});
test("normalisation preserves earlier player labels and leaves absent or unknown evidence unchanged", () => {
  assert.equal(localizedCountryLabel(" UNITED_STATES ", "pt-BR"), "Estados Unidos");
  assert.equal(localizedCountryLabel("France", "pt-BR"), "França");
  for (const value of [null, undefined, "", "Unverified country", "ESP"]) {
    assert.equal(localizedCountryLabel(value, "pt-BR"), value);
  }
});
test("player profile, coach profile and coach zoom share the same display translator", () => {
  for (const path of ["app/touchline-players/[player]/page.tsx", "app/touchline-coaches/[coach]/page.tsx", "components/touchline/cards/TouchlineCoachCardZoom.tsx"]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /import \{ localizedCountryLabel \} from "@\/lib\/touchlineArena\/country-labels"/);
    assert.match(source, /localizedCountryLabel\(/);
  }
});
