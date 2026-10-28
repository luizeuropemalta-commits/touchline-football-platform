import assert from "node:assert/strict";
import test from "node:test";
import { mapSportmonksFixtureCoaches } from "../lib/football-data/fixture-coach-attribution.ts";
import { sanitizeProviderPayloadForPersistence } from "../lib/football-data/provider-payload-sanitize.ts";

// Synthetic identities, exercising the documented v3 coaches.meta contract.
export function coachFixture(homeCoach = 101) {
  return { id: 901, league_id: 8, season_id: 701,
    participants: [{ id: 11, meta: { location: "away" } }, { id: 10, meta: { location: "home" } }],
    coaches: [
      { id: 102, image_path: "https://cdn.sportmonks.com/private.png", meta: { fixture_id: 901, coach_id: 102, participant_id: 11 } },
      { id: homeCoach, name: "Synthetic coach", meta: { fixture_id: 901, coach_id: homeCoach, participant_id: 10 } },
    ],
  };
}

test("coach attribution uses fixture/team/provider identities, never array order or current team", () => {
  const result = mapSportmonksFixtureCoaches(coachFixture());
  assert.deepEqual(result, { status: "complete", source: "sportmonks.fixture.coaches", fixtureProviderId: "901",
    competitionProviderId: "8", seasonProviderId: "701", assignments: [
      { coachProviderId: "101", clubProviderId: "10", location: "home" },
      { coachProviderId: "102", clubProviderId: "11", location: "away" },
    ] });
  assert.deepEqual(sanitizeProviderPayloadForPersistence(result), result);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic coach|image_path|https|raw/);
  const later = mapSportmonksFixtureCoaches({ ...coachFixture(103), id: 902, coaches: coachFixture(103).coaches.map(c => ({ ...c, meta: { ...c.meta, fixture_id: 902 } })) });
  assert.equal(later.status, "complete");
  assert.equal(result.assignments[0].coachProviderId, "101", "a new coach does not mutate a historical fixture");
});

test("absent, ambiguous, foreign and malformed attribution fails closed", () => {
  const original = coachFixture();
  const variants: unknown[] = [null, {}, { ...original, coaches: undefined }, { ...original, coaches: [] },
    { ...original, id: "synthetic" }, { ...original, id: Number.MAX_SAFE_INTEGER + 1 },
    { ...original, season_id: null }, { ...original, participants: original.participants.slice(1) },
    { ...original, coaches: [original.coaches[0], original.coaches[0]] },
    { ...original, coaches: [...original.coaches, original.coaches[0]] },
    ...["fixture_id", "coach_id", "participant_id"].map(key => ({ ...original, coaches: original.coaches.map((c, i) => i ? c : { ...c, meta: { ...c.meta, [key]: 999 } }) })),
    { ...original, participants: original.participants.map(p => ({ ...p, meta: { location: "home" } })) },
  ];
  for (const variant of variants) {
    const result = mapSportmonksFixtureCoaches(variant);
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.assignments, []);
  }
});
