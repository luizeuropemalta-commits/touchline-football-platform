import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_LIVE_COACH_CLASSIFICATIONS,
  TOUCHLINE_LIVE_COACHES_BY_TEAM,
  TOUCHLINE_LIVE_COACHES,
  TOUCHLINE_LIVE_COACHES_FETCHED_AT,
  touchlineCompetitionCoachAssignments,
  touchlineLiveCoachForProviderId,
  touchlineLiveCoachForTeam,
} from "../lib/touchlineArena/live-coaches.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

const arenaClientSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);

const expectedCoaches = [
  ["19", "Mikel Arteta", "307", "Spain", "32", "ESP"],
  ["15", "Unai Emery", "455907", "Spain", "32", "ESP"],
  ["52", "Marco Rose", "29710", "Germany", "11", "GER"],
  ["236", "Keith Andrews", "255", "Republic of Ireland", "455", "IRL"],
  ["78", "Fabian Hürzeler", "37679", "United States", "3483", "USA"],
  ["18", "Xabi Alonso", "511", "Spain", "32", "ESP"],
  ["117", "Frank Lampard", "95", "England", "462", "ENG"],
  ["51", "Pierre Sage", "37732840", "France", "17", "FRA"],
  ["13", "David Moyes", "455355", "Scotland", "1161", "SCO"],
  ["11", "Arbeloa", "515", "Spain", "32", "ESP"],
  ["22", "Sergej Jakirović", "74546", "Bosnia and Herzegovina", "507", "BIH"],
  ["116", "Gary O'Neil", "270", "England", "462", "ENG"],
  ["71", "Daniel Farke", "460535", "Germany", "11", "GER"],
  ["8", "Andoni Iraola", "19960388", "Spain", "32", "ESP"],
  ["9", "Enzo Maresca", "107439", "Italy", "251", "ITA"],
  ["14", "Michael Carrick", "645", "England", "462", "ENG"],
  ["20", "Eddie Howe", "523911", "England", "462", "ENG"],
  ["63", "Oliver Glasner", "51518", "Austria", "143", "AUT"],
  ["3", "Régis Le Bris", "529482", "France", "17", "FRA"],
  ["6", "Roberto De Zerbi", "127889", "Italy", "251", "ITA"],
] as const;

test("keeps one authoritative Sportmonks coach snapshot for each of the 20 clubs", () => {
  assert.equal(TOUCHLINE_LIVE_COACHES_FETCHED_AT, "2026-07-27T00:00:00.000Z");
  assert.equal(Object.keys(TOUCHLINE_LIVE_COACHES_BY_TEAM).length, 20);
  assert.equal(new Set(expectedCoaches.map(([teamId]) => teamId)).size, 20);

  for (const [teamId, name, coachId, nationality, countryId, countryCode3] of expectedCoaches) {
    const result = touchlineLiveCoachForTeam(teamId);
    assert.ok(result, `missing coach for Sportmonks team ${teamId}`);
    assert.equal(result.coach.id, `sportmonks:${coachId}`);
    assert.equal(result.coach.providerId, coachId);
    assert.equal(result.coach.provider, "sportmonks");
    assert.equal(result.coach.name, name);
    assert.equal(result.coach.displayName, name);
    assert.equal(result.coach.nationality, nationality);
    assert.equal(result.coach.countryId, countryId);
    assert.equal(result.coach.teamId, teamId);
    assert.equal(result.countryCode3, countryCode3);
    assert.equal(result.coach.source.provider, "sportmonks");
    assert.equal(result.coach.source.providerId, coachId);
    assert.equal(result.coach.source.lastSyncedAt, TOUCHLINE_LIVE_COACHES_FETCHED_AT);

    const snapshot = TOUCHLINE_LIVE_COACHES_BY_TEAM[teamId];
    assert.equal(snapshot.fetchedAt, TOUCHLINE_LIVE_COACHES_FETCHED_AT);
    assert.deepEqual(snapshot.coach.source.raw, {
      id: Number(coachId),
      display_name: name,
      country_id: Number(countryId),
      team_id: Number(teamId),
      country: { id: Number(countryId), name: nationality },
    });
  }
});

test("looks coaches up by canonical team id without leaking a previous club", () => {
  assert.equal(touchlineLiveCoachForTeam(19)?.coach.name, "Mikel Arteta");
  assert.equal(touchlineLiveCoachForTeam(" 9 ")?.coach.name, "Enzo Maresca");
  assert.equal(touchlineLiveCoachForTeam("999999"), null);
  assert.equal(touchlineLiveCoachForTeam(null), null);
});

test("exposes the same canonical coach identities for secure ClubOwner selection", () => {
  assert.equal(TOUCHLINE_LIVE_COACHES.length, 20);
  assert.equal(touchlineLiveCoachForProviderId("307")?.coach.name, "Mikel Arteta");
  assert.equal(touchlineLiveCoachForProviderId(" demo-enzo-maresca "), null);
  assert.equal(touchlineLiveCoachForProviderId("unknown"), null);
});

test("distributes all 20 canonical coach assignments to the ranking reconciler", () => {
  const assignments = touchlineCompetitionCoachAssignments();

  assert.equal(assignments.length, 20);
  assert.equal(new Set(assignments.map(({ coach_provider_id }) => coach_provider_id)).size, 20);
  assert.equal(new Set(assignments.map(({ club_provider_id }) => club_provider_id)).size, 20);
  assert.deepEqual(assignments[0], { coach_provider_id: "307", club_provider_id: "19" });
});

test("uses the audited 2025/26 season evidence instead of colouring every coach Sapphire Blue", () => {
  const expectedTiers = {
    "307": "diamond-gold", // Mikel Arteta — Arsenal, 1st
    "455907": "clear-diamond", // Unai Emery — Aston Villa, 4th
    "255": "radiant-gold", // Keith Andrews — Brentford, 9th
    "37679": "emerald-green", // Fabian Hürzeler — Brighton, 8th
    "455355": "amethyst-purple", // David Moyes — Everton, 13th
    "460535": "amethyst-purple", // Daniel Farke — Leeds, 14th
    "523911": "radiant-gold", // Eddie Howe — Newcastle, 12th
    "529482": "emerald-green", // Régis Le Bris — Sunderland, 7th
  } as const;

  for (const [providerId, tierKey] of Object.entries(expectedTiers)) {
    const classification = TOUCHLINE_LIVE_COACH_CLASSIFICATIONS[providerId];
    assert.equal(classification?.tierKey, tierKey, providerId);
    assert.equal(classification?.classificationSource, "last-complete-season", providerId);
    assert.equal(classification?.sourceSeasonId, "2025-26", providerId);
  }

  // Coventry and Hull reached this league through 2025/26 promotion, so they
  // remain the approved paid Sapphire tier rather than being ranked from an
  // unrelated Premier League club.
  assert.equal(TOUCHLINE_LIVE_COACH_CLASSIFICATIONS["95"]?.classificationReason, "promoted");
  assert.equal(TOUCHLINE_LIVE_COACH_CLASSIFICATIONS["74546"]?.classificationReason, "promoted");

  // Coaches appointed after the final table are intentionally pending; their
  // current club cannot be used to manufacture historical reputation.
  assert.equal(TOUCHLINE_LIVE_COACH_CLASSIFICATIONS["511"]?.classificationReason, "classification-pending");
  assert.equal(TOUCHLINE_LIVE_COACH_CLASSIFICATIONS["19960388"]?.classificationReason, "classification-pending");

  const tierKeys = new Set(Object.values(TOUCHLINE_LIVE_COACH_CLASSIFICATIONS).map(({ tierKey }) => tierKey));
  assert.ok(tierKeys.size > 1, "coach catalogue must not collapse to one blue tier");
});

test("every selectable TouchLine England club always has its own coach", () => {
  assert.equal(TOUCHLINE_ENGLAND_CLUBS.length, 20);

  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    const coach = touchlineLiveCoachForTeam(club.teamId);
    assert.ok(coach, `missing coach for selectable club ${club.name} (${club.teamId})`);
    assert.equal(coach.coach.teamId, club.teamId);
  }
});

test("the Arena club selector cannot expose a club without a coach", () => {
  const registrySource = arenaClientSource.match(
    /const PREMIER_CLUB_VISUALS: PremierClubVisual\[] = \[([\s\S]*?)\n\];/,
  )?.[1] ?? "";
  const arenaTeamIds = [...registrySource.matchAll(/teamId: "([0-9]+)"/g)].map((match) => match[1]);

  assert.equal(arenaTeamIds.length, 20);
  assert.equal(new Set(arenaTeamIds).size, 20);
  for (const teamId of arenaTeamIds) {
    assert.ok(touchlineLiveCoachForTeam(teamId), `Arena team ${teamId} has no coach card`);
  }
});

test("freezes the authoritative registry and its Sportmonks snapshots", () => {
  const arsenal = TOUCHLINE_LIVE_COACHES_BY_TEAM["19"];

  assert.equal(Object.isFrozen(TOUCHLINE_LIVE_COACHES_BY_TEAM), true);
  assert.equal(Object.isFrozen(arsenal), true);
  assert.equal(Object.isFrozen(arsenal.coach), true);
  assert.equal(Object.isFrozen(arsenal.coach.source), true);
  assert.equal(Object.isFrozen(arsenal.coach.source.raw), true);
});
