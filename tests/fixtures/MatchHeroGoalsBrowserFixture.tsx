import TouchlineMatchCentre from "../../components/touchline/match-centre/TouchlineMatchCentre";
import styles from "../../components/touchline/match-centre/touchline-match-centre.module.css";
import { findTouchLineClub } from "../../lib/touchlineArena/demo-data";
import type { TouchlinePublicFixture } from "../../lib/football-data/public-fixture";
import type { TouchlinePublicFantasyFixtureMatchDetail, TouchlinePublicFantasyEvent } from "../../lib/football-data/public-fantasy-fixture";

export { styles as goalStyles };
export type GoalScenario = "five" | "six" | "one-seven" | "long-names";
const now = Date.parse("2026-10-24T00:00:00Z");
const home = findTouchLineClub("Arsenal")!, away = findTouchLineClub("Brentford")!;

/** Synthetic, immutable seed through the complete real MatchCentre. No fixture
 * fetching, account session, live provider publication or market transaction. */
export default function MatchHeroGoalsBrowserFixture({ scenario }: { scenario: GoalScenario }) {
  const count = scenario === "five" ? 5 : scenario === "one-seven" ? 7 : 6;
  const fixture: TouchlinePublicFixture = { id: "990099", providerId: "990099", status: "FT", startsAt: "2026-10-23T15:00:00Z",
    homeTeam: { id: home.teamId, providerId: home.teamId, name: "Synthetic Home", logoUrl: home.logoUrl },
    awayTeam: { id: away.teamId, providerId: away.teamId, name: "Synthetic Away", logoUrl: away.logoUrl }, homeScore: count, awayScore: count };
  const events: TouchlinePublicFantasyEvent[] = [home, away].flatMap((team, side) => Array.from({ length: count }, (_, index) => ({
    id: `${side}-${index}`, fixtureId: fixture.providerId, teamId: team.teamId, type: index === 0 ? "Own goal" : "goal", status: "recorded" as const,
    playerId: `${side}-player-${scenario === "one-seven" ? 0 : index}`,
    playerName: scenario === "one-seven" ? `Synthetic ${side === 0 ? "Home" : "Away"} Seven Goals` : scenario === "long-names"
      ? `Synthetic ${side === 0 ? "Home" : "Away"} Very Long Compound Footballer Name ${index + 1}` : `Synthetic ${side === 0 ? "Home" : "Away"} Scorer ${index + 1}`,
    minute: (side === 0 ? 5 : 8) + index * 12,
  })));
  const detail: TouchlinePublicFantasyFixtureMatchDetail = { fixture: { id: fixture.providerId, status: "FT", homeScore: count, awayScore: count },
    capturedAt: "2026-10-23T18:00:00Z", events, lineups: [], formations: [], sidelined: [], playerStatistics: [], lineupAvailableAt: null };
  return <TouchlineMatchCentre key={scenario} initialFixtures={[fixture]} initialFixtureId={fixture.id} initialMatchDetail={detail}
    liveUpdates={false} canReadMatchDetail={false} initialLocale="en-GB" initialNow={now} initialTimeZone="UTC"
    accountLocaleContext={{ mode: "unavailable" }} />;
}
