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

const SQUAD_PREVIEW_WAKE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const PREMATCH_REFRESH_WINDOW_MS = 60 * 60 * 1_000;
const PREMATCH_REFRESH_MS = 60_000;
// A provider can briefly retain an upcoming status after the scheduled start.
// Recheck twice at a lower cadence, then fail closed rather than refreshing an
// abandoned tab forever and turning an upstream lag into Function usage.
const STALE_UPCOMING_GRACE_MS = 2 * 60 * 1_000;
const STALE_UPCOMING_REFRESH_MS = 60_000;
const LIVE_REFRESH_MS = 10_000;
const BROWSER_MAX_TIMEOUT_MS = 2_147_000_000;
const ABSOLUTE_ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function validScore(value: number | undefined) {
  return Number.isInteger(value) && (value ?? -1) >= 0;
}

function parseAbsoluteIsoTimestamp(value: string) {
  const candidate = value.trim();
  const match = candidate.match(ABSOLUTE_ISO_TIMESTAMP);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second
  ) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function scheduleBoundaryRefresh(delayMs: number) {
  return Math.max(1, Math.min(delayMs, BROWSER_MAX_TIMEOUT_MS));
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
 * A future fixture wakes once at T−24 so the line-up label changes without a
 * page reload. It then sleeps until the one-hour live-refresh window, avoiding
 * a day of background polling and unnecessary function invocations.
 */
export function clubHubFixtureRailRefreshMs(
  rail: Pick<ClubHubFixtureRailPresentation, "state">,
  startsAt: string,
  now = Date.now(),
) {
  if (!Number.isFinite(now)) return null;
  if (rail.state === "live") return LIVE_REFRESH_MS;
  const kickoff = parseAbsoluteIsoTimestamp(startsAt);
  if (rail.state === "upcoming" && kickoff !== null && Number.isFinite(now)) {
    const untilKickoff = kickoff - now;
    if (untilKickoff < -STALE_UPCOMING_GRACE_MS) return null;
    if (untilKickoff <= 0) return STALE_UPCOMING_REFRESH_MS;
    if (untilKickoff <= PREMATCH_REFRESH_WINDOW_MS) return PREMATCH_REFRESH_MS;
    if (untilKickoff > SQUAD_PREVIEW_WAKE_WINDOW_MS) {
      return scheduleBoundaryRefresh(untilKickoff - SQUAD_PREVIEW_WAKE_WINDOW_MS);
    }
    return scheduleBoundaryRefresh(untilKickoff - PREMATCH_REFRESH_WINDOW_MS);
  }
  return null;
}
