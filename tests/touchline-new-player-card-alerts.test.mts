import assert from "node:assert/strict";
import test from "node:test";

import { findTouchlineNewPlayerCardAlerts } from "../lib/touchlineArena/new-player-card-alerts.ts";

const COMPETITION_ID = "11111111-2222-4333-8444-555555555555";
const CLUB_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const PLAYER_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    playerId: PLAYER_ID,
    playerName: "Alex Example",
    clubId: CLUB_ID,
    clubName: "Example FC",
    position: "Midfielder",
    detectedAt: "2026-08-11T12:00:00.000Z",
    providerPlayerId: "12345",
    currentClubId: CLUB_ID,
    activeSportmonksMemberships: [{ clubId: CLUB_ID, competitionId: COMPETITION_ID }],
    publicationStatus: null,
    ...overrides,
  };
}

test("a canonical new player creates an Admin-only market-value-required alert", () => {
  assert.deepEqual(findTouchlineNewPlayerCardAlerts({
    competitionId: COMPETITION_ID,
    candidates: [candidate()],
  }), [{
    playerId: PLAYER_ID,
    playerName: "Alex Example",
    clubName: "Example FC",
    position: "Midfielder",
    detectedAt: "2026-08-11T12:00:00.000Z",
    providerPlayerId: "12345",
    state: "market_value_required",
    label: "NEW PLAYER · MARKET VALUE REQUIRED",
  }]);
});

test("alert context keeps optional internal identity and fails closed to null presentation fields", () => {
  assert.deepEqual(findTouchlineNewPlayerCardAlerts({
    competitionId: COMPETITION_ID,
    candidates: [candidate({ position: "  ", detectedAt: "not-a-date", providerPlayerId: "  " })],
  }), [{
    playerId: PLAYER_ID,
    playerName: "Alex Example",
    clubName: "Example FC",
    position: null,
    detectedAt: null,
    providerPlayerId: null,
    state: "market_value_required",
    label: "NEW PLAYER · MARKET VALUE REQUIRED",
  }]);
});

test("reviewed or published cards never reappear as new-player alerts", () => {
  for (const publicationStatus of ["ready_for_review", "ready_to_publish", "published", "archived"]) {
    assert.deepEqual(findTouchlineNewPlayerCardAlerts({
      competitionId: COMPETITION_ID,
      candidates: [candidate({ publicationStatus })],
    }), []);
  }
});

test("ambiguous, transferred or out-of-scope identities fail closed", () => {
  for (const overrides of [
    { currentClubId: "99999999-7777-4888-8999-aaaaaaaaaaaa" },
    { activeSportmonksMemberships: [] },
    { activeSportmonksMemberships: [
      { clubId: CLUB_ID, competitionId: COMPETITION_ID },
      { clubId: CLUB_ID, competitionId: COMPETITION_ID },
    ] },
    { activeSportmonksMemberships: [{ clubId: CLUB_ID, competitionId: "11111111-2222-4333-8444-555555555556" }] },
  ]) {
    assert.deepEqual(findTouchlineNewPlayerCardAlerts({
      competitionId: COMPETITION_ID,
      candidates: [candidate(overrides)],
    }), []);
  }
});
