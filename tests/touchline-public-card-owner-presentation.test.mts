import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { touchlinePlayerDataSourceLabel } from "../lib/touchlineArena/player-appearance-presentation.ts";
import { buildTouchlinePlayerCardZoomDetails } from "../lib/touchlineArena/card-zoom-details.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public player profile and ranking omit card prices while keeping ranking and total rating", () => {
  const profile = read("app/touchline-players/[player]/page.tsx");
  const ranking = read("app/touchline-player-card-rankings/page.tsx");
  assert.doesNotMatch(profile, /displayedPriceText|formatTouchlineEditorialCardPrice|text\.price|Preço do card|Card price/);
  assert.doesNotMatch(ranking, /displayPrice|formatTouchlineEditorialCardPrice|Preço do card|Card price/);
  assert.match(profile, /competition\.positionRank/);
  assert.match(profile, /\{cumulativeRatingText\}/);
  assert.match(ranking, /compareTouchLineRankedCards/);
  assert.match(ranking, /\{index \+ 1\}/);
  assert.match(ranking, /\.tl-card-rankings-row\s*\{[^}]*grid-template-columns: 64px 86px minmax\(0, 1fr\) 126px auto;/);
});

test("shared card removes only the above-head match badge and keeps total rating and real market value", () => {
  const card = read("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const zoom = read("components/touchline/cards/TouchlineCardZoom.tsx");
  assert.doesNotMatch(card, /data-arena-match-rating|\{matchRatingText\}/);
  assert.match(card, /data-card-total-rating="true"/);
  assert.match(card, /data-card-market-value-panel="true"/);
  assert.match(card, /formatTouchlineMarketValueEur\(editorialCard\.marketValueEur/);
  assert.doesNotMatch(zoom, /\{contractValue\}/);
  assert.match(zoom, /lastMatchRating\.value/); // Actual match statistics remain in details.
});

test("public statistics use TouchLine branding without inventing coverage", () => {
  assert.equal(touchlinePlayerDataSourceLabel("pt-BR"), "Fonte: TouchLine · cobertura por partida");
  assert.equal(touchlinePlayerDataSourceLabel("en-GB"), "Source: TouchLine · coverage varies by match");
});

test("public audit mockups omit illustrative card prices while preserving admin-only nominal terms", () => {
  const audit = read("components/touchline/audit/TouchlineAuditStudio.tsx");
  const publicLines = audit.split("\n").filter(line => !line.includes('route.id === "admin/cards"'));
  assert.ok(publicLines.every(line => !/£[0-9]|\{prices\[|Frame, price and status|Moldura, preço e estado/.test(line)));
  assert.match(audit, /route\.id === "admin\/cards"[^\n]*"£0"/);
});

test("shared zoom details retain football market value and independent rank/score, never card price", () => {
  const details = buildTouchlinePlayerCardZoomDetails({ locale: "en-GB", name: "Player", position: "ST",
    editorialCard: { tierKey: "diamond-gold", cardPrice: { amountMinor: 1500, currency: "GBP" },
      marketValueEur: 120000000, marketValueState: "verified", lastReviewedAt: "2026-10-03T00:00:00Z" },
    extraFields: [{ label: "Total rating", value: "42.5" }, { label: "Position rank", value: "#1" }],
  });
  assert.ok(details.fields.some(field => field.label === "Market value" && field.value.includes("120")));
  assert.ok(details.fields.some(field => field.label === "Total rating" && field.value === "42.5"));
  assert.ok(details.fields.some(field => field.label === "Position rank" && field.value === "#1"));
  assert.ok(details.fields.every(field => !/card price|preço do card/i.test(field.label)));
});

test("small mobile awards grow moderately while zoom and full-size cards retain approved scale", () => {
  const css = read("components/touchline/cards/TouchlinePublicCardPresentation.module.css");
  const card = read("components/touchline/cards/TouchlineEliteExactCard.tsx");
  assert.match(css, /@media\s*\(max-width:\s*950px\)/);
  assert.match(css, /\.surface\[data-card-small="true"\]/);
  assert.match(css, /--touchline-head-award-scale:\s*1\.1\s*;/);
  assert.match(css, /:global\(\[data-card-zoom="expanded"\]\)\s+\.surface\s*\{\s*--touchline-head-award-scale:\s*1\s*;/);
  assert.match(card, /data-card-small=\{!isEditable && scale > 0 && scale <= 0\.5 \? "true" : "false"\}/);
  assert.match(card, /var\(--touchline-head-award-scale, 1\)/);
});
