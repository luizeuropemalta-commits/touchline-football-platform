export type FixtureCoachAssignment = Readonly<{
  coachProviderId: string;
  clubProviderId: string;
  location: "home" | "away";
}>;

export type FixtureCoachAttribution = Readonly<{
  status: "complete";
  source: "sportmonks.fixture.coaches";
  fixtureProviderId: string;
  competitionProviderId: string;
  seasonProviderId: string;
  assignments: readonly FixtureCoachAssignment[];
}> | Readonly<{
  status: "unavailable";
  reason: "fixture-coaches-missing-or-invalid";
  assignments: readonly [];
}>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function id(value: unknown): string | null {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  return (typeof value === "string" || typeof value === "number") && /^[1-9]\d{0,15}$/.test(String(value)) ? String(value) : null;
}

/** Normalize only the documented fixture-specific link, never coach.team_id,
 * names, event cards or the current selectable coach catalogue.
 * https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/coaches
 * This is imported evidence, not editorial approval or permission to publish.
 */
export function mapSportmonksFixtureCoaches(value: unknown): FixtureCoachAttribution {
  const missing = (): FixtureCoachAttribution => ({ status: "unavailable", reason: "fixture-coaches-missing-or-invalid", assignments: [] });
  const fixture = record(value);
  const fixtureProviderId = id(fixture.id);
  const competitionProviderId = id(fixture.league_id);
  const seasonProviderId = id(fixture.season_id);
  if (!fixtureProviderId || !competitionProviderId || !seasonProviderId
    || !Array.isArray(fixture.participants) || fixture.participants.length !== 2
    || !Array.isArray(fixture.coaches) || fixture.coaches.length !== 2) return missing();
  const assignments: FixtureCoachAssignment[] = [];
  for (const location of ["home", "away"] as const) {
    const teams = fixture.participants.filter(p => record(record(p).meta).location === location);
    if (teams.length !== 1) return missing();
    const clubProviderId = id(record(teams[0]).id);
    if (!clubProviderId) return missing();
    const coaches = fixture.coaches.filter(c => id(record(record(c).meta).participant_id) === clubProviderId);
    if (coaches.length !== 1) return missing();
    const coach = record(coaches[0]);
    const meta = record(coach.meta);
    const coachProviderId = id(coach.id);
    if (!coachProviderId || id(meta.coach_id) !== coachProviderId || id(meta.fixture_id) !== fixtureProviderId) return missing();
    assignments.push({ coachProviderId, clubProviderId, location });
  }
  if (new Set(assignments.map(a => a.clubProviderId)).size !== 2 || new Set(assignments.map(a => a.coachProviderId)).size !== 2) return missing();
  return { status: "complete", source: "sportmonks.fixture.coaches", fixtureProviderId, competitionProviderId, seasonProviderId, assignments };
}
