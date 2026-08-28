import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import type { TouchlineFixture } from "@/lib/football-data/types";
import { selectArenaFixtureRound } from "./arena-fixture-round.ts";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";

export type TouchlineMatchState = "live" | "upcoming" | "finished" | "unknown";
export type TouchlineMatchCentreDisplayState = TouchlineMatchState | "stale";

export type TouchlineLiveReadState = "persisted-live-snapshot" | "partial-persisted-schedule";

/**
 * Browser-safe freshness metadata emitted by the persisted Live endpoint.
 * This is presentation information only: it never asks the browser to
 * estimate freshness from its own clock.
 */
export type TouchlineLiveReadMetadata = {
  state: TouchlineLiveReadState;
  degraded: boolean;
  fetchedAt?: string;
};

export const TOUCHLINE_MATCH_CENTRE_TIME_ZONE_FALLBACK = "UTC";

/**
 * Vercel supplies an IANA time-zone name for the current request. The value is
 * normalized on the server and serialized with the first render so SSR and the
 * browser cannot format the same fixture in different time zones.
 */
export function normalizeTouchlineMatchCentreTimeZone(value?: string | null) {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 100) return TOUCHLINE_MATCH_CENTRE_TIME_ZONE_FALLBACK;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return TOUCHLINE_MATCH_CENTRE_TIME_ZONE_FALLBACK;
  }
}

type TouchlineFixtureStateSource = Pick<TouchlineFixture, "startsAt" | "status">;
type TouchlineFixtureSelectionSource = TouchlineFixtureStateSource & Pick<TouchlineFixture, "id" | "providerId">;

const LIVE_STATUS = /(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalt)/i;
const FINISHED_STATUS = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;

const FIXTURE_STATUS_LABELS: Partial<Record<TouchLineLocale, Record<string, string>>> = {
  "en-GB": { "1st half": "1st Half", "first half": "1st Half", "2nd half": "2nd Half", "second half": "2nd Half", "half time": "Half-time", halftime: "Half-time", "full time": "Full Time", finished: "Full Time", ft: "Full Time", live: "LIVE", "in play": "LIVE", inplay: "LIVE", next: "Next", "not started": "Not started" },
  "pt-BR": { "1st half": "1º tempo", "first half": "1º tempo", "2nd half": "2º tempo", "second half": "2º tempo", "half time": "Intervalo", halftime: "Intervalo", "full time": "Encerrado", finished: "Encerrado", ft: "Encerrado", live: "AO VIVO", "in play": "AO VIVO", inplay: "AO VIVO", next: "Próximo", "not started": "Não iniciado" },
};

/** Provider status values are facts; render the known shared vocabulary in the selected locale. */
export function touchlineFixtureStatusLabel(value: string | null | undefined, locale: TouchLineLocale) {
  const status = value?.trim() ?? "";
  if (!status) return "";
  const key = status.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return FIXTURE_STATUS_LABELS[locale]?.[key] ?? status;
}

export function touchlineFixtureState(fixture: TouchlineFixtureStateSource, now = Date.now()): TouchlineMatchState {
  const status = fixture.status?.trim() ?? "";
  const startsAt = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  // A provider/status snapshot cannot make a future kick-off look live. This
  // keeps representative or delayed records honest until their scheduled time.
  if (LIVE_STATUS.test(status)) return Number.isFinite(startsAt) && startsAt > now ? "upcoming" : "live";
  if (FINISHED_STATUS.test(status)) return "finished";
  if (Number.isFinite(startsAt)) return "upcoming";
  return "unknown";
}

export function isTouchlineLiveReadMetadata(value: unknown): value is TouchlineLiveReadMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.state === "persisted-live-snapshot" || candidate.state === "partial-persisted-schedule")
    && typeof candidate.degraded === "boolean"
    && (candidate.fetchedAt === undefined || typeof candidate.fetchedAt === "string")
  );
}

/**
 * Browser fixture payloads use the provider fixture ID as their stable public
 * identity. SSR can retain an internal prefixed ID, so Live must merge on the
 * shared provider ID rather than rendering that same fixture twice.
 */
export function touchlinePublicFixtureIdentity(fixture: Pick<TouchlinePublicFixture, "id" | "providerId">) {
  return fixture.providerId.trim() || fixture.id.trim();
}

export function mergeTouchlineLiveFixtures(
  current: TouchlinePublicFixture[],
  snapshot: TouchlinePublicFixture[],
) {
  const snapshotByIdentity = new Map(snapshot.map((fixture) => [touchlinePublicFixtureIdentity(fixture), fixture]));
  const currentIdentities = new Set(current.map(touchlinePublicFixtureIdentity));
  return [
    ...current.map((fixture) => snapshotByIdentity.get(touchlinePublicFixtureIdentity(fixture)) ?? fixture),
    ...snapshot.filter((fixture) => !currentIdentities.has(touchlinePublicFixtureIdentity(fixture))),
  ];
}

const MATCH_CENTRE_SECTION_LIMIT = 10;

function fixtureStartMillis(fixture: Pick<TouchlinePublicFixture, "startsAt">) {
  const startsAt = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  return Number.isFinite(startsAt) ? startsAt : Number.POSITIVE_INFINITY;
}

function fixtureRoundIdentity(
  fixture: Pick<TouchlinePublicFixture, "competitionId" | "seasonId" | "roundId" | "roundName">,
) {
  const scope = `${fixture.competitionId?.trim() ?? "competition"}:${fixture.seasonId?.trim() ?? "season"}`;
  if (fixture.roundId?.trim()) return `${scope}:id:${fixture.roundId.trim()}`;
  if (fixture.roundName?.trim()) return `${scope}:name:${fixture.roundName.trim().toLocaleLowerCase("en-GB")}`;
  return null;
}

/**
 * Live has exactly two canonical rails: the active provider round and the ten
 * most recent verified results before it. A live snapshot may contain a wider
 * window, but it can update facts only; it cannot make extra rounds visible.
 */
export function selectTouchlineMatchCentreSchedule<T extends TouchlinePublicFixture>(
  fixtures: readonly T[],
  now = Date.now(),
) {
  const uniqueFixtures = [...new Map(
    fixtures.map((fixture) => [touchlinePublicFixtureIdentity(fixture), fixture]),
  ).values()];
  const seedRound = selectArenaFixtureRound(uniqueFixtures, now);
  const roundIdentity = seedRound[0] ? fixtureRoundIdentity(seedRound[0]) : null;
  const currentFixtures = (roundIdentity
    ? uniqueFixtures.filter((fixture) => fixtureRoundIdentity(fixture) === roundIdentity)
    : seedRound
  )
    .slice()
    .sort((first, second) => fixtureStartMillis(first) - fixtureStartMillis(second))
    .slice(0, MATCH_CENTRE_SECTION_LIMIT);
  const currentIdentities = new Set(currentFixtures.map(touchlinePublicFixtureIdentity));
  const recentResults = uniqueFixtures
    .filter((fixture) => (
      touchlineFixtureState(fixture, now) === "finished"
      && !currentIdentities.has(touchlinePublicFixtureIdentity(fixture))
    ))
    .slice()
    .sort((first, second) => fixtureStartMillis(second) - fixtureStartMillis(first))
    .slice(0, MATCH_CENTRE_SECTION_LIMIT);

  return { currentFixtures, recentResults };
}

/**
 * A stale persisted live snapshot must never retain the visual "LIVE" state.
 * Completed and scheduled fixtures keep their normal classification; the
 * surrounding notice still explains that the shared data is being refreshed.
 */
export function touchlineMatchCentreDisplayState(
  fixture: TouchlineFixtureStateSource,
  metadata?: TouchlineLiveReadMetadata | null,
  now?: number,
): TouchlineMatchCentreDisplayState {
  const state = touchlineFixtureState(fixture, now);
  return metadata?.degraded && state === "live" ? "stale" : state;
}

export function selectTouchlineMatchCentreFixture<T extends TouchlineFixtureSelectionSource>(fixtures: T[], requestedFixtureId?: string | null, now = Date.now()): T | null {
  const requested = requestedFixtureId ? fixtures.find((fixture) => fixture.id === requestedFixtureId || fixture.providerId === requestedFixtureId) : null;
  if (requested) return requested;

  const byDate = (first: T, second: T) =>
    (Date.parse(first.startsAt ?? "") || Number.POSITIVE_INFINITY) - (Date.parse(second.startsAt ?? "") || Number.POSITIVE_INFINITY);
  const latestFirst = (first: T, second: T) => -byDate(first, second);
  const live = fixtures.filter((fixture) => touchlineFixtureState(fixture, now) === "live").sort(byDate)[0];
  if (live) return live;
  const upcoming = fixtures.filter((fixture) => touchlineFixtureState(fixture, now) === "upcoming").sort(byDate)[0];
  if (upcoming) return upcoming;
  return fixtures.filter((fixture) => touchlineFixtureState(fixture, now) === "finished").sort(latestFirst)[0] ?? null;
}

export function touchlineMatchCentreHref(fixture: TouchlineFixture, locale?: string) {
  const params = new URLSearchParams({ fixture: fixture.id });
  if (locale) params.set("lang", locale);
  return `/live?${params.toString()}`;
}
