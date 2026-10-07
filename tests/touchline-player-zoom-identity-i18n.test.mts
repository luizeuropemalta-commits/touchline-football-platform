import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { buildTouchlinePlayerCardZoomDetails } from "../lib/touchlineArena/card-zoom-details.ts";
import { evaluateTouchlineCardCompleteness, TOUCHLINE_CARD_REVIEW_FIELDS, touchlineCardReviewFieldLabel } from "../lib/touchlineArena/card-review-state.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

type Details = ReturnType<typeof buildTouchlinePlayerCardZoomDetails>;
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { cardStatus: "Card status", reviewPending: "Review pending", marketValue: "Market value", pending: "Pending", missingField: "Missing field", cardTier: "Card tier", provisionalValue: "Provisional value", currentClub: "Current club", position: "Position", nationality: "Nationality", cardProfile: "Card profile", performance: "Performance", performanceScope: "Total rating: season total. Match statistics: selected match.", profile: "View full profile", history: "View TouchLine history", cardEngine: "EDIT IN CARD ENGINE", missingFields: { display_name: "Display name", shirt_number: "Shirt number", nationality: "Nationality", position: "Position", market_value: "Market Value", club_asset: "Club asset" } },
  "pt-BR": { cardStatus: "Status do card", reviewPending: "Revisão pendente", marketValue: "Valor de mercado", pending: "Pendente", missingField: "Campo pendente", cardTier: "Tier do card", provisionalValue: "Valor provisório", currentClub: "Clube atual", position: "Posição", nationality: "Nacionalidade", cardProfile: "Perfil do card", performance: "Desempenho", performanceScope: "Nota total: acumulado da temporada. Estatísticas de jogo: partida selecionada.", profile: "Ver perfil completo", history: "Ver histórico TouchLine", cardEngine: "EDITAR NO CARD ENGINE", missingFields: { display_name: "Nome de exibição", shirt_number: "Número da camisa", nationality: "Nacionalidade", position: "Posição", market_value: "Valor de mercado", club_asset: "Asset do clube" } },
};
const expectedIcons = { "player-identity-status": "Award", "player-identity-missing-field": "UserRound", "player-identity-price": "BadgeDollarSign", "player-identity-tier": "Medal", "player-identity-club": "Building2", "player-identity-position": "UserRound", "player-identity-nationality": "Flag" };
const input = { locale: "en-GB", name: "Player <&> $&", clubName: "Canonical Club", position: "ST", nationality: "ENG", profileHref: "/player?keep=value#profile", historyHref: "/history?keep=value#history", cardEngineHref: "/admin?keep=value#editor" };

function compile(file: string, require: (name: string) => unknown) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require });
  return exports;
}
function panel(details: Details, locale = "en-GB") {
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
    react: { ...React, useState: () => [true, () => {}] }, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: (_, name) => (props: Record<string, unknown>) => React.createElement("svg", { ...props, "data-icon": String(name) }) }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale }, "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {}, "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
  };
  const loaded = compile("../components/touchline/cards/TouchlineCardZoom.tsx", (name) => { assert.ok(name in modules, name); return modules[name]; });
  return renderToStaticMarkup(React.createElement(loaded.TouchlineCardZoomDetailsPanel as React.ComponentType<{ details: Details; locale: string }>, { details, locale }));
}

test("namespaced identity icons preserve baseline even with contradictory translations; legacy tokens stay legacy", () => {
  for (const [icon, expected] of Object.entries(expectedIcons)) for (const label of ["Preço Nota total Gols", "الهوية", "Canonical identity"]) {
    const html = panel({ title: "Player", fields: [{ label, value: "0", group: "identity", icon }] });
    assert.ok(html.includes(`data-icon="${expected}"`), `${icon}/${label}`);
    assert.equal((html.match(/data-icon=/g) ?? []).length, 1); assert.match(html, /<dd>0<\/dd>/);
  }
  for (const icon of [undefined, "status", "missing-field", "constructor", "player-identity-unknown"]) {
    assert.match(panel({ title: "Legacy", fields: [{ label: "Goals", value: "0", group: "identity", icon }] }), /data-icon="Goal"/);
  }
});

test("actual builder binds sixteen copy fields and forwards the whole requested locale", () => {
  const requested: string[] = [];
  const sentinel = Object.fromEntries(Object.keys(baseline["en-GB"]).filter((key) => key !== "missingFields").map((key) => [key, `COPY_${key}`]));
  const native = createRequire(new URL("../lib/touchlineArena/card-zoom-details.ts", import.meta.url));
  const builder = compile("../lib/touchlineArena/card-zoom-details.ts", (name) => name === "./player-zoom-identity-i18n.ts"
    ? { getTouchlinePlayerZoomIdentityCopy: (locale: string) => { requested.push(locale); return sentinel; } } : native(name)).buildTouchlinePlayerCardZoomDetails as typeof buildTouchlinePlayerCardZoomDetails;
  const review = builder({ ...input, locale: "ar-SA", cardReview: { state: "REVIEW_REQUIRED", missingFields: ["shirt_number"] } });
  const published = builder({ ...input, locale: "es-ES", editorialCard: { tierKey: "radiant-gold", cardPrice: { amountMinor: 1500, currency: "GBP" }, lastReviewedAt: "2026-10-03", marketValueState: "provisional" } });
  const serialized = JSON.stringify([review, published]);
  for (const value of Object.values(sentinel)) assert.ok(serialized.includes(value), value);
  assert.deepEqual(requested, ["ar-SA", "es-ES"]);
});

test("one catalogue owns sixteen defaults and six review labels; EN/PT parity and six draft gates", async () => {
  const copy = await import("../lib/touchlineArena/player-zoom-identity-i18n.ts");
  assert.deepEqual(Object.keys(copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES), locales);
  assert.deepEqual(copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_DRAFT_STATUS, "draft");
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES[locale], baseline[locale]);
  for (const locale of locales) {
    const text = copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES[locale];
    assert.deepEqual(Object.keys(text).sort(), Object.keys(baseline["en-GB"]).sort());
    assert.deepEqual(Object.keys(text.missingFields), [...TOUCHLINE_CARD_REVIEW_FIELDS]);
    assert.ok(Object.values(text).filter((value) => typeof value === "string").every((value) => value.trim().length > 0));
    assert.ok(Object.values(text.missingFields).every((value) => value.trim().length > 0));
    assert.match(text.history, /TouchLine/); assert.match(text.cardEngine, /CARD ENGINE/);
    for (const field of TOUCHLINE_CARD_REVIEW_FIELDS) assert.equal(touchlineCardReviewFieldLabel(field, locale), copy.getTouchlinePlayerZoomIdentityCopy(locale).missingFields[field]);
  }
  for (const locale of [...locales.slice(2), "pt", "bad", null, undefined]) assert.equal(copy.getTouchlinePlayerZoomIdentityCopy(locale), copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES["en-GB"]);
  const reviewSource = readFileSync(new URL("../lib/touchlineArena/card-review-state.ts", import.meta.url), "utf8");
  assert.match(reviewSource, /getTouchlinePlayerZoomIdentityCopy\(locale, draftLocalesEnabled\)\.missingFields\[field\]/);
});

test("explicit draft identity selection reaches all review fields while public defaults remain closed", async () => {
  const copy = await import("../lib/touchlineArena/player-zoom-identity-i18n.ts");
  for (const locale of locales) {
    const selected = copy.getTouchlinePlayerZoomIdentityCopy(locale, true);
    assert.equal(selected, copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES[locale]);
    for (const field of TOUCHLINE_CARD_REVIEW_FIELDS) {
      assert.equal(touchlineCardReviewFieldLabel(field, locale, true), selected.missingFields[field]);
      assert.equal(touchlineCardReviewFieldLabel(field, locale, false), copy.getTouchlinePlayerZoomIdentityCopy(locale).missingFields[field]);
    }
    const details = buildTouchlinePlayerCardZoomDetails({
      ...input, locale, draftLocalesEnabled: true,
      cardReview: { state: "REVIEW_REQUIRED", missingFields: [...TOUCHLINE_CARD_REVIEW_FIELDS] },
    });
    assert.equal(details.eyebrow, selected.cardProfile);
    assert.equal(details.performanceTitle, selected.performance);
    assert.equal(details.performanceSubtitle, selected.performanceScope);
    assert.deepEqual(details.fields.filter(field => field.icon === "player-identity-missing-field").map(field => field.value), Object.values(selected.missingFields));
    assert.equal(details.title, input.name);
    assert.equal(details.profileHref, input.profileHref);
  }
  for (const locale of ["pt", "bad", null, undefined]) {
    assert.equal(copy.getTouchlinePlayerZoomIdentityCopy(locale, true), copy.TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES["en-GB"]);
  }
});

test("real builder and real panel preserve every identity state, canonical values, order and supplied URLs", async () => {
  await import("../lib/touchlineArena/player-zoom-identity-i18n.ts");
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const text = baseline[locale];
    const review = buildTouchlinePlayerCardZoomDetails({ ...input, locale, cardReview: { state: "REVIEW_REQUIRED", missingFields: [...TOUCHLINE_CARD_REVIEW_FIELDS] } });
    assert.deepEqual(review.fields.map(({ icon }) => icon), ["player-identity-status", "player-identity-price", ...TOUCHLINE_CARD_REVIEW_FIELDS.map(() => "player-identity-missing-field"), "player-identity-club", "player-identity-position", "player-identity-nationality"]);
    assert.deepEqual(review.fields.slice(0, 2).map(({ label, value }) => ({ label, value })), [{ label: text.cardStatus, value: text.reviewPending }, { label: text.marketValue, value: text.pending }]);
    for (const detail of review.fields) assert.equal(detail.group, "identity");
    const html = panel(review, locale);
    // The existing panel deliberately renders only the first five identity
    // rows. Preserve that layout contract; exercise every missing label in a
    // separate real review state, without silently expanding the panel.
    for (const detail of review.fields.slice(0, 5)) { assert.ok(html.includes(detail.label), detail.label); assert.ok(html.includes(detail.value), `${detail.label}=${detail.value}`); }
    assert.deepEqual(review.fields.slice(2, 8).map(({ value }) => value), Object.values(text.missingFields));
    for (const missingField of TOUCHLINE_CARD_REVIEW_FIELDS) {
      const single = buildTouchlinePlayerCardZoomDetails({ ...input, locale, cardReview: { state: "REVIEW_REQUIRED", missingFields: [missingField] } });
      assert.ok(panel(single, locale).includes(text.missingFields[missingField]));
    }
    for (const href of [input.profileHref, input.historyHref, input.cardEngineHref]) assert.ok(html.includes(href));
    assert.equal(review.title, input.name); assert.equal(review.eyebrow, text.cardProfile); assert.equal(review.performanceTitle, text.performance); assert.equal(review.performanceSubtitle, text.performanceScope);
    const published = buildTouchlinePlayerCardZoomDetails({ ...input, locale, editorialCard: { tierKey: "radiant-gold", cardPrice: { amountMinor: 1500, currency: "GBP" }, lastReviewedAt: "2026-10-03" } });
    assert.deepEqual(published.fields.slice(0, 2).map(({ label, icon }) => ({ label, icon })), [{ label: text.cardTier, icon: "player-identity-tier" }, { label: text.marketValue, icon: "player-identity-price" }]);
    assert.equal(published.fields[0].value, locale === "pt-BR" ? "Ouro Radiante" : "Radiant Gold");
    assert.equal(published.fields[1].value, text.pending);
    const contract = buildTouchlinePlayerCardZoomDetails({ ...input, locale, activeContractCard: { tierKey: "radiant-gold", cardPrice: "Stored contract amount" } });
    assert.deepEqual(contract.fields, published.fields);
    assert.doesNotMatch(JSON.stringify(contract), /Stored contract amount/);
    const zero = buildTouchlinePlayerCardZoomDetails({ ...input, locale, cardReview: { state: "REVIEW_REQUIRED", missingFields: [] }, marketValueState: "verified", marketValue: 0 });
    assert.equal(zero.fields.some(({ icon }) => icon === "player-identity-price"), false, "verified zero is not absent and must not create a missing-value row");
    const absent = buildTouchlinePlayerCardZoomDetails({ locale, name: "No data", clubName: null, position: null, nationality: null });
    assert.deepEqual(absent.fields, []); assert.equal(absent.profileHref, undefined); assert.equal(absent.historyHref, undefined); assert.equal(absent.cardEngineHref, undefined);
  }
});

test("overrides, legacy extra classification, history metadata and completeness remain intact", () => {
  const extras = [{ label: "Total rating", value: "0" }, { label: "Last match rating", value: "—" }, { label: "Caller history", value: "0", kind: "history" as const, historyDisplayLabel: "Canonical date" }, { label: "Caller omitted", value: null }];
  const before = JSON.stringify(extras);
  const details = buildTouchlinePlayerCardZoomDetails({ ...input, eyebrow: "Caller eyebrow", extraFields: extras });
  assert.equal(details.eyebrow, "Caller eyebrow"); assert.equal(details.fields.at(-3)?.primary, true); assert.equal(details.fields.at(-3)?.icon, "rating");
  assert.equal(details.fields.at(-1)?.historyDisplayLabel, "Canonical date"); assert.equal(details.fields.at(-1)?.kind, "history");
  assert.equal(JSON.stringify(extras), before);
  const html = panel(details); assert.match(html, /class="ratingHero"/); assert.match(html, /<span>Canonical date<\/span>0/);
  const empty = evaluateTouchlineCardCompleteness({ hasVerifiedMarketValue: false, hasClubAsset: false });
  assert.equal(empty.state, "REVIEW_REQUIRED"); assert.deepEqual(empty.missingFields, [...TOUCHLINE_CARD_REVIEW_FIELDS]);
  assert.equal(evaluateTouchlineCardCompleteness({ displayName: "Player", shirtNumber: 9, countryCode3: "ENG", position: "ST", hasVerifiedMarketValue: true, hasClubAsset: true }).state, "COMPLETE");
});
