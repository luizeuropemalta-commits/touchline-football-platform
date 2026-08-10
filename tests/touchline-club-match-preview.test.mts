import assert from "node:assert/strict";
import test from "node:test";

import type { TouchlineTeam } from "../lib/football-data/types.ts";
import { resolveTouchlineClubMatchPreviewTeam } from "../lib/touchlineArena/club-match-preview.ts";
import { findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";

const city = findTouchLineClub("manchester-city");
const arsenal = findTouchLineClub("arsenal");

if (!city || !arsenal) throw new Error("Expected canonical ClubHub fixtures");

function team(input: Partial<TouchlineTeam>): TouchlineTeam {
  return {
    id: input.id ?? `sportmonks:${input.providerId ?? "unknown"}`,
    providerId: input.providerId ?? "999",
    provider: "sportmonks",
    name: input.name ?? "Unknown United",
    shortCode: input.shortCode,
    logoUrl: input.logoUrl,
    source: { provider: "sportmonks", providerId: input.providerId ?? "999" },
  };
}

test("ClubHub never substitutes the current club crest for an unknown opponent", () => {
  const opponent = resolveTouchlineClubMatchPreviewTeam(
    team({ providerId: "999", name: "Unknown United", shortCode: "UU" }),
    city,
    "en-GB",
  );

  assert.equal(opponent.name, "Unknown United");
  assert.equal(opponent.shortCode, "UU");
  assert.equal(opponent.logoUrl, undefined);
  assert.equal(opponent.accent, undefined);
  assert.notEqual(opponent.logoUrl, city.logoUrl);
});

test("ClubHub uses only a canonical club crest or an explicit pending opponent", () => {
  const knownOpponent = resolveTouchlineClubMatchPreviewTeam(
    team({ providerId: arsenal.teamId, name: "Arsenal" }),
    city,
    "pt-BR",
  );
  const missingOpponent = resolveTouchlineClubMatchPreviewTeam(undefined, city, "pt-BR");
  const currentClub = resolveTouchlineClubMatchPreviewTeam(
    team({ providerId: city.teamId, name: "Manchester City" }),
    city,
    "en-GB",
  );

  assert.equal(knownOpponent.logoUrl, arsenal.logoUrl);
  assert.equal(knownOpponent.accent, arsenal.accent);
  assert.equal(missingOpponent.name, "Adversário a confirmar");
  assert.equal(missingOpponent.logoUrl, undefined);
  assert.equal(missingOpponent.accent, undefined);
  assert.equal(currentClub.logoUrl, city.logoUrl);
  assert.equal(currentClub.accent, city.accent);
});
