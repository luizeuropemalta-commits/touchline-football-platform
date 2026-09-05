import type { TouchLineLocale } from "./i18n.ts";
import { touchlineFixtureState } from "./match-centre.ts";

type ClubHubFixtureRailSource = Readonly<{
  startsAt?: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  liveMinute?: number;
}>;

export type ClubHubFixtureRailPresentation = Readonly<{
  state: "upcoming" | "live" | "finished" | "unknown";
  heading: string;
  score: string | null;
  liveMinute: string | null;
}>;

const PREMATCH_REFRESH_WINDOW_MS = 60 * 60 * 1_000;
const PREMATCH_REFRESH_MS = 30_000;
// A provider can briefly retain an upcoming status after the scheduled start.
// Recheck twice at a lower cadence, then fail closed rather than refreshing an
// abandoned tab forever and turning an upstream lag into Function usage.
const STALE_UPCOMING_GRACE_MS = 2 * 60 * 1_000;
const STALE_UPCOMING_REFRESH_MS = 60_000;
const LIVE_REFRESH_MS = 10_000;

function validScore(value: number | undefined) {
  return Number.isInteger(value) && (value ?? -1) >= 0;
}

/**
 * The ClubHub rail must reflect the durable fixture state, never a timer or
 * illustrative score. The source status decides when a match becomes live or
 * final; the scheduled start only protects a future fixture from looking live.
 */
export function resolveClubHubFixtureRail(
  fixture: ClubHubFixtureRailSource,
  locale: TouchLineLocale,
  now = Date.now(),
): ClubHubFixtureRailPresentation {
  const state = touchlineFixtureState(fixture, now);
  const portuguese = locale === "pt-BR";
  const score = validScore(fixture.homeScore) && validScore(fixture.awayScore)
    ? `${fixture.homeScore}–${fixture.awayScore}`
    : null;
  const liveMinute = state === "live" && Number.isInteger(fixture.liveMinute) && (fixture.liveMinute ?? -1) >= 0
    ? `${fixture.liveMinute}'`
    : null;

  if (state === "live") {
    return { state, heading: portuguese ? "AO VIVO" : "LIVE", score, liveMinute };
  }
  if (state === "finished") {
    return { state, heading: portuguese ? "ENCERRADO" : "FULL TIME", score, liveMinute: null };
  }
  if (state === "upcoming") {
    return { state, heading: portuguese ? "PRÓXIMO JOGO" : "NEXT MATCH", score: null, liveMinute: null };
  }
  return { state, heading: portuguese ? "ATUALIZAÇÃO DA PARTIDA" : "MATCH UPDATE", score: null, liveMinute: null };
}

/**
 * Refresh only while the fixture can change state; a settled result is stable.
 *
 * A future fixture still needs one wake-up at the start of the pre-match
 * window. Without it, a tab left open overnight would never begin polling as
 * kick-off approaches.
 */
export function clubHubFixtureRailRefreshMs(
  rail: Pick<ClubHubFixtureRailPresentation, "state">,
  startsAt: string,
  now = Date.now(),
) {
  if (rail.state === "live") return LIVE_REFRESH_MS;
  const kickoff = Date.parse(startsAt);
  if (rail.state === "upcoming" && Number.isFinite(kickoff)) {
    const untilKickoff = kickoff - now;
    if (untilKickoff < -STALE_UPCOMING_GRACE_MS) return null;
    if (untilKickoff <= 0) return STALE_UPCOMING_REFRESH_MS;
    if (untilKickoff <= PREMATCH_REFRESH_WINDOW_MS) return PREMATCH_REFRESH_MS;
    return Math.max(PREMATCH_REFRESH_MS, untilKickoff - PREMATCH_REFRESH_WINDOW_MS);
  }
  return null;
}
