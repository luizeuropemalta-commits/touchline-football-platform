import {
  TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
  type TouchlineOfficialLeagueTable,
} from "../football-data/official-league-table.ts";
import type { TouchlinePublicFixture, TouchlinePublicVenue } from "../football-data/public-fixture.ts";
import type { TouchLineClubVisual } from "../touchlineArena/demo-data.ts";
import {
  resolveTouchlineDataSource,
  resolveTouchlineQaReadOrigin,
  type TouchlineMirrorEnvironment,
} from "./runtime.ts";

export { resolveTouchlineQaReadOrigin, TOUCHLINE_QA_READ_HOST } from "./runtime.ts";

export const TOUCHLINE_QA_CLUBHUB_MIRROR_SCHEMA_VERSION = 1 as const;
export const TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_BYTES = 256_000;
export const TOUCHLINE_QA_CLUBHUB_MIRROR_TIMEOUT_MS = 6_000;
export const TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_AGE_MS = 5 * 60 * 1000;
export const TOUCHLINE_QA_CLUBHUB_FIXTURE_MAX_SOURCE_AGE_MS = 24 * 60 * 60 * 1000;
export const TOUCHLINE_QA_CLUBHUB_TABLE_MAX_SOURCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const TOUCHLINE_QA_CLUBHUB_SEASON_MAX_SOURCE_AGE_MS = 370 * 24 * 60 * 60 * 1000;

type MirrorTableState = Extract<
  TouchlineOfficialLeagueTable["state"],
  "ready" | "pending_no_final" | "partial"
>;

type MirrorVenue = Readonly<{
  id: string;
  name: string;
  capacity: number | null;
  homeClubName: string;
  imageUrl: string;
  interiorImageUrl: string | null;
}>;

type MirrorFixtureTeam = Readonly<{
  teamId: string;
  name: string;
  shortCode: string | null;
  logoUrl: string | null;
}>;

export type TouchlineQaClubHubMirrorDto = Readonly<{
  schemaVersion: typeof TOUCHLINE_QA_CLUBHUB_MIRROR_SCHEMA_VERSION;
  generatedAt: string;
  club: Readonly<{
    teamId: string;
    slug: string;
    name: string;
    shortCode: string;
    logoUrl: string | null;
    homeVenue: MirrorVenue | null;
  }>;
  nextFixture: Readonly<{
    fixtureId: string;
    startsAt: string;
    status: string | null;
    roundName: string | null;
    homeTeam: MirrorFixtureTeam;
    awayTeam: MirrorFixtureTeam;
    venue: MirrorVenue | null;
    homeScore: number | null;
    awayScore: number | null;
    verifiedAt: string | null;
  }> | null;
  feed: Readonly<{
    state: "ready" | "empty" | "unavailable";
    items: readonly Readonly<{
      publicId: string;
      contentType: string;
      copy: string;
      publishedAt: string;
      width: 1080;
      height: 1350 | 1920;
      imagePath: string;
    }>[];
  }>;
  leagueTable: Readonly<{
    state: MirrorTableState;
    asOf: string | null;
    season: Readonly<{
      providerSeasonId: string;
      name: string;
      sourceUpdatedAt: string | null;
    }> | null;
    coverage: TouchlineOfficialLeagueTable["coverage"];
    rows: readonly Readonly<{
      sportsRank: number | null;
      isTied: boolean;
      displayPosition: number | null;
      team: Readonly<{
        teamId: string;
        name: string;
        shortCode: string | null;
        slug: string;
        logoUrl: string | null;
      }>;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      points: number;
      form: readonly ("W" | "D" | "L")[];
      liveFixture: Readonly<{
        fixtureId: string;
        scoreFor: number | null;
        scoreAgainst: number | null;
        stale: boolean;
      }> | null;
    }>[];
  }>;
}>;

export type TouchlineQaClubHubMirrorReadResult =
  | Readonly<{ state: "ready"; data: TouchlineQaClubHubMirrorDto }>
  | Readonly<{
    state: "unavailable";
    reason:
      | "configuration"
      | "timeout"
      | "network"
      | "http"
      | "redirect"
      | "oversize"
      | "empty"
      | "invalid-json"
      | "invalid-schema"
      | "stale";
  }>;

type FetchImplementation = (input: URL, init?: RequestInit) => Promise<Response>;

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_SHORT_CODE = /^[A-Z0-9]{2,5}$/;
const SAFE_FIXTURE_ID = /^[A-Za-z0-9:_-]{1,80}$/;
const SAFE_PUBLIC_FEED_ID = /^[0-9a-f]{40}$/;
const SAFE_CONTENT_TYPE = /^[A-Z0-9_]{1,80}$/;
const SAFE_LOGO_PREFIX = "/touchlineArena/shared/club-logos/";
const SAFE_STADIUM_PREFIX = "/touchlineArena/stadiums/";
const TABLE_STATES = new Set<MirrorTableState>(["ready", "pending_no_final", "partial"]);
const TABLE_ROW_KEYS = [
  "sportsRank", "isTied", "displayPosition", "team", "played", "won", "drawn", "lost",
  "goalsFor", "goalsAgainst", "goalDifference", "points", "form", "liveFixture",
] as const;
const FORBIDDEN_KEY_PARTS = [
  "authorization", "cookie", "email", "password", "secret", "servicerole", "token",
  "artifactbucket", "artifactkey", "ownerid", "userid",
] as const;
const PRIVATE_TEXT_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:https?:\/\/|www\.)\S+/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/,
  /\bbearer\s+[A-Za-z0-9._~+\/-]{8,}\b/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret|token|service[_ -]?role)\s*[:=]\s*\S+/i,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|SPORTMONKS_API_TOKEN|TOUCHLINE_LIVE_SYNC_SECRET)\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
] as const;
const ALLOWED_FUTURE_CLOCK_SKEW_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (daysInMonth[month - 1] ?? 0)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (offsetSign && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return false;
  return true;
}

function isBoundedString(value: unknown, maxLength: number, minimumLength = 1): value is string {
  return typeof value === "string" && value.length >= minimumLength && value.length <= maxLength;
}

function isPublicText(value: unknown, maxLength: number, minimumLength = 1): value is string {
  if (!isBoundedString(value, maxLength, minimumLength) || value.trim().length < minimumLength) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(value)) return false;
  return !PRIVATE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function isNullablePublicText(value: unknown, maxLength: number): value is string | null {
  return value === null || isPublicText(value, maxLength);
}

function isFreshTimestamp(value: unknown, now: number, maxAgeMs: number): value is string {
  if (!isTimestamp(value)) return false;
  const timestamp = Date.parse(value);
  return timestamp <= now + ALLOWED_FUTURE_CLOCK_SKEW_MS && now - timestamp <= maxAgeMs;
}

function isNotFutureTimestamp(value: unknown, now: number): value is string {
  return isTimestamp(value) && Date.parse(value) <= now + ALLOWED_FUTURE_CLOCK_SKEW_MS;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isNullableIntegerInRange(value: unknown, minimum: number, maximum: number): value is number | null {
  return value === null || isIntegerInRange(value, minimum, maximum);
}

function isSafeLogoUrl(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && value.startsWith(SAFE_LOGO_PREFIX)
    && value.length <= 240
    && !value.includes("..")
    && !value.includes("?")
    && !value.includes("#")
  );
}

function isSafeStadiumUrl(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && value.startsWith(SAFE_STADIUM_PREFIX)
    && value.length <= 240
    && !value.includes("..")
    && !value.includes("?")
    && !value.includes("#")
  );
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part)) || containsForbiddenKey(child);
  });
}

function validCoverage(value: unknown): value is TouchlineQaClubHubMirrorDto["leagueTable"]["coverage"] {
  if (!isRecord(value) || !hasExactKeys(value, [
    "expectedClubs", "mappedClubs", "fixturesInSeason", "completedFixtures", "liveFixtures", "duplicateFixtures",
  ])) return false;
  return isIntegerInRange(value.expectedClubs, 1, 40)
    && isIntegerInRange(value.mappedClubs, 0, 40)
    && isIntegerInRange(value.fixturesInSeason, 0, 1_000)
    && isIntegerInRange(value.completedFixtures, 0, 1_000)
    && isIntegerInRange(value.liveFixtures, 0, 40)
    && isIntegerInRange(value.duplicateFixtures, 0, 1_000)
    && Number(value.completedFixtures) + Number(value.liveFixtures) <= Number(value.fixturesInSeason)
    && Number(value.duplicateFixtures) <= Number(value.fixturesInSeason);
}

function validTeam(value: unknown): value is TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number]["team"] {
  if (!isRecord(value) || !hasExactKeys(value, ["teamId", "name", "shortCode", "slug", "logoUrl"])) return false;
  return typeof value.teamId === "string" && NUMERIC_ID.test(value.teamId)
    && isPublicText(value.name, 120)
    && (value.shortCode === null || (typeof value.shortCode === "string" && SAFE_SHORT_CODE.test(value.shortCode)))
    && typeof value.slug === "string" && SAFE_SLUG.test(value.slug)
    && isSafeLogoUrl(value.logoUrl);
}

function validLiveFixture(value: unknown): value is NonNullable<TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number]["liveFixture"]> {
  if (!isRecord(value) || !hasExactKeys(value, ["fixtureId", "scoreFor", "scoreAgainst", "stale"])) return false;
  return typeof value.fixtureId === "string" && SAFE_FIXTURE_ID.test(value.fixtureId)
    && isNullableIntegerInRange(value.scoreFor, 0, 99)
    && isNullableIntegerInRange(value.scoreAgainst, 0, 99)
    && typeof value.stale === "boolean";
}

function validRow(value: unknown): value is TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number] {
  if (!isRecord(value) || !hasExactKeys(value, TABLE_ROW_KEYS)) return false;
  const numericShape = isNullableIntegerInRange(value.sportsRank, 1, 40)
    && typeof value.isTied === "boolean"
    && isNullableIntegerInRange(value.displayPosition, 1, 40)
    && validTeam(value.team)
    && isIntegerInRange(value.played, 0, 100)
    && isIntegerInRange(value.won, 0, 100)
    && isIntegerInRange(value.drawn, 0, 100)
    && isIntegerInRange(value.lost, 0, 100)
    && isIntegerInRange(value.goalsFor, 0, 999)
    && isIntegerInRange(value.goalsAgainst, 0, 999)
    && isIntegerInRange(value.goalDifference, -999, 999)
    && isIntegerInRange(value.points, 0, 300)
    && Array.isArray(value.form)
    && value.form.length <= 5
    && value.form.every((result) => result === "W" || result === "D" || result === "L")
    && (value.liveFixture === null || validLiveFixture(value.liveFixture));
  if (!numericShape) return false;
  const row = value as TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number];
  return row.played === row.won + row.drawn + row.lost
    && row.goalDifference === row.goalsFor - row.goalsAgainst
    && row.points === (row.won * 3) + row.drawn
    && row.form.length <= row.played;
}

function sharesSportingRank(
  left: TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number],
  right: TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number] | undefined,
) {
  return Boolean(right
    && left.points === right.points
    && left.goalDifference === right.goalDifference
    && left.goalsFor === right.goalsFor);
}

function isCorrectlyOrdered(
  previous: TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number],
  current: TouchlineQaClubHubMirrorDto["leagueTable"]["rows"][number],
) {
  return previous.points > current.points
    || (previous.points === current.points && previous.goalDifference > current.goalDifference)
    || (previous.points === current.points
      && previous.goalDifference === current.goalDifference
      && previous.goalsFor >= current.goalsFor);
}

function validGlobalTableSemantics(
  rows: TouchlineQaClubHubMirrorDto["leagueTable"]["rows"],
  coverage: TouchlineQaClubHubMirrorDto["leagueTable"]["coverage"],
  tableState: MirrorTableState,
) {
  const totals = rows.reduce((sum, row) => ({
    played: sum.played + row.played,
    won: sum.won + row.won,
    drawn: sum.drawn + row.drawn,
    lost: sum.lost + row.lost,
    goalsFor: sum.goalsFor + row.goalsFor,
    goalsAgainst: sum.goalsAgainst + row.goalsAgainst,
  }), { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
  if (totals.played % 2 !== 0
    || totals.won !== totals.lost
    || totals.drawn % 2 !== 0
    || totals.goalsFor !== totals.goalsAgainst) return false;

  const projectedFixtures = totals.played / 2;
  const reportedFixtures = coverage.completedFixtures + coverage.liveFixtures;
  if (tableState === "partial") {
    if (projectedFixtures > reportedFixtures
      || reportedFixtures - projectedFixtures > coverage.duplicateFixtures) return false;
  } else if (projectedFixtures !== reportedFixtures) return false;

  if (tableState === "partial") {
    return rows.every((row) => row.sportsRank === null
      && row.displayPosition === null
      && row.isTied === false);
  }

  return rows.every((row, index) => {
    if (row.displayPosition !== index + 1) return false;
    if (index > 0 && !isCorrectlyOrdered(rows[index - 1]!, row)) return false;
    let groupStart = index;
    while (groupStart > 0 && sharesSportingRank(row, rows[groupStart - 1])) groupStart -= 1;
    const isTied = sharesSportingRank(row, rows[index - 1]) || sharesSportingRank(row, rows[index + 1]);
    return row.sportsRank === groupStart + 1 && row.isTied === isTied;
  });
}

function validVenue(value: unknown): value is MirrorVenue {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id", "name", "capacity", "homeClubName", "imageUrl", "interiorImageUrl",
  ])) return false;
  return typeof value.id === "string" && SAFE_SLUG.test(value.id)
    && isPublicText(value.name, 120)
    && isNullableIntegerInRange(value.capacity, 1, 200_000)
    && isPublicText(value.homeClubName, 120)
    && isSafeStadiumUrl(value.imageUrl)
    && value.imageUrl !== null
    && isSafeStadiumUrl(value.interiorImageUrl);
}

function validFixtureTeam(value: unknown): value is MirrorFixtureTeam {
  if (!isRecord(value) || !hasExactKeys(value, ["teamId", "name", "shortCode", "logoUrl"])) return false;
  return typeof value.teamId === "string" && NUMERIC_ID.test(value.teamId)
    && isPublicText(value.name, 120)
    && (value.shortCode === null || (typeof value.shortCode === "string" && SAFE_SHORT_CODE.test(value.shortCode)))
    && isSafeLogoUrl(value.logoUrl);
}

function comparableClubName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/\b(?:association football club|football club|afc|fc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function validNextFixture(
  value: unknown,
  now: number,
): value is NonNullable<TouchlineQaClubHubMirrorDto["nextFixture"]> {
  if (!isRecord(value) || !hasExactKeys(value, [
    "fixtureId", "startsAt", "status", "roundName", "homeTeam", "awayTeam", "venue",
    "homeScore", "awayScore", "verifiedAt",
  ])) return false;
  const fixtureShape = typeof value.fixtureId === "string" && NUMERIC_ID.test(value.fixtureId)
    && isTimestamp(value.startsAt)
    && isNullablePublicText(value.status, 80)
    && isNullablePublicText(value.roundName, 120)
    && validFixtureTeam(value.homeTeam)
    && validFixtureTeam(value.awayTeam)
    && value.homeTeam.teamId !== value.awayTeam.teamId
    && (value.venue === null || validVenue(value.venue))
    && isNullableIntegerInRange(value.homeScore, 0, 99)
    && isNullableIntegerInRange(value.awayScore, 0, 99)
    && isFreshTimestamp(value.verifiedAt, now, TOUCHLINE_QA_CLUBHUB_FIXTURE_MAX_SOURCE_AGE_MS);
  if (!fixtureShape) return false;
  const fixture = value as NonNullable<TouchlineQaClubHubMirrorDto["nextFixture"]>;
  if ((fixture.homeScore === null) !== (fixture.awayScore === null)) return false;
  return fixture.venue === null
    || comparableClubName(fixture.venue.homeClubName) === comparableClubName(fixture.homeTeam.name);
}

function validFeed(
  value: unknown,
  teamId: string,
  now: number,
): value is TouchlineQaClubHubMirrorDto["feed"] {
  if (!isRecord(value) || !hasExactKeys(value, ["state", "items"])) return false;
  if (value.state !== "ready" && value.state !== "empty" && value.state !== "unavailable") return false;
  if (!Array.isArray(value.items) || value.items.length > 6) return false;
  if ((value.state === "ready") !== (value.items.length > 0)) return false;
  return value.items.every((item) => {
    if (!isRecord(item) || !hasExactKeys(item, [
      "publicId", "contentType", "copy", "publishedAt", "width", "height", "imagePath",
    ])) return false;
    const expectedImagePath = typeof item.publicId === "string"
      ? `/api/touchline-qa/read/clubhub/${teamId}/feed-art/${item.publicId}`
      : null;
    return typeof item.publicId === "string" && SAFE_PUBLIC_FEED_ID.test(item.publicId)
      && typeof item.contentType === "string" && SAFE_CONTENT_TYPE.test(item.contentType)
      && isPublicText(item.copy, 2_000)
      && isNotFutureTimestamp(item.publishedAt, now)
      && item.width === 1080
      && (item.height === 1350 || item.height === 1920)
      && item.imagePath === expectedImagePath;
  });
}

function serializeVenue(venue: TouchlinePublicVenue | null | undefined): MirrorVenue | null {
  if (!venue) return null;
  return {
    id: venue.id,
    name: venue.name,
    capacity: venue.capacity ?? null,
    homeClubName: venue.homeClubName,
    imageUrl: venue.imageUrl,
    interiorImageUrl: venue.interiorImageUrl ?? null,
  };
}

function serializeNextFixture(fixture: TouchlinePublicFixture | null | undefined) {
  if (!fixture?.providerId || !fixture.startsAt || !fixture.homeTeam || !fixture.awayTeam) return null;
  return {
    fixtureId: fixture.providerId,
    startsAt: fixture.startsAt,
    status: fixture.status ?? null,
    roundName: fixture.roundName ?? null,
    homeTeam: {
      teamId: fixture.homeTeam.providerId,
      name: fixture.homeTeam.name,
      shortCode: fixture.homeTeam.shortCode ?? null,
      logoUrl: fixture.homeTeam.logoUrl ?? null,
    },
    awayTeam: {
      teamId: fixture.awayTeam.providerId,
      name: fixture.awayTeam.name,
      shortCode: fixture.awayTeam.shortCode ?? null,
      logoUrl: fixture.awayTeam.logoUrl ?? null,
    },
    venue: serializeVenue(fixture.venue),
    homeScore: fixture.homeScore ?? null,
    awayScore: fixture.awayScore ?? null,
    verifiedAt: fixture.verifiedAt ?? null,
  };
}

export function createTouchlineQaClubHubMirrorDto(input: Readonly<{
  club: TouchLineClubVisual;
  table: TouchlineOfficialLeagueTable;
  nextFixture: TouchlinePublicFixture | null;
  homeVenue: TouchlinePublicVenue | null;
  feed: TouchlineQaClubHubMirrorDto["feed"];
  generatedAt?: string;
}>): TouchlineQaClubHubMirrorDto | null {
  if (!TABLE_STATES.has(input.table.state as MirrorTableState)) return null;
  const dto: TouchlineQaClubHubMirrorDto = {
    schemaVersion: TOUCHLINE_QA_CLUBHUB_MIRROR_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    club: {
      teamId: input.club.teamId,
      slug: input.club.slug,
      name: input.club.name,
      shortCode: input.club.shortCode,
      logoUrl: input.club.logoUrl ?? null,
      homeVenue: serializeVenue(input.homeVenue),
    },
    nextFixture: serializeNextFixture(input.nextFixture),
    feed: {
      state: input.feed.state,
      items: input.feed.items.map((item) => ({ ...item })),
    },
    leagueTable: {
      state: input.table.state as MirrorTableState,
      asOf: input.table.asOf,
      season: input.table.season ? {
        providerSeasonId: input.table.season.providerSeasonId,
        name: input.table.season.name,
        sourceUpdatedAt: input.table.season.sourceUpdatedAt,
      } : null,
      coverage: {
        expectedClubs: input.table.coverage.expectedClubs,
        mappedClubs: input.table.coverage.mappedClubs,
        fixturesInSeason: input.table.coverage.fixturesInSeason,
        completedFixtures: input.table.coverage.completedFixtures,
        liveFixtures: input.table.coverage.liveFixtures,
        duplicateFixtures: input.table.coverage.duplicateFixtures,
      },
      rows: input.table.rows.map((row) => ({
        sportsRank: row.sportsRank,
        isTied: row.isTied,
        displayPosition: row.displayPosition,
        team: {
          teamId: row.team.providerTeamId,
          name: row.team.name,
          shortCode: row.team.shortCode,
          slug: row.team.slug,
          logoUrl: row.team.logoUrl,
        },
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
        form: [...row.form],
        liveFixture: row.liveFixture ? {
          fixtureId: row.liveFixture.providerFixtureId,
          scoreFor: row.liveFixture.scoreFor,
          scoreAgainst: row.liveFixture.scoreAgainst,
          stale: row.liveFixture.stale,
        } : null,
      })),
    },
  };
  return parseTouchlineQaClubHubMirrorDto(dto, { now: Date.parse(dto.generatedAt) });
}

export function parseTouchlineQaClubHubMirrorDto(
  value: unknown,
  options: Readonly<{ now?: number; maxAgeMs?: number }> = {},
): TouchlineQaClubHubMirrorDto | null {
  if (!isRecord(value) || containsForbiddenKey(value) || !hasExactKeys(value, [
    "schemaVersion", "generatedAt", "club", "nextFixture", "feed", "leagueTable",
  ])) return null;
  if (value.schemaVersion !== TOUCHLINE_QA_CLUBHUB_MIRROR_SCHEMA_VERSION || !isTimestamp(value.generatedAt)) return null;

  const now = options.now ?? Date.now();
  const generatedAt = Date.parse(value.generatedAt);
  const maxAgeMs = options.maxAgeMs ?? TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_AGE_MS;
  if (!Number.isFinite(now) || generatedAt > now + 60_000 || now - generatedAt > maxAgeMs) return null;

  if (!isRecord(value.club) || !hasExactKeys(value.club, ["teamId", "slug", "name", "shortCode", "logoUrl", "homeVenue"])) return null;
  if (typeof value.club.teamId !== "string" || !NUMERIC_ID.test(value.club.teamId)
    || typeof value.club.slug !== "string" || !SAFE_SLUG.test(value.club.slug)
    || !isPublicText(value.club.name, 120)
    || typeof value.club.shortCode !== "string" || !SAFE_SHORT_CODE.test(value.club.shortCode)
    || !isSafeLogoUrl(value.club.logoUrl)
    || (value.club.homeVenue !== null && !validVenue(value.club.homeVenue))) return null;

  if (value.nextFixture !== null && !validNextFixture(value.nextFixture, now)) return null;
  if (!validFeed(value.feed, value.club.teamId, now)) return null;

  if (!isRecord(value.leagueTable) || !hasExactKeys(value.leagueTable, ["state", "asOf", "season", "coverage", "rows"])) return null;
  if (typeof value.leagueTable.state !== "string" || !TABLE_STATES.has(value.leagueTable.state as MirrorTableState)
    || !isFreshTimestamp(value.leagueTable.asOf, now, TOUCHLINE_QA_CLUBHUB_TABLE_MAX_SOURCE_AGE_MS)
    || !validCoverage(value.leagueTable.coverage)
    || !Array.isArray(value.leagueTable.rows)
    || value.leagueTable.coverage.expectedClubs !== TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT
    || value.leagueTable.coverage.mappedClubs !== TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT
    || value.leagueTable.rows.length !== TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT
    || !value.leagueTable.rows.every(validRow)) return null;

  if (!isRecord(value.leagueTable.season)
    || !hasExactKeys(value.leagueTable.season, ["providerSeasonId", "name", "sourceUpdatedAt"])) return null;
  if (typeof value.leagueTable.season.providerSeasonId !== "string"
    || !NUMERIC_ID.test(value.leagueTable.season.providerSeasonId)
    || !isPublicText(value.leagueTable.season.name, 80)
    || !isFreshTimestamp(
      value.leagueTable.season.sourceUpdatedAt,
      now,
      TOUCHLINE_QA_CLUBHUB_SEASON_MAX_SOURCE_AGE_MS,
    )
    || Date.parse(value.leagueTable.season.sourceUpdatedAt) > Date.parse(value.leagueTable.asOf)) return null;

  const teamIds = value.leagueTable.rows.map((row) => row.team.teamId);
  if (new Set(teamIds).size !== teamIds.length) return null;
  const rows = value.leagueTable.rows;
  const coverage = value.leagueTable.coverage;
  const tableState = value.leagueTable.state as MirrorTableState;
  if (!validGlobalTableSemantics(rows, coverage, tableState)) return null;
  if (tableState === "partial") {
    if (coverage.duplicateFixtures === 0
      || rows.some((row) => row.sportsRank !== null || row.displayPosition !== null || row.isTied)) return null;
  } else {
    const displayPositions = rows.map((row) => row.displayPosition);
    if (coverage.duplicateFixtures !== 0
      || displayPositions.some((position) => position === null)
      || new Set(displayPositions).size !== rows.length
      || rows.some((row) => row.sportsRank === null)) return null;
  }
  if (tableState === "ready" && coverage.completedFixtures + coverage.liveFixtures === 0) return null;
  if (tableState === "pending_no_final") {
    if (coverage.completedFixtures !== 0 || coverage.liveFixtures !== 0) return null;
    if (rows.some((row) => row.played !== 0
      || row.won !== 0
      || row.drawn !== 0
      || row.lost !== 0
      || row.goalsFor !== 0
      || row.goalsAgainst !== 0
      || row.goalDifference !== 0
      || row.points !== 0
      || row.form.length !== 0)) return null;
  }
  if (value.nextFixture !== null
    && value.nextFixture.homeTeam.teamId !== value.club.teamId
    && value.nextFixture.awayTeam.teamId !== value.club.teamId) return null;
  return value as TouchlineQaClubHubMirrorDto;
}

export function resolveTouchlineClubHubDataSource(environment: TouchlineMirrorEnvironment = process.env) {
  return resolveTouchlineDataSource(environment);
}

export async function fetchTouchlineQaClubHubMirror(input: Readonly<{
  teamId: string;
  origin: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  now?: number;
}>): Promise<TouchlineQaClubHubMirrorReadResult> {
  const origin = resolveTouchlineQaReadOrigin(input.origin);
  if (!origin || !NUMERIC_ID.test(input.teamId)) return { state: "unavailable", reason: "configuration" };
  const url = new URL(`/api/touchline-qa/read/clubhub/${encodeURIComponent(input.teamId)}`, origin);
  const fetchImplementation = input.fetchImplementation ?? fetch;

  try {
    const response = await fetchImplementation(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? TOUCHLINE_QA_CLUBHUB_MIRROR_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) return { state: "unavailable", reason: "redirect" };
    if (!response.ok) return { state: "unavailable", reason: "http" };

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_BYTES) {
      return { state: "unavailable", reason: "oversize" };
    }
    const text = await response.text();
    if (!text.trim()) return { state: "unavailable", reason: "empty" };
    if (new TextEncoder().encode(text).byteLength > TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_BYTES) {
      return { state: "unavailable", reason: "oversize" };
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      return { state: "unavailable", reason: "invalid-json" };
    }
    if (isRecord(decoded) && isTimestamp(decoded.generatedAt)) {
      const now = input.now ?? Date.now();
      const generatedAt = Date.parse(decoded.generatedAt);
      if (generatedAt > now + 60_000 || now - generatedAt > TOUCHLINE_QA_CLUBHUB_MIRROR_MAX_AGE_MS) {
        return { state: "unavailable", reason: "stale" };
      }
    }
    const parsed = parseTouchlineQaClubHubMirrorDto(decoded, { now: input.now });
    if (!parsed || parsed.club.teamId !== input.teamId) return { state: "unavailable", reason: "invalid-schema" };
    return { state: "ready", data: parsed };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { state: "unavailable", reason: "timeout" };
    }
    return { state: "unavailable", reason: "network" };
  }
}
