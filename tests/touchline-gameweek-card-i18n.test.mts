import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { TouchlineCardZoomDetails } from "../components/touchline/cards/TouchlineCardZoom.tsx";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { TOUCHLINE_EXACT_CARD_CATALOGUES, getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { isTouchLineLocaleComplete, TOUCHLINE_COMPLETE_LOCALES } from "../lib/touchlineArena/i18n.ts";

type Props = Parameters<typeof import("../components/touchline/fantasy/TouchlineGameweekCard.tsx").default>[0];
type ZoomProps = {
  locale: string; ariaLabel: string; socialProviderId: string; tierAccent: string;
  details: TouchlineCardZoomDetails;
  children: React.ReactElement<Record<string, unknown>>;
  expandedContent: React.ReactElement<Record<string, unknown>>;
};
const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const fantasyClient = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const card: ClubOwnerSquadCard = {
  id: "10000000-0000-4000-8000-000000000001", canonicalPlayerId: "10000000-0000-4000-8000-000000000001", providerPlayerId: "123",
  name: "Player <&> $& محمد", shortName: "Canonical", clubName: "Manchester City", countryCode3: "ENG",
  role: "ST", position: "Striker", shirtNumber: 9, marketValue: "€1m", marketValueState: "verified", touchlinePoints: 999,
  seasonTotalRating: 0, matchRating: 7.25,
  editorialCard: { tierKey: "radiant-gold", marketValueEur: 1_000_000, marketValueState: "verified", cardPrice: { amountMinor: 1500, currency: "GBP" }, lastReviewedAt: "2026-10-03" },
};

// Real caller, converter, builder, closed zoom, panel and ExactCard artwork.
// SSR runs no effects. Only route/ranking browser boundaries and CSS modules
// are replaced; this is not DOM interaction, CSS-layout or RTL visual proof.
function fixture(reviewLocale?: typeof locales[number]) {
  const requested: Array<string | null | undefined> = [];
  const cache = new Map<string, unknown>();
  const replacements: Record<string, unknown> = {
    "next/navigation": { usePathname: () => "/clubowner" },
    "@/lib/touchlineArena/card-ranking-client": { useTouchlineActiveRanking: () => null },
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => null },
    "@/lib/touchlineArena/golden-boot-client": { useTouchlineGoldenBootPlayers: () => [] },
    "@/lib/touchlineArena/exact-card-i18n": { getTouchlineExactCardCopy: (locale?: string | null) => {
      requested.push(locale);
      return reviewLocale ? TOUCHLINE_EXACT_CARD_CATALOGUES[reviewLocale] : getTouchlineExactCardCopy(locale);
    } },
  };
  function load(specifier: string, parent: string): unknown {
    if (Object.hasOwn(replacements, specifier)) return replacements[specifier];
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return nativeRequire(specifier);
    const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
    if (base.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
    assert.ok(file, `module not found: ${base}`);
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
    if (file.endsWith(".ts")) return nativeRequire(file);
    if (cache.has(file)) return cache.get(file);
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, require: (name: string) => load(name, file), URL, URLSearchParams, Intl, console, process: { env: {} }, fetch: () => { throw Error("SSR_NETWORK_FORBIDDEN"); } });
    return exports;
  }
  const Gameweek = (load("@/components/touchline/fantasy/TouchlineGameweekCard", path.join(root, "fixture.ts")) as { default: (props: Props) => React.ReactElement<ZoomProps> }).default;
  const Panel = (load("@/components/touchline/cards/TouchlineCardZoom", path.join(root, "fixture.ts")) as { TouchlineCardZoomDetailsPanel: React.ComponentType<{ details: TouchlineCardZoomDetails; locale: string }> }).TouchlineCardZoomDetailsPanel;
  return {
    requested,
    produce(locale: string, changes: Partial<ClubOwnerSquadCard> = {}, props: Partial<Props> = {}) {
      return Gameweek({ card: { ...card, ...changes }, locale, ...props });
    },
    render(element: React.ReactElement<ZoomProps>) {
      return { card: renderToStaticMarkup(element), panel: renderToStaticMarkup(React.createElement(Panel, { details: element.props.details, locale: element.props.locale })) };
    },
  };
}
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

test("real Gameweek SSR uses canonical EN/PT ARIA and total labels, preserving literal player names", () => {
  const view = fixture();
  for (const [locale, aria, total] of [
    ["en-GB", `${card.name} TouchLine card`, "Total rating"],
    ["pt-BR", `Card TouchLine de ${card.name}`, "Nota total"],
  ]) {
    const element = view.produce(locale), html = view.render(element);
    assert.equal(element.props.ariaLabel, aria);
    assert.ok(html.card.includes(`role="button" tabindex="0" aria-label="${escape(aria)}" aria-expanded="false"`));
    assert.ok(html.panel.includes(`class="ratingHero" aria-label="${total}"`));
    assert.ok(html.panel.includes("<strong>0.00</strong>"));
    assert.doesNotMatch(html.panel, /Rating total|Total Rating/);
    assert.equal(element.props.details.title, card.name);
    assert.ok(html.card.includes("$&amp;")); assert.ok(html.card.includes("محمد"));
  }
});

test("real caller uses both existing catalogue fields for all eight review copies without opening public gates", () => {
  const expectedTotals = ["Total rating", "Nota total", "Valoración total", "Valutazione totale", "Note totale", "التقييم الإجمالي", "Toplam değerlendirme", "Gesamtbewertung"];
  for (const [index, locale] of locales.entries()) {
    const copy = TOUCHLINE_EXACT_CARD_CATALOGUES[locale];
    assert.equal(copy.cardAria.match(/\{playerName\}/g)?.length, 1); assert.match(copy.cardAria, /TouchLine/);
    assert.equal(copy.totalRating, expectedTotals[index]);
    // Review-only dependency selection: product normalizers stay untouched.
    const view = fixture(locale), element = view.produce(locale), html = view.render(element);
    assert.equal(view.requested[0], locale);
    assert.equal(element.props.ariaLabel, copy.cardAria.replace("{playerName}", () => card.name));
    assert.ok(html.card.includes(`aria-label="${escape(element.props.ariaLabel)}"`));
    assert.ok(html.panel.includes(`class="ratingHero" aria-label="${copy.totalRating}"`));
    assert.ok(html.panel.includes("lucide-star"));
    assert.ok(html.panel.includes("TouchLine Verified"));
  }
  const publicView = fixture();
  for (const locale of [...locales.slice(2), "", "unknown", "pt"]) {
    const element = publicView.produce(locale);
    assert.equal(element.props.ariaLabel, `${card.name} TouchLine card`);
    assert.equal(element.props.details.fields.find(field => field.kind === "rating-total")?.label, "Total rating");
    assert.equal(isTouchLineLocaleComplete(locale), false);
  }
  assert.deepEqual(TOUCHLINE_COMPLETE_LOCALES, ["en-GB", "pt-BR"]);
});

test("missing, zero and decimal ratings retain exact formatting and primary rating semantics", () => {
  const view = fixture();
  for (const locale of ["en-GB", "pt-BR"]) for (const [rating, expected] of [[undefined, "—"], [null, "—"], [0, "0.00"], [12.345, "12.35"]] as const) {
    const element = view.produce(locale, { seasonTotalRating: rating }), { panel } = view.render(element);
    const total = element.props.details.fields.find(field => field.kind === "rating-total");
    assert.equal(total?.value, expected); assert.equal(total?.primary, true); assert.equal(total?.accent, true);
    assert.equal(total?.group, "performance"); assert.ok(panel.includes(`<strong>${expected}</strong>`));
    assert.ok(panel.includes("lucide-star"));
    assert.equal(element.props.children.props.player && (element.props.children.props.player as { totalRating: unknown }).totalRating, rating ?? null);
  }
});

test("public Gameweek card and review presentation omit individual card prices while retaining rating and selection identity", () => {
  const view = fixture();
  const element = view.produce("en-GB");
  assert.equal(element.props.details.fields.some(field => field.kind === "player-identity-price"), false);
  const cardSource = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
  const exactCardSource = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
  // The legacy icon name refers to football market value, not a card price.
  // Preserve that verified fact in the zoom while hiding the card's price panel.
  assert.match(cardSource, /details=\{details\}/);
  assert.match(cardSource, /marketValue: card\.marketValue/);
  assert.match(cardSource, /marketValueState: card\.marketValueState/);
  assert.doesNotMatch(cardSource, /cardPrice|amountMinor/);
  assert.equal(element.props.details.fields.find(field => field.icon === "player-identity-price")?.value, "€1M");
  const rendered = view.render(element);
  assert.doesNotMatch(rendered.panel, /£15|GBP|1,500|1500/);
  assert.equal(element.props.children.props.hideMarketValuePanel, true);
  assert.equal(element.props.expandedContent.props.hideMarketValuePanel, true);
  assert.match(exactCardSource, /!hideMarketValuePanel \? <div[\s\S]*?data-card-market-value-panel/);
  assert.equal(element.props.details.fields.find(field => field.kind === "rating-total")?.value, "0.00");
  const review = fantasyClient.match(/visibleStep === "review" \? <>([\s\S]*?)\{visibleStep === "locked"/)?.[1] ?? "";
  assert.ok(review);
  assert.doesNotMatch(review, /card\?\.marketValue/);
  assert.match(review, /card\?\.name/);
});

test("real conversion, profile URL, identity and all thumbnail/zoom layout props remain unchanged", () => {
  const view = fixture(), before = JSON.stringify(card), expectedPlayer = squadCardToExactPlayer(card);
  for (const props of [{}, { compact: true }, { displayWidth: 119 }, { displayWidth: 120 }, { displayWidth: 116 }, { fitContainer: true }]) {
    const element = view.produce("pt-BR", {}, props), zoom = element.props, small = zoom.children.props, large = zoom.expandedContent.props;
    const width = "displayWidth" in props ? props.displayWidth! : "compact" in props ? 74 : 132;
    assert.equal(zoom.locale, "pt-BR"); assert.equal(zoom.socialProviderId, "123"); assert.equal(zoom.tierAccent, "#ffd85e");
    assert.deepEqual(small.player, expectedPlayer); assert.deepEqual(large.player, expectedPlayer);
    assert.equal(small.staticRenderScale, "fitContainer" in props ? undefined : width / 430);
    assert.equal(small.optimizeForLiveCompact, width <= 119); assert.equal(large.staticRenderScale, 390 / 430);
    for (const value of [small, large]) { assert.equal(value.runtimeLocaleOverride, "pt-BR"); assert.equal(value.subscribeToRanking, false); assert.equal(value.rankingMode, "preview"); assert.equal(value.forceNeonActive, true); }
    for (const key of ["enableInteractiveNeon", "showCardActions", "showProfileAction", "showSocialMetrics"]) assert.equal(small[key], false);
    assert.equal(large.playerProfileHref, zoom.details.profileHref);
    const url = new URL(zoom.details.profileHref!, "https://fixture.invalid");
    assert.equal(url.searchParams.get("cardId"), card.canonicalPlayerId); assert.equal(url.searchParams.get("lang"), "pt-BR"); assert.equal(url.searchParams.has("playerId"), false);
    assert.equal(zoom.details.title, card.name); assert.equal(zoom.details.positionKind, "outfield");
  }
  assert.equal(JSON.stringify(card), before);
});
