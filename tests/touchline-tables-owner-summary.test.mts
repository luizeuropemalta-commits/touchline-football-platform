import assert from "node:assert/strict";
import test from "node:test";

import { resolveTouchlineTablesOwnerSummary } from "../lib/touchlineArena/tables-owner-summary.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

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
    rosterCards: [publishedCard("one", 100), publishedCard("two", 1_500)],
  }), {
    clubOwners: 1,
    cardsTracked: 2,
    nominalValueGbp: 16,
  });
});

test("Tables never turns an admin or signed-out roster into a ClubOwner summary", () => {
  const rosterCards = [publishedCard("one", 100)];
  assert.deepEqual(resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: false,
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
    rosterCards: [wrongCurrency],
  }), /GBP/);
  assert.throws(() => resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner: true,
    rosterCards: [publishedCard("two", 150)],
  }), /whole pounds/);
});
