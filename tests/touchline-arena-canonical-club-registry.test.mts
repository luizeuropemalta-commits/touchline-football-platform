import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_ARENA_CLUBS,
  findTouchlineArenaClub,
  preserveTouchlineArenaFixtureSides,
  resolveTouchlineArenaFixtureClub,
  resolveTouchlineArenaInitialClub,
} from "../lib/touchlineArena/arena-club-registry-adapter.ts";
import {
  TOUCHLINE_CANONICAL_CLUB_REGISTRY,
  touchlineCanonicalClubHubHref,
} from "../lib/touchlineArena/club-registry.ts";

function canonicalFixtureClub(source: Parameters<typeof resolveTouchlineArenaFixtureClub>[0]) {
  const result = resolveTouchlineArenaFixtureClub(source);
  assert.equal(result.kind, "canonical");
  if (result.kind !== "canonical") throw new Error("Expected a canonical fixture club.");
  return result.club;
}

test("derives Arena's twenty visible clubs and order from the canonical registry", () => {
  assert.equal(TOUCHLINE_ARENA_CLUBS.length, 20);
  assert.equal(Object.isFrozen(TOUCHLINE_ARENA_CLUBS), true);
  assert.deepEqual(
    TOUCHLINE_ARENA_CLUBS.map((club) => club.teamId).sort((left, right) => Number(left) - Number(right)),
    TOUCHLINE_CANONICAL_CLUB_REGISTRY.map((club) => club.providerTeamId).sort((left, right) => Number(left) - Number(right)),
  );
  assert.deepEqual(
    TOUCHLINE_ARENA_CLUBS.map((club) => club.shortCode),
    ["MCI", "ARS", "LIV", "CHE", "MUN", "TOT", "NEW", "AVL", "BHA", "BOU", "CRY", "EVE", "BRE", "FUL", "NFO", "LEE", "SUN", "IPS", "COV", "HUL"],
  );

  const coventry = findTouchlineArenaClub("coventry");
  assert.equal(coventry?.slug, "coventry-city");
  assert.equal(coventry?.aliases[0], "coventry");
  assert.equal(coventry && touchlineCanonicalClubHubHref(coventry), "/touchline-clubs/coventry-city");

  for (const canonical of TOUCHLINE_CANONICAL_CLUB_REGISTRY) {
    const arena = findTouchlineArenaClub(canonical.providerTeamId);
    assert.deepEqual(
      arena,
      {
        teamId: canonical.providerTeamId,
        slug: canonical.slug,
        name: canonical.displayName,
        shortCode: canonical.shortCode,
        logoUrl: canonical.logoUrl,
        accent: canonical.accent,
        secondaryAccent: canonical.secondaryAccent,
        aliases: canonical.aliases,
        touchlineRank: canonical.touchlineRank,
      },
      canonical.displayName,
    );
  }
});

test("keeps fixture provider IDs authoritative and prevents identity borrowing", () => {
  assert.equal(canonicalFixtureClub({ providerId: "19", name: "Arsenal", shortCode: "ARS" }).teamId, "19");
  assert.equal(canonicalFixtureClub({ name: "Arsenal", shortCode: "ARS" }).teamId, "19");
  assert.equal(canonicalFixtureClub({ providerId: "19" }).teamId, "19");

  const nonNumericProvider = resolveTouchlineArenaFixtureClub({ providerId: "Arsenal", name: "Arsenal" });
  assert.equal(nonNumericProvider.kind, "external");
  if (nonNumericProvider.kind === "external") assert.equal(nonNumericProvider.reason, "malformed");

  const conflict = resolveTouchlineArenaFixtureClub({ providerId: "19", name: "Aston Villa" });
  assert.deepEqual(conflict.kind === "external" && conflict.reason, "conflict");

  const unknownProvider = resolveTouchlineArenaFixtureClub({ providerId: "999", name: "Arsenal", logoUrl: "/outside.png" });
  assert.equal(unknownProvider.kind, "external");
  if (unknownProvider.kind === "external") {
    assert.equal(unknownProvider.reason, "unknown-provider-id");
    assert.deepEqual(unknownProvider.source, { name: "Arsenal", logoUrl: "/outside.png" });
  }

  const unknownProviderWithCanonicalText = resolveTouchlineArenaFixtureClub({
    providerId: "999",
    name: "Arsenal",
    shortCode: "ARS",
  });
  assert.equal(unknownProviderWithCanonicalText.kind, "external");
  if (unknownProviderWithCanonicalText.kind === "external") {
    assert.equal(unknownProviderWithCanonicalText.reason, "unknown-provider-id");
    assert.deepEqual(unknownProviderWithCanonicalText.source, { name: "Arsenal", shortCode: "ARS" });
  }

  for (const providerId of ["", "-19", "+19", "19!", "19.0", "0", Number.POSITIVE_INFINITY]) {
    const result = resolveTouchlineArenaFixtureClub({ providerId, name: "Arsenal" });
    assert.equal(result.kind, "external", String(providerId));
    if (result.kind === "external") assert.equal(result.reason, "malformed", String(providerId));
  }
});

test("fails closed for a present invalid contractClub while preserving only the absent default", () => {
  const absent = resolveTouchlineArenaInitialClub(undefined);
  assert.equal(absent.kind, "absent");
  if (absent.kind === "absent") assert.equal(absent.club.teamId, "9");

  const canonical = resolveTouchlineArenaInitialClub("19");
  assert.equal(canonical.kind, "canonical");
  if (canonical.kind === "canonical") assert.equal(canonical.club.teamId, "19");

  for (const value of ["", "999", "Arsenal", "ARS", "-19", "+19", "19!", "19.0", "0", Number.POSITIVE_INFINITY, { teamId: "9" }]) {
    const result = resolveTouchlineArenaInitialClub(value);
    assert.equal(result.kind, "unavailable", String(value));
    assert.equal("club" in result, false, String(value));
  }
});

test("preserves fixture home and away positions when only one provider side exists", () => {
  const awayOnly = { providerId: "19", name: "Arsenal" };
  const [home, away] = preserveTouchlineArenaFixtureSides(undefined, awayOnly);
  assert.equal(home, undefined);
  assert.equal(away, awayOnly);
});
