import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineMatchScoringBreakdownFields,
  buildTouchlineVerifiedMatchFactFields,
} from "../lib/touchlineArena/card-zoom-details.ts";
import { resolveTouchlinePublicEditorialCardPresentation } from "../lib/touchlineArena/editorial-card-profile.ts";

const PLAYER_ID = "d9428888-122b-11e1-b85c-61cd3cbb3210";

test("keeps confirmed match zero distinct from unavailable statistic facts", () => {
  assert.deepEqual(
    buildTouchlineVerifiedMatchFactFields({
      position: "Goalkeeper",
      statistics: { goals: 1, assists: 0, yellowCards: null, saves: 3 },
    }, "en-GB").map(({ label, value }) => ({ label, value })),
    [
      { label: "Goals", value: "1" },
      { label: "Assists", value: "0" },
      { label: "Saves", value: "3" },
      { label: "Yellow cards", value: "—" },
    ],
  );
  assert.deepEqual(
    buildTouchlineVerifiedMatchFactFields({
      position: "Defender",
      statistics: { cleanSheets: 0, redCards: 1 },
    }, "pt-BR").map(({ label, value }) => ({ label, value })),
    [
      { label: "Jogos sem sofrer gols", value: "0" },
      { label: "Cartões vermelhos", value: "1" },
    ],
  );
});

test("renders only event-backed scoring contributions instead of guessing from match points", () => {
  assert.deepEqual(
    buildTouchlineMatchScoringBreakdownFields([
      { role: "primary", eventType: "Goal", minute: 67, points: 6 },
      { role: "assist", eventType: "Goal", minute: 77, points: 3 },
    ], "en-GB"),
    [
      { label: "Match scoring", value: "Goal 67′ · +6", accent: true },
      { label: "Match scoring", value: "Assist 77′ · +3", accent: true },
    ],
  );
});

function publishedEditorialRecord(overrides: Record<string, unknown> = {}) {
  return {
    playerId: PLAYER_ID,
    tierKey: "diamond-gold",
    cardPrice: { amountMinor: 1500, currency: "GBP" },
    publicationState: "published",
    lastReviewedAt: "2026-08-10T10:15:30.000Z",
    internalNote: "Editorial-only note that must never reach the zoom.",
    internalSource: "Internal editorial review board.",
    ...overrides,
  };
}

test("renders a published manual editorial tier and price in Portuguese", () => {
  const editorialCard = resolveTouchlinePublicEditorialCardPresentation(publishedEditorialRecord());
  assert.ok(editorialCard);

  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "pt-BR",
    name: "Jogador de teste",
    clubName: "Arsenal FC",
    position: "Centroavante / ST",
    nationality: "BRA",
    editorialCard,
    profileHref: "/touchline-players/jogador-de-teste?lang=pt-BR",
  });

  assert.equal(details.eyebrow, "Perfil do card");
  assert.equal(details.title, "Jogador de teste");
  assert.equal(details.subtitle, "Arsenal FC · Centroavante / ST");
  assert.deepEqual(details.fields.map(({ label, value, accent }) => ({ label, value, accent })), [
    { label: "Tier do card", value: "Diamante Dourado", accent: true },
    { label: "Preço do card", value: "£ 15,00", accent: true },
    { label: "Clube atual", value: "Arsenal FC", accent: false },
    { label: "Posição", value: "Centroavante / ST", accent: false },
    { label: "Nacionalidade", value: "BRA", accent: false },
  ]);
  assert.equal(details.profileHref, "/touchline-players/jogador-de-teste?lang=pt-BR");
  assert.equal(details.profileLabel, "Ver perfil completo");
});

test("renders the same published editorial profile with English labels", () => {
  const editorialCard = resolveTouchlinePublicEditorialCardPresentation(publishedEditorialRecord());
  assert.ok(editorialCard);

  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Test player",
    clubName: "Arsenal FC",
    position: "Forward",
    nationality: "BRA",
    editorialCard,
  });

  assert.equal(details.eyebrow, "Card profile");
  assert.deepEqual(details.fields.map(({ label, value, accent }) => ({ label, value, accent })), [
    { label: "Card tier", value: "Diamond Gold", accent: true },
    { label: "Card price", value: "£15.00", accent: true },
    { label: "Current club", value: "Arsenal FC", accent: false },
    { label: "Position", value: "Forward", accent: false },
    { label: "Nationality", value: "BRA", accent: false },
  ]);
  assert.equal(details.profileLabel, "View full profile");
});

test("carries optional profile, history and owner-only Card Engine actions without inventing routes", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Test player",
    profileHref: "/touchline-players/test-player?lang=en-GB",
    historyHref: "/touchline-history/test-player?lang=en-GB",
    cardEngineHref: `/admin/manual-card-editorial?playerId=${PLAYER_ID}#manual-card-editor`,
  });

  assert.equal(details.profileHref, "/touchline-players/test-player?lang=en-GB");
  assert.equal(details.historyHref, "/touchline-history/test-player?lang=en-GB");
  assert.equal(
    details.cardEngineHref,
    `/admin/manual-card-editorial?playerId=${PLAYER_ID}#manual-card-editor`,
  );
  assert.equal(details.cardEngineLabel, "EDIT IN CARD ENGINE");

  const publicDetails = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Public player",
  });
  assert.equal(publicDetails.historyHref, undefined);
  assert.equal(publicDetails.cardEngineHref, undefined);
});

test("an unpublished player keeps only real identity fields with no valuation placeholder", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Unpublished player",
    position: "Midfielder",
    nationality: "ENG",
    // Legacy inputs must be ignored rather than leaking an economic state.
    marketValue: "€70m",
    marketValueSource: "provider",
    marketValueState: "pending",
    classificationState: "pending",
    cardTier: "emerald-green",
    cardPriceAuthority: "active-contract",
  });

  assert.deepEqual(details.fields.map(({ label, value, accent }) => ({ label, value, accent })), [
    { label: "Position", value: "Midfielder", accent: false },
    { label: "Nationality", value: "ENG", accent: false },
  ]);
  assert.doesNotMatch(JSON.stringify(details), /market value|market range|economic|pending|updating/i);
});

test("an incomplete real player exposes pending card price and each missing field", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Incomplete goalkeeper",
    position: "Goalkeeper",
    nationality: "NIR",
    cardReview: {
      state: "REVIEW_REQUIRED",
      missingFields: ["market_value", "shirt_number"],
    },
  });

  assert.deepEqual(details.fields.map(({ label, value, accent }) => ({ label, value, accent })), [
    { label: "Card status", value: "Review pending", accent: true },
    { label: "Card price", value: "Pending", accent: true },
    { label: "Missing field", value: "Market Value", accent: false },
    { label: "Missing field", value: "Shirt number", accent: false },
    { label: "Position", value: "Goalkeeper", accent: false },
    { label: "Nationality", value: "NIR", accent: false },
  ]);
});

test("the shared card never substitutes a football position for pending card price", () => {
  const cardSource = readFileSync(
    new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(cardSource, /hasPublishedCardProfile \|\| reviewRequired[\s\S]*?cardLabels\.cardPrice/);
  assert.match(cardSource, /reviewRequired[\s\S]*?"PENDING"[\s\S]*?: player\.position/);
});

test("the zoom receives only the public editorial projection, never internal notes or sources", () => {
  const editorialCard = resolveTouchlinePublicEditorialCardPresentation(publishedEditorialRecord());
  assert.ok(editorialCard);

  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Private notes remain private",
    editorialCard,
  });

  const serialized = JSON.stringify(details);
  assert.doesNotMatch(serialized, /editorial-only note|internal editorial review board|internalnote|internalsource/i);
  assert.deepEqual(Object.keys(editorialCard).sort(), ["cardPrice", "lastReviewedAt", "tierKey"]);
});

test("reuses the shared editorial zoom builder in ClubHub, ClubOwner and player profile", () => {
  const sources = [
    "../components/touchline/ClubHubSquadGrid.tsx",
    "../components/touchline/ClubHubOfficialLineup.tsx",
    "../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
    "../app/touchline-players/[player]/page.tsx",
  ].map((source) => readFileSync(new URL(source, import.meta.url), "utf8"));

  for (const source of sources) {
    assert.match(source, /buildTouchlinePlayerCardZoomDetails/);
  }
});

test("phone landscape keeps the complete expanded card inside the short viewport", () => {
  const zoomCss = readFileSync(
    new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url),
    "utf8",
  );

  assert.match(
    zoomCss,
    /@media \(orientation: landscape\) and \(max-height: 420px\)[\s\S]*?--touchline-card-static-scale: \.5;/,
  );
  assert.match(
    zoomCss,
    /\.panelWithDetails \.expandedMeta \{[\s\S]*?display: none;/,
  );
});

test("a detailed zoom does not repeat the tier in a detached metadata strip", () => {
  const zoomSource = readFileSync(
    new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url),
    "utf8",
  );

  assert.match(zoomSource, /contractTermLabel \|\| \(!details && tierLabel\)/);
  assert.match(zoomSource, /!details && tierLabel \? <strong>/);
});
