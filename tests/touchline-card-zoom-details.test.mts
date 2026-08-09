import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTouchlinePlayerCardZoomDetails } from "../lib/touchlineArena/card-zoom-details.ts";

test("uses one resolved market-value explanation for every card zoom surface", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "pt-BR",
    name: "Jogador de teste",
    clubName: "Arsenal FC",
    position: "Centroavante / ST",
    nationality: "BRA",
    marketValue: "€70m",
    marketValueSource: "provider",
    touchlinePoints: 19,
    profileHref: "/touchline-players/jogador-de-teste?lang=pt-BR",
  });

  assert.equal(details.title, "Jogador de teste");
  assert.equal(details.subtitle, "Arsenal FC · Centroavante / ST");
  assert.deepEqual(details.fields.slice(0, 4).map((field) => field.value), [
    "€\u00a070.000.000",
    "Diamante Dourado",
    "€\u00a070.000.000+",
    "£15",
  ]);
  assert.equal(details.fields[3]?.label, "Preço do card");
  assert.equal(details.fields.at(-1)?.value, "19");
  assert.equal(details.profileHref, "/touchline-players/jogador-de-teste?lang=pt-BR");
});

test("fails closed for missing provider market values instead of inventing a free tier", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Pending player",
    marketValue: null,
    marketValueSource: "unavailable",
  });

  assert.deepEqual(details.fields.slice(0, 4).map((field) => field.value), [
    "Updating",
    "Updating",
    "Updating",
    "Updating",
  ]);
});

test("keeps a canonical pending card neutral in its zoom instead of deriving a tier or price", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Pending player",
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "pending",
    classificationState: "pending",
  });

  assert.deepEqual(details.fields.slice(0, 4).map((field) => field.value), [
    "Market value pending",
    "Pending",
    "Pending",
    "Pending",
  ]);
});

test("keeps an active contract's stored tier and price when current market value is pending", () => {
  const details = buildTouchlinePlayerCardZoomDetails({
    locale: "en-GB",
    name: "Contracted player",
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "pending",
    classificationState: "pending",
    cardTier: "emerald-green",
    cardPriceAuthority: "active-contract",
    cardPriceVersion: "2026-07-premier-v1",
  });

  assert.equal(details.fields[0]?.value, "Market value pending");
  assert.equal(details.fields[1]?.value, "Emerald Green");
  assert.equal(details.fields[3]?.value, "£7");
});

test("reuses the shared player zoom details in Arena, ClubHub, ClubOwner and player profile", () => {
  const sources = [
    "../app/arena/ArenaClient.tsx",
    "../components/touchline/ClubHubSquadGrid.tsx",
    "../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
    "../app/touchline-players/[player]/page.tsx",
  ].map((source) => readFileSync(new URL(source, import.meta.url), "utf8"));

  for (const source of sources) {
    assert.match(source, /buildTouchlinePlayerCardZoomDetails/);
  }
});
