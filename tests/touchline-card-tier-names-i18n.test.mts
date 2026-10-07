import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as names from "../lib/touchlineArena/card-tier-names.ts";
import * as rules from "../lib/touchlineArena/card-rules.ts";
import * as details from "../lib/touchlineArena/card-zoom-details.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const keys = ["ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold", "emerald-green", "clear-diamond", "diamond-gold"] as const;
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const english = ["Red Ruby", "Blue Sapphire", "Purple Amethyst", "Radiant Gold", "Green Emerald", "Clear Diamond", "Golden Diamond"];
const portuguese = ["Rubi Vermelho", "Safira Azul", "Ametista Roxa", "Ouro Radiante", "Esmeralda Verde", "Diamante Cristalino", "Diamante Dourado"];
const palettes = [
  { accent: "#ff4d5e", secondary: "#7a111e" }, { accent: "#61c7ff", secondary: "#174b9b" },
  { accent: "#c788ff", secondary: "#58208f" }, { accent: "#ffd85e", secondary: "#91640b" },
  { accent: "#5ff0a0", secondary: "#08764a" }, { accent: "#dff8ff", secondary: "#71b7d4" },
  { accent: "#fff2a8", secondary: "#c58a15" },
];
const property = (locale: typeof locales[number]) => locale === "en-GB" ? "en" : locale === "pt-BR" ? "pt" : locale;
const source = readFileSync(new URL("../lib/touchlineArena/card-tier-names.ts", import.meta.url), "utf8");
const compiled = new Map<string, string>();

// Full real modules. The catalogue resolver is observed, never substituted;
// wrapper, builder, classification/palette and editorial projection stay real.
function fixture() {
  const requested: unknown[] = [];
  function load<T>(path: string, replacements: Record<string, unknown>): T {
    const url = new URL(path, import.meta.url);
    if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    const exports = {};
    const nativeRequire = createRequire(url);
    runInNewContext(compiled.get(path)!, { exports, require: (name: string) => Object.hasOwn(replacements, name) ? replacements[name] : nativeRequire(name) });
    return exports as T;
  }
  const tierNames = load<typeof names>("../lib/touchlineArena/card-tier-names.ts", {
    "./catalogue-locale.ts": { resolveTouchlineCatalogueLocale: (locale: string, enabled = false) => {
      requested.push(locale);
      return catalogueLocale.resolveTouchlineCatalogueLocale(locale, enabled);
    } },
  });
  const tierRules = load<typeof rules>("../lib/touchlineArena/card-rules.ts", { "./card-tier-names.ts": tierNames });
  const builder = load<typeof details>("../lib/touchlineArena/card-zoom-details.ts", { "./card-rules.ts": tierRules });
  requested.length = 0; // Static market labels initialize through the same API.
  return { tierNames, tierRules, builder, requested };
}

test("seven stable IDs retain exact fourteen EN/PT names, legacy en/pt fields and English alias/default", () => {
  assert.deepEqual(names.TOUCHLINE_CARD_TIER_KEYS, keys);
  assert.deepEqual(Object.keys(names.TOUCHLINE_CARD_TIER_NAMES), keys);
  for (const [index, key] of keys.entries()) {
    const row = names.TOUCHLINE_CARD_TIER_NAMES[key];
    assert.equal(row.en, english[index]); assert.equal(row.pt, portuguese[index]);
    assert.equal(names.touchlineCardTierName(key, "en-GB"), english[index]);
    assert.equal(names.touchlineCardTierName(key, "en"), english[index]);
    assert.equal(names.touchlineCardTierName(key), english[index]);
    assert.equal(names.touchlineCardTierName(key, "pt-BR"), portuguese[index]);
  }
});

test("single canonical map has seven by eight names and forty-two explicitly unapproved draft entries", () => {
  assert.equal(names.TOUCHLINE_CARD_TIER_NAME_DRAFT_STATUS, "draft");
  assert.deepEqual(names.TOUCHLINE_CARD_TIER_NAME_DRAFT_LOCALES, locales.slice(2));
  for (const key of keys) {
    const row = names.TOUCHLINE_CARD_TIER_NAMES[key] as Record<string, string>;
    assert.deepEqual(Object.keys(row).sort(), locales.map(property).sort());
    for (const locale of locales) {
      assert.ok(row[property(locale)]?.trim(), `${key}/${locale}`);
      assert.doesNotMatch(row[property(locale)], /TODO|FIXME|\{[^}]+\}/);
      if (locale !== "en-GB" && locale !== "pt-BR") assert.notEqual(row[property(locale)], row.en);
    }
  }
  assert.match(source, /draft/i);
  assert.match(source, /not approved/i);
});

test("normalizer owns runtime locale: all six drafts and unknown locales remain English", () => {
  const actual = fixture();
  for (const [index, key] of keys.entries()) for (const locale of [...locales, "en", "pt", "invalid", ""]) {
    actual.requested.length = 0;
    const result = actual.tierNames.touchlineCardTierName(key, locale);
    assert.deepEqual(actual.requested, [locale]);
    assert.equal(result, locale === "pt-BR" ? portuguese[index] : english[index]);
    assert.equal(names.touchlineCardTierName(key, locale), result);
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("real delegated wrapper resolves all fifty-six review names and preserves null/undefined starting tier", () => {
  const actual = fixture();
  for (const key of keys) for (const locale of locales) {
    actual.requested.length = 0;
    const expected = (names.TOUCHLINE_CARD_TIER_NAMES[key] as Record<string, string>)[property(locale)];
    assert.ok(expected);
    assert.equal(actual.tierRules.touchlineCardTierName(key, locale, true), expected);
    assert.deepEqual(actual.requested, [locale]);
  }
  for (const tier of [null, undefined]) for (const locale of locales) {
    assert.equal(actual.tierRules.touchlineCardTierName(tier, locale, true), (names.TOUCHLINE_CARD_TIER_NAMES["ruby-red"] as Record<string, string>)[property(locale)]);
  }
  assert.equal(actual.tierRules.touchlineCardTierName(undefined, "en"), "Red Ruby");
});

test("real player builder follows explicit draft opt-in; identity, facts and links remain intact", () => {
  const actual = fixture();
  for (const key of keys) for (const locale of locales) {
    const input: Parameters<typeof details.buildTouchlinePlayerCardZoomDetails>[0] = {
      locale, draftLocalesEnabled: true, name: "Canonical $& Player", clubName: "Canonical Club", position: "GK", positionKind: "goalkeeper", nationality: "ENG",
      editorialCard: { tierKey: key, marketValueEur: 12_500_000, marketValueState: "verified", cardPrice: { amountMinor: 1500, currency: "GBP" }, lastReviewedAt: "2026-10-03" },
      profileHref: "/canonical-profile?id=123", historyHref: "/canonical-history?id=123",
      extraFields: [{ label: "Caller total", value: "0", kind: "rating-total", primary: true }, { label: "Caller absent", value: "—", kind: "stat" }, { label: "Caller omitted", value: null, kind: "stat" }],
    };
    const before = JSON.stringify(input);
    const baseline = details.buildTouchlinePlayerCardZoomDetails(input);
    const built = actual.builder.buildTouchlinePlayerCardZoomDetails(input);
    const expected = (names.TOUCHLINE_CARD_TIER_NAMES[key] as Record<string, string>)[property(locale)];
    const tierFields = built.fields.filter((field) => field.icon === "player-identity-tier");
    assert.equal(tierFields.length, 1); assert.equal(tierFields[0].value, expected);
    const exceptTierName = (value: typeof built) => ({ ...value, fields: value.fields.map((field) => field.icon === "player-identity-tier" ? { ...field, value: "TIER_NAME_ONLY" } : field) });
    assert.equal(JSON.stringify(exceptTierName(built)), JSON.stringify(exceptTierName(baseline)));
    assert.equal(built.title, input.name); assert.equal(built.positionKind, "goalkeeper");
    assert.equal(built.profileHref, input.profileHref); assert.equal(built.historyHref, input.historyHref);
    assert.ok(built.fields.some((field) => field.label === "Caller total" && field.value === "0"));
    assert.ok(built.fields.some((field) => field.label === "Caller absent" && field.value === "—"));
    assert.ok(!built.fields.some((field) => field.label === "Caller omitted"));
    assert.equal(JSON.stringify(input), before);
  }
});

test("locale changes never alter tier identity, canonical palettes, static English labels or classification", () => {
  const actual = fixture();
  assert.deepEqual(rules.TOUCHLINE_CARD_TIER_KEYS, keys);
  assert.deepEqual(keys.map((key) => rules.touchlineCardTierPalette(key)), palettes);
  const baseline = JSON.stringify(rules.TOUCHLINE_ARENA_MARKET_TIERS);
  for (const [index, key] of keys.entries()) for (const locale of locales) {
    actual.tierRules.touchlineCardTierName(key, locale);
    assert.equal(actual.tierRules.touchlineArenaTierForKey(key)?.key, key);
    assert.equal(JSON.stringify(actual.tierRules.touchlineCardTierPalette(key)), JSON.stringify(palettes[index]));
  }
  assert.equal(JSON.stringify(actual.tierRules.TOUCHLINE_ARENA_MARKET_TIERS), baseline);
});
