import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTouchlineLiveEleven,
  normalizeTouchlineLiveSquad,
  touchlineLivePlayerIdentity,
  type TouchlineLiveLineupPlayer,
} from "../lib/touchlineArena/live-lineups.ts";

const homeClub = {
  teamId: "22",
  name: "Hull City",
  shortCode: "HUL",
  logoUrl: "/hull.png",
  aliases: ["hull"],
} as const;

const awayClub = {
  teamId: "14",
  name: "Manchester United",
  shortCode: "MUN",
  logoUrl: "/united.png",
  aliases: ["man united"],
} as const;

const roles = [
  "goalkeeper",
  "defender", "defender", "defender", "defender",
  "midfielder", "midfielder", "midfielder",
  "forward", "forward", "forward",
] as const;

function playersForClub(
  club: typeof homeClub | typeof awayClub,
  prefix: string,
): TouchlineLiveLineupPlayer[] {
  return roles.map((role, index) => ({
    id: `${prefix}-${index + 1}`,
    providerId: `${prefix}-${index + 1}`,
    clubTeamId: club.teamId,
    clubName: club.name,
    clubShortCode: club.shortCode,
    clubLogoUrl: club.logoUrl,
    name: `${club.shortCode} Player ${index + 1}`,
    role,
  }));
}

test("normalizes a squad only when response and every player carry the official club id", () => {
  const hull = playersForClub(homeClub, "hul");
  const spoofed = {
    ...hull[0],
    id: "spoofed",
    providerId: "spoofed",
    clubTeamId: awayClub.teamId,
    clubName: homeClub.name,
    clubShortCode: homeClub.shortCode,
  };

  assert.equal(normalizeTouchlineLiveSquad(hull, homeClub, awayClub.teamId).length, 0);
  const normalized = normalizeTouchlineLiveSquad([...hull, spoofed], homeClub, homeClub.teamId);
  assert.equal(normalized.length, 11);
  assert.ok(normalized.every((player) => player.clubTeamId === homeClub.teamId));
  assert.ok(normalized.every((player) => player.clubName === homeClub.name));
  assert.ok(!normalized.some((player) => player.providerId === "spoofed"));
});

test("builds exactly 11 unique players per club and never reuses a player across clubs", () => {
  const homeSquad = playersForClub(homeClub, "home");
  const awaySquad = playersForClub(awayClub, "away");
  const transferredPlayer = { ...awaySquad[0], providerId: homeSquad[0].providerId };
  const awayFallback = playersForClub(awayClub, "away-fallback");

  const home = buildTouchlineLiveEleven({
    club: homeClub,
    fallback: homeSquad,
    squad: homeSquad,
  });
  const homeIds = new Set(home.map(touchlineLivePlayerIdentity));
  const away = buildTouchlineLiveEleven({
    club: awayClub,
    fallback: awayFallback,
    forbiddenPlayerIds: homeIds,
    squad: [transferredPlayer, ...awaySquad.slice(1)],
  });

  assert.equal(home.length, 11);
  assert.equal(away.length, 11);
  assert.equal(new Set(home.map(touchlineLivePlayerIdentity)).size, 11);
  assert.equal(new Set(away.map(touchlineLivePlayerIdentity)).size, 11);
  assert.ok(away.every((player) => player.clubTeamId === awayClub.teamId));
  assert.ok(away.every((player) => !homeIds.has(touchlineLivePlayerIdentity(player))));
});

test("keeps confirmed official starters first and fills incomplete feeds deterministically", () => {
  const squad = playersForClub(homeClub, "squad");
  const confirmed = [squad[8], squad[0], squad[5]];
  const result = buildTouchlineLiveEleven({
    club: homeClub,
    fallback: playersForClub(homeClub, "fallback"),
    primary: confirmed,
    squad,
  });

  assert.equal(result.length, 11);
  assert.deepEqual(result.slice(0, 3).map((player) => player.id), confirmed.map((player) => player.id));
  assert.equal(new Set(result.map(touchlineLivePlayerIdentity)).size, 11);
});
