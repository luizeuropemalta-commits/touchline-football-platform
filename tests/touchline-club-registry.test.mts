import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_CANONICAL_CLUB_REGISTRY,
  resolveTouchlineCanonicalClub,
  touchlineCanonicalClubHubHref,
} from "../lib/touchlineArena/club-registry.ts";
import { TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE } from "../lib/football-data/twenty-club-roster-reconciliation.ts";
import { TOUCHLINE_STADIUM_CATALOG } from "../lib/touchlineArena/stadium-catalog.ts";
import { TOUCHLINE_LIVE_COACHES_BY_TEAM } from "../lib/touchlineArena/live-coaches.ts";
import { TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES } from "../lib/touchlineArena/shirt-number-colors.ts";
import { TOUCHLINE_TROPHY_FOLDER_BY_CLUB_CODE } from "../lib/touchlineArena/club-trophy-manifest.ts";
import { touchlineArenaClubTemplateForCard } from "../lib/touchlineArena/card-rules.ts";

const EXPECTED_PROVIDER_TEAM_IDS = [
  "3", "6", "8", "9", "11", "13", "14", "15", "18", "19",
  "20", "22", "51", "52", "63", "71", "78", "116", "117", "236",
] as const;

function sortedProviderIds(values: readonly string[]) {
  return [...values].sort((left, right) => Number(left) - Number(right));
}

function sortedText(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test("derives exactly the approved twenty-club identity set from demo-data", () => {
  assert.equal(TOUCHLINE_CANONICAL_CLUB_REGISTRY.length, 20);
  assert.deepEqual(
    sortedProviderIds(TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.providerTeamId)),
    [...EXPECTED_PROVIDER_TEAM_IDS],
  );
  assert.equal(new Set(TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.slug)).size, 20);
  assert.equal(new Set(TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.shortCode)).size, 20);

  for (const club of TOUCHLINE_CANONICAL_CLUB_REGISTRY) {
    assert.equal(Object.isFrozen(club), true);
    assert.equal(Object.isFrozen(club.aliases), true);
    assert.equal("source" in club, false);
  }
});

test("resolves provider ID, slug, short code and alias to one canonical identity", () => {
  const arsenal = resolveTouchlineCanonicalClub("19");
  assert.deepEqual(arsenal.ok && arsenal.club.providerTeamId, "19");

  for (const input of ["arsenal", "ARS", "arsenal fc", 19]) {
    const result = resolveTouchlineCanonicalClub(input);
    assert.equal(result.ok, true, String(input));
    if (result.ok) assert.equal(result.club.providerTeamId, "19");
  }
});

test("fails closed instead of returning Manchester City or any other club", () => {
  for (const [input, code] of [
    [null, "empty"],
    ["   ", "empty"],
    [{ teamId: "9" }, "malformed"],
    [Number.POSITIVE_INFINITY, "malformed"],
    ["Unknown FC", "unknown"],
    ["-19", "malformed"],
    ["+19", "malformed"],
    ["19!", "malformed"],
    ["19.0", "malformed"],
    ["0", "malformed"],
  ] as const) {
    const result = resolveTouchlineCanonicalClub(input);
    assert.equal(result.ok, false, String(input));
    if (!result.ok) assert.equal(result.code, code, String(input));
  }
});

test("emits ClubHub URLs only from canonical slugs, never from the first alias", () => {
  const coventry = resolveTouchlineCanonicalClub("117");
  assert.equal(coventry.ok, true);
  if (!coventry.ok) return;

  assert.notEqual(coventry.club.slug, coventry.club.aliases[0]);
  assert.equal(touchlineCanonicalClubHubHref(coventry.club), "/touchline-clubs/coventry-city");
});

test("records every existing extension against the same twenty identities without changing it", () => {
  const canonicalIds = sortedProviderIds(TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.providerTeamId));
  assert.deepEqual(sortedProviderIds(TOUCHLINE_TWENTY_CLUB_ROSTER_SCOPE.map((club) => club.providerTeamId)), canonicalIds);
  assert.deepEqual(sortedProviderIds(TOUCHLINE_STADIUM_CATALOG.map((stadium) => stadium.homeTeamProviderId)), canonicalIds);
  assert.deepEqual(sortedProviderIds(Object.keys(TOUCHLINE_LIVE_COACHES_BY_TEAM)), canonicalIds);

  assert.equal(TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES.length, 20);
  assert.deepEqual(
    sortedText(TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES.map((palette) => palette.slug)),
    sortedText(TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.slug)),
  );
  for (const palette of TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES) {
    const club = resolveTouchlineCanonicalClub(palette.slug);
    assert.equal(club.ok, true, palette.slug);
  }

  assert.equal(Object.keys(TOUCHLINE_TROPHY_FOLDER_BY_CLUB_CODE).length, 20);
  assert.deepEqual(
    sortedText(Object.keys(TOUCHLINE_TROPHY_FOLDER_BY_CLUB_CODE)),
    sortedText(TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.shortCode)),
  );
  for (const shortCode of Object.keys(TOUCHLINE_TROPHY_FOLDER_BY_CLUB_CODE)) {
    const club = resolveTouchlineCanonicalClub(shortCode);
    assert.equal(club.ok, true, shortCode);
  }

  for (const club of TOUCHLINE_CANONICAL_CLUB_REGISTRY) {
    assert.ok(
      touchlineArenaClubTemplateForCard(club.displayName, null, "ruby-red"),
      `missing card template for ${club.displayName}`,
    );
  }
});

test("permits only the P2-2 Arena adapter as the first registry consumer", () => {
  const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  assert.match(arenaSource, /from\s+["'][^"']*arena-club-registry-adapter["']/);
  assert.doesNotMatch(arenaSource, /from\s+["'][^"']*\bclub-registry["']/);
  assert.equal(arenaSource.includes("PREMIER_CLUB_VISUALS"), false);
  assert.equal(arenaSource.includes("TEAM_BUILDER_CLUB_RANK"), false);

  for (const path of [
    "../lib/touchlineArena/shirt-number-colors.ts",
    "../lib/football-data/twenty-club-roster-reconciliation.ts",
    "../lib/touchlineArena/stadium-catalog.ts",
    "../lib/touchlineArena/live-coaches.ts",
    "../lib/touchlineArena/club-trophy-manifest.ts",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.equal(source.includes("club-registry"), false, path);
  }
});
