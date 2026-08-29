import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  projectTouchlinePublicPlayers,
  TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID,
  TOUCHLINE_ENGLAND_EFFECTIVE_SEASON,
} from "../lib/touchlineArena/public-player-projection.ts";

const LIVERPOOL_ID = "club-liverpool";

function sourceRows() {
  return {
    players: [
      {
        id: "player-alisson",
        provider_player_id: "129820",
        name: "Alisson Becker",
        display_name: "Alisson",
        nationality: "Brazil",
        current_club_id: LIVERPOOL_ID,
      },
      {
        id: "player-isak",
        provider_player_id: "34053",
        name: "Alexander Isak",
        display_name: "Alexander Isak",
        nationality: "Sweden",
        current_club_id: LIVERPOOL_ID,
      },
      {
        id: "player-pending",
        provider_player_id: "999999",
        name: "Pending Player",
        current_club_id: LIVERPOOL_ID,
      },
    ],
    clubs: [{
      id: LIVERPOOL_ID,
      name: "Liverpool FC",
      provider_team_id: "8",
      competition_id: "competition-england",
    }],
    competitions: [{
      id: "competition-england",
      provider_competition_id: TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID,
    }],
    memberships: [
      {
        player_id: "player-alisson",
        club_id: LIVERPOOL_ID,
        competition_id: "competition-england",
        jersey_number: 1,
        position: "GK",
        status: "active",
        source_updated_at: "2026-08-08T09:00:00.000Z",
      },
      {
        player_id: "player-isak",
        club_id: LIVERPOOL_ID,
        competition_id: "competition-england",
        jersey_number: 9,
        position: "ST",
        status: "active",
        source_updated_at: "2026-08-08T09:00:00.000Z",
      },
      {
        player_id: "player-pending",
        club_id: LIVERPOOL_ID,
        competition_id: "competition-england",
        jersey_number: 30,
        position: "MID",
        status: "active",
        source_updated_at: "2026-08-08T09:00:00.000Z",
      },
    ],
    marketValues: [
      {
        player_id: "player-alisson",
        market_value_eur: 15_000_000,
        status: "verified",
        confidence: "verified",
        verified_season: "2026/27",
        last_verified: "2026-08-01T10:00:00.000Z",
      },
      {
        player_id: "player-isak",
        market_value_eur: 85_000_000,
        status: "verified",
        confidence: "verified",
        verified_season: TOUCHLINE_ENGLAND_EFFECTIVE_SEASON,
        last_verified: "2026-08-01T10:00:00.000Z",
      },
    ],
  };
}

function projectionFor(providerPlayerId: string, expectedClubProviderTeamId?: string) {
  const result = projectTouchlinePublicPlayers(
    [providerPlayerId],
    sourceRows(),
    {
      competitionProviderId: TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID,
      effectiveSeason: TOUCHLINE_ENGLAND_EFFECTIVE_SEASON,
      expectedClubProviderTeamId,
    },
  );

  assert.equal(result.missingProviderPlayerIds.length, 0);
  assert.equal(result.projections.length, 1);
  return result.projections[0]!;
}

test("projects Alisson as Liverpool's verified €15M Amethyst card", () => {
  const projection = projectionFor("129820", "8");

  assert.equal(projection.identity.status, "verified");
  assert.equal(projection.identity.value?.displayName, "Alisson");
  assert.equal(projection.currentClub.status, "verified");
  assert.equal(projection.currentClub.value?.name, "Liverpool FC");
  assert.equal(projection.membership.status, "verified");
  assert.equal(projection.membership.value?.jerseyNumber, 1);
  assert.equal(projection.marketValue.status, "verified");
  assert.equal(projection.marketValue.value?.eur, 15_000_000);
  assert.equal(projection.classification.status, "verified");
  assert.equal(projection.classification.value?.tierKey, "amethyst-purple");
});

test("projects Isak as Liverpool #9 with verified €85M Diamond classification", () => {
  const projection = projectionFor("34053", "8");

  assert.equal(projection.identity.value?.name, "Alexander Isak");
  assert.equal(projection.currentClub.value?.name, "Liverpool FC");
  assert.equal(projection.membership.status, "verified");
  assert.equal(projection.membership.value?.jerseyNumber, 9);
  assert.equal(projection.marketValue.status, "verified");
  assert.equal(projection.marketValue.value?.eur, 85_000_000);
  assert.equal(projection.classification.status, "verified");
  assert.equal(projection.classification.value?.tierKey, "diamond-gold");
});

test("keeps a player without an approved value pending and without a public card tier", () => {
  const projection = projectionFor("999999", "8");

  assert.equal(projection.membership.status, "verified");
  assert.equal(projection.marketValue.status, "pending");
  assert.equal(projection.marketValue.value, null);
  assert.equal(projection.marketValue.reason, "market-value-pending");
  assert.equal(projection.classification.status, "pending");
  assert.equal(projection.classification.value, null);
  assert.equal(projection.classification.reason, "market-value-pending");
});

test("fails closed when an official player is requested for the wrong club", () => {
  const projection = projectionFor("129820", "99");

  assert.equal(projection.currentClub.status, "verified");
  assert.equal(projection.currentClub.value?.providerTeamId, "8");
  assert.equal(projection.membership.status, "unavailable");
  assert.equal(projection.membership.value, null);
  assert.equal(projection.membership.reason, "club-mismatch");
  assert.equal(projection.marketValue.status, "verified");
  assert.equal(projection.classification.status, "unavailable");
  assert.equal(projection.classification.value, null);
  assert.equal(projection.classification.reason, "club-mismatch");
});

test("the public squad adapter exposes only verified canonical Market Value", () => {
  const route = readFileSync(
    new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(route, /rawMarketValueEur/);
  assert.match(route, /includeMarketValues: true/);
  assert.match(route, /provider\/raw valuation data never crosses/);
  assert.match(route, /formatTouchlineMarketValueEur\(verifiedMarketValueEur, "en-GB"\)/);
  assert.match(route, /marketValueEur: verifiedMarketValueEur \?\? null/);
  assert.match(route, /editorialCard,/);
});
