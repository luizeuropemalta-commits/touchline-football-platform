import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveTouchlineOwnerCommercialSummary } from "../lib/touchlineArena/owner-commercial-summary.ts";
import { resolveTouchlineTablesOwnerSummary } from "../lib/touchlineArena/tables-owner-summary.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const rankingsCopySource = readFileSync(
  new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url),
  "utf8",
);

test("Tables and Market use the same canonical squad card value label", () => {
  assert.match(rankingsCopySource, /totalValue: "Squad card value"/);
  assert.match(rankingsCopySource, /totalValue: "Valor dos cards do elenco"/);
});

function publishedCard(id: string, amountMinor: number): ClubOwnerSquadCard {
  return {
    id,
    name: `Player ${id}`,
    shortName: `P${id}`,
    role: "midfielder",
    position: "Midfielder",
    clubName: "TouchLine FC",
    shirtNumber: 8,
    countryCode3: "ENG",
    marketValue: "",
    touchlinePoints: 0,
    editorialCard: {
      tierKey: "sapphire-blue",
      cardPrice: { amountMinor, currency: "GBP" },
      lastReviewedAt: "2026-08-20T10:00:00Z",
    },
  };
}

test("Tables uses the authenticated ClubOwner's published roster for its summary", () => {
  assert.deepEqual(resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: true,
    ownedContractCount: 2,
    rosterCards: [publishedCard("one", 100), publishedCard("two", 1_500)],
  }), {
    clubOwners: 1,
    cardsTracked: 2,
    nominalValueGbp: 16,
  });
});

test("Market and Tables share the same canonical commercial projection", () => {
  assert.deepEqual(resolveTouchlineOwnerCommercialSummary({
    ownedContractCount: 35,
    rosterCards: [publishedCard("one", 17_100)],
  }), {
    cardsTracked: 35,
    squadValueGbp: 171,
  });
});

test("Tables never turns an admin or signed-out roster into a ClubOwner summary", () => {
  const rosterCards = [publishedCard("one", 100)];
  assert.deepEqual(resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: false,
    ownedContractCount: 1,
    rosterCards,
  }), {
    clubOwners: 0,
    cardsTracked: 0,
    nominalValueGbp: 0,
  });
});

test("Tables rejects a non-GBP or fractional nominal value instead of inventing a total", () => {
  const wrongCurrency = publishedCard("one", 100);
  wrongCurrency.editorialCard = {
    ...wrongCurrency.editorialCard!,
    cardPrice: { amountMinor: 100, currency: "EUR" },
  };
  assert.throws(() => resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: true,
    ownedContractCount: 1,
    rosterCards: [wrongCurrency],
  }), /GBP/);
  assert.throws(() => resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: true,
    ownedContractCount: 1,
    rosterCards: [publishedCard("two", 150)],
  }), /whole pounds/);
});

test("Tables counts every active contract while valuing only current public cards", () => {
  assert.deepEqual(resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: true,
    ownedContractCount: 35,
    rosterCards: [publishedCard("one", 17_100)],
  }), {
    clubOwners: 1,
    cardsTracked: 35,
    nominalValueGbp: 171,
  });

  assert.throws(() => resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: true,
    ownedContractCount: 0,
    rosterCards: [publishedCard("one", 100)],
  }), /tracked-card count/);
});
