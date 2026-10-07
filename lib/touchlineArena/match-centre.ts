import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import type {
  TouchlinePublicFantasyEvent,
  TouchlinePublicFixturePlayerStatistics,
} from "@/lib/football-data/public-fantasy-fixture";
import type { TouchlineFixture } from "@/lib/football-data/types";
import { selectArenaFixtureRound } from "./arena-fixture-round.ts";
import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { getTouchlineMatchCentreCopy } from "./match-centre-i18n.ts";

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
 * The database preserves provider facts but does not guarantee their result
 * order. The Match Centre shows the latest known minute first, then the latest
 * stoppage-time minute. Equal moments preserve their received order. Events
 * without a finite minute stay at the bottom without guessing their time.
 */
export function orderTouchlineMatchEvents(
  events: readonly TouchlinePublicFantasyEvent[],
) {
  const eventTime = (event: TouchlinePublicFantasyEvent) => {
    const minute = Number.isFinite(event.minute) ? event.minute! : Number.NEGATIVE_INFINITY;
    const extraMinute = Number.isFinite(event.minute) && Number.isFinite(event.extraMinute) ? event.extraMinute! : 0;
    return [minute, extraMinute] as const;
  };

  return events.slice().sort((left, right) => {
    const [leftMinute, leftExtraMinute] = eventTime(left);
    const [rightMinute, rightExtraMinute] = eventTime(right);
    return rightMinute - leftMinute
      || rightExtraMinute - leftExtraMinute
      || 0;
  });
}

/** Match ratings are a leaderboard, never a database insertion order. */
export function orderTouchlineMatchRatings(
  statistics: readonly TouchlinePublicFixturePlayerStatistics[],
) {
  return statistics
    .filter((row) => Number.isFinite(row.rating))
    .slice()
    .sort((left, right) => (right.rating ?? Number.NEGATIVE_INFINITY) - (left.rating ?? Number.NEGATIVE_INFINITY)
      || left.playerName.localeCompare(right.playerName)
      || left.playerId.localeCompare(right.playerId));
}

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

function touchlineDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    calendar: "gregory",
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Compact, localized fixture context for the Live rail. Keeping this shared
 * prevents individual screens from guessing whether a kick-off is "today".
 */
export function touchlineFixtureRailDateLabel(
  fixture: Pick<TouchlinePublicFixture, "startsAt">,
  locale: TouchLineLocale,
  timeZone: string,
  now = Date.now(),
  draftLocalesEnabled = false,
) {
  const startsAt = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  if (!Number.isFinite(startsAt) || !Number.isFinite(now)) return "—";

  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const normalizedTimeZone = normalizeTouchlineMatchCentreTimeZone(timeZone);
  const fixtureDate = new Date(startsAt);
  if (touchlineDateKey(fixtureDate, normalizedTimeZone) === touchlineDateKey(new Date(now), normalizedTimeZone)) {
    return getTouchlineMatchCentreCopy(language, draftLocalesEnabled).today;
  }

  const parts = new Intl.DateTimeFormat(language, {
    calendar: "gregory",
    day: "2-digit",
    month: "short",
    timeZone: normalizedTimeZone,
    weekday: "short",
  }).formatToParts(fixtureDate);
  const compact = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value.replace(/[.,]/g, "").trim() ?? ""
  );
  return [compact("weekday"), compact("day"), compact("month")]
    .filter(Boolean)
    .join(" ")
    .toLocaleUpperCase(language);
}

type TouchlineFixtureStateSource = Pick<TouchlineFixture, "startsAt" | "status">;
type TouchlineFixtureSelectionSource = TouchlineFixtureStateSource & Pick<TouchlineFixture, "id" | "providerId">;

const LIVE_STATUS = /(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalt)/i;
const FINISHED_STATUS = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;

const enGBFixtureStatus = {
  firstHalf: "1st Half", secondHalf: "2nd Half", halfTime: "Half-time", fullTime: "Full Time",
  live: "LIVE", next: "Next", notStarted: "Not started",
} as const;
type FixtureStatusCopy = Readonly<Record<keyof typeof enGBFixtureStatus, string>>;
// These are presentation drafts, not changes to provider states or permission
// to publish a language. The shared complete-locale normalizer remains EN/PT.
export const TOUCHLINE_FIXTURE_STATUS_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_FIXTURE_STATUS_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_FIXTURE_STATUS_CATALOGUES = {
  "en-GB": enGBFixtureStatus,
  "pt-BR": { firstHalf: "1º tempo", secondHalf: "2º tempo", halfTime: "Intervalo", fullTime: "Encerrado", live: "AO VIVO", next: "Próximo", notStarted: "Não iniciado" },
  "es-ES": { firstHalf: "Primera parte", secondHalf: "Segunda parte", halfTime: "Descanso", fullTime: "Finalizado", live: "EN DIRECTO", next: "Próximo", notStarted: "No iniciado" },
  "it-IT": { firstHalf: "Primo tempo", secondHalf: "Secondo tempo", halfTime: "Intervallo", fullTime: "Fine partita", live: "IN DIRETTA", next: "Prossima", notStarted: "Non iniziata" },
  "fr-FR": { firstHalf: "1re mi-temps", secondHalf: "2e mi-temps", halfTime: "Mi-temps", fullTime: "Terminé", live: "EN DIRECT", next: "À venir", notStarted: "Pas commencé" },
  "ar-SA": { firstHalf: "الشوط الأول", secondHalf: "الشوط الثاني", halfTime: "استراحة بين الشوطين", fullTime: "انتهت المباراة", live: "مباشر", next: "القادم", notStarted: "لم تبدأ" },
  "tr-TR": { firstHalf: "1. yarı", secondHalf: "2. yarı", halfTime: "Devre arası", fullTime: "Maç sona erdi", live: "CANLI", next: "Sıradaki", notStarted: "Başlamadı" },
  "de-DE": { firstHalf: "1. Halbzeit", secondHalf: "2. Halbzeit", halfTime: "Halbzeitpause", fullTime: "Abpfiff", live: "LIVE", next: "Nächstes Spiel", notStarted: "Nicht begonnen" },
} as const satisfies Readonly<Record<TouchLineLocale, FixtureStatusCopy>>;
const FIXTURE_STATUS_ALIASES = {
  "1st half": "firstHalf", "first half": "firstHalf", "2nd half": "secondHalf", "second half": "secondHalf",
  "half time": "halfTime", halftime: "halfTime", "full time": "fullTime", finished: "fullTime", ft: "fullTime",
  live: "live", "in play": "live", inplay: "live", next: "next", "not started": "notStarted",
} as const satisfies Readonly<Record<string, keyof FixtureStatusCopy>>;

/** Provider status values are facts; render the known shared vocabulary in the selected locale. */
export function touchlineFixtureStatusLabel(value: string | null | undefined, locale: TouchLineLocale, draftLocalesEnabled = false) {
  const status = value?.trim() ?? "";
  if (!status) return "";
  const key = status.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!Object.hasOwn(FIXTURE_STATUS_ALIASES, key)) return status;
  const meaning = FIXTURE_STATUS_ALIASES[key as keyof typeof FIXTURE_STATUS_ALIASES];
  return TOUCHLINE_FIXTURE_STATUS_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)][meaning];
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
    ...current.map((fixture) => {
      const liveFixture = snapshotByIdentity.get(touchlinePublicFixtureIdentity(fixture));
      if (!liveFixture) return fixture;
      return fixture.venue && !liveFixture.venue
        ? { ...liveFixture, venue: fixture.venue }
        : liveFixture;
    }),
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

/**
 * A Live URL is a promise about the match currently on screen. Keep this
 * lookup separate from the fallback selector so a bad deep link can be
 * normalized by the route instead of silently showing another fixture.
 */
export function hasTouchlineMatchCentreFixture<T extends TouchlineFixtureSelectionSource>(
  fixtures: readonly T[],
  requestedFixtureId?: string | null,
) {
  const requested = requestedFixtureId?.trim();
  return Boolean(requested && fixtures.some((fixture) => (
    fixture.id === requested || fixture.providerId === requested
  )));
}

export function touchlineMatchCentreHref(fixture: TouchlineFixture, locale?: string) {
  const params = new URLSearchParams({ fixture: fixture.id });
  if (locale) params.set("lang", locale);
  return `/live?${params.toString()}`;
}
