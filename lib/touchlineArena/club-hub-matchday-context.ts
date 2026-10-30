import type { TouchlinePublicFixture } from "../football-data/public-fixture";
import type { TouchLineClubMatchdayPresentation } from "./club-lineup";
import { selectClubHubNextFixture } from "./club-hub-next-fixture.ts";
import { isTouchLineSettledFixtureStatus } from "../football-data/fixture-settlement.ts";

/** One presentation decision for the XI and the tickets rail. A scheduled
 * fixture becomes the displayed match only after the canonical XI validator
 * confirms its identities; the clock alone never supplies a team sheet. */
export function resolveClubHubMatchdayContext(input: {
  clubTeamId: string;
  presentation: Pick<TouchLineClubMatchdayPresentation, "lineup" | "recordedXiWithoutCards">;
  matchdayFixtureId: string | null;
  publicFixture: TouchlinePublicFixture | null;
  lastCompletedXiFixture: TouchlinePublicFixture | null;
  candidates: readonly TouchlinePublicFixture[];
  now?: number;
}) {
  const belongs = (fixture: TouchlinePublicFixture) => Boolean(input.clubTeamId
    && [fixture.homeTeam?.providerId, fixture.awayTeam?.providerId].includes(input.clubTeamId));
  const official = input.presentation.lineup.status === "confirmed"
    && Boolean(input.matchdayFixtureId && input.publicFixture?.providerId === input.matchdayFixtureId
      && belongs(input.publicFixture));
  const recorded = !official && (input.presentation.lineup.previewBasis === "last-completed-xi"
    || Boolean(input.presentation.lineup.recordedPitch) || input.presentation.recordedXiWithoutCards?.length === 11);
  const lineupFixture = input.presentation.lineup.status === "confirmed" && !official ? null : official ? input.publicFixture
    : recorded ? input.lastCompletedXiFixture && belongs(input.lastCompletedXiFixture) ? input.lastCompletedXiFixture : null
    : input.publicFixture && belongs(input.publicFixture) ? input.publicFixture : null;
  const nextFixture = selectClubHubNextFixture(input.candidates, fixture => belongs(fixture)
    && (!official || fixture.providerId !== input.matchdayFixtureId), input.now);
  return { lineupFixture, nextFixture: nextFixture ?? null };
}

/** A confirmed finished XI remains official evidence, but its presentation is
 * historical. Unknown/cancelled states never manufacture a final whistle. */
export function clubHubLineupIsCompleted(fixture: TouchlinePublicFixture | null | undefined) {
  return Boolean(fixture && isTouchLineSettledFixtureStatus(fixture.status));
}
