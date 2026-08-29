import assert from "node:assert/strict";
import test from "node:test";

import { groupTouchLinePlayerSeasonMemberships } from "../lib/football-data/player-season-membership-grouping.ts";

const competition = "england";
const season = "2026-27";

const memberships = [
  { football_player_id: "ethan-pinnock", competition_id: competition, season_id: season, club_id: "brentford", source_synced_at: "2026-08-22T18:37:01.823Z" },
  { football_player_id: "ethan-pinnock", competition_id: competition, season_id: season, club_id: "coventry", source_synced_at: "2026-08-29T16:13:02.799Z" },
  { football_player_id: "nico-gonzalez", competition_id: competition, season_id: season, club_id: "manchester-city", source_synced_at: "2026-08-23T15:11:03.851Z" },
  { football_player_id: "nico-gonzalez", competition_id: competition, season_id: season, club_id: "newcastle", source_synced_at: "2026-08-29T17:57:02.448Z" },
  { football_player_id: "omar-marmoush", competition_id: competition, season_id: season, club_id: "manchester-city", source_synced_at: "2026-08-23T15:11:03.851Z" },
  { football_player_id: "omar-marmoush", competition_id: competition, season_id: season, club_id: "tottenham", source_synced_at: "2026-08-29T17:57:02.448Z" },
];

test("same-season transfers produce one aggregate key while preserving every historical membership", () => {
  const groups = groupTouchLinePlayerSeasonMemberships(memberships);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => group.canonicalMembership.club_id), [
    "coventry",
    "newcastle",
    "tottenham",
  ]);
  assert.deepEqual(groups.map((group) => group.historicalMemberships.length), [2, 2, 2]);
  assert.equal(new Set(groups.map((group) => group.key)).size, groups.length);
});

test("grouping is deterministic and idempotent when the database returns rows in another order", () => {
  const forward = groupTouchLinePlayerSeasonMemberships(memberships);
  const reversed = groupTouchLinePlayerSeasonMemberships([...memberships].reverse());

  assert.deepEqual(reversed, forward);
  assert.deepEqual(groupTouchLinePlayerSeasonMemberships(forward.flatMap((group) => group.historicalMemberships)), forward);
});

test("an invalid or absent source timestamp fails closed to deterministic club identity", () => {
  const [group] = groupTouchLinePlayerSeasonMemberships([
    { football_player_id: "player", competition_id: competition, season_id: season, club_id: "z-club", source_synced_at: null },
    { football_player_id: "player", competition_id: competition, season_id: season, club_id: "a-club", source_synced_at: "invalid" },
  ]);

  assert.equal(group.canonicalMembership.club_id, "a-club");
});
