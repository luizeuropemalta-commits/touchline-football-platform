import { sanitizeFantasyFixtureFeedForClient } from "@/lib/football-data/fantasy-sanitize";
import { isOfficialSportmonksFixtureId } from "@/lib/football-data/fixture-schedule-store";
import type {
  FootballDataProviderName,
  TouchlineFantasyFixtureFeed,
  TouchlineFixture,
} from "@/lib/football-data/types";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 160;

type PersistedFantasyFixtureRow = {
  provider?: unknown;
  provider_fixture_id?: unknown;
  fixture_payload?: unknown;
  lineups_payload?: unknown;
  formations_payload?: unknown;
  sidelined_payload?: unknown;
  events_payload?: unknown;
  last_synced_at?: unknown;
};

export type PersistedFantasyFixtureFeedSnapshot = Readonly<{
  feed: TouchlineFantasyFixtureFeed;
  capturedAt: string;
}>;

export type PersistedFantasyFixtureFeedReadResult =
  | Readonly<{ status: "available"; snapshot: PersistedFantasyFixtureFeedSnapshot }>
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "unavailable" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProviderName(value: unknown): value is FootballDataProviderName {
  return value === "sportmonks";
}

function isStoredFixture(value: unknown): value is TouchlineFixture {
  if (!isRecord(value) || typeof value.id !== "string" || !isOfficialSportmonksFixtureId(value.providerId)) return false;
  if (!isProviderName(value.provider) || !isRecord(value.source)) return false;
  return isProviderName(value.source.provider) && typeof value.source.providerId === "string";
}

function safeTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : new Date(0).toISOString();
}

function persistedTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function normalizePersistedRow(row: PersistedFantasyFixtureRow): TouchlineFantasyFixtureFeed | null {
  if (!isStoredFixture(row.fixture_payload)) return null;
  if (!Array.isArray(row.lineups_payload) || !Array.isArray(row.formations_payload)) return null;
  if (!Array.isArray(row.sidelined_payload) || !Array.isArray(row.events_payload)) return null;

  try {
    return sanitizeFantasyFixtureFeedForClient({
      fixture: row.fixture_payload,
      lineups: row.lineups_payload as TouchlineFantasyFixtureFeed["lineups"],
      formations: row.formations_payload as TouchlineFantasyFixtureFeed["formations"],
      sidelined: row.sidelined_payload as TouchlineFantasyFixtureFeed["sidelined"],
      events: row.events_payload as TouchlineFantasyFixtureFeed["events"],
      fetchedAt: safeTimestamp(row.last_synced_at),
      mediaPolicy: {
        officialMediaExposed: false,
        note: "Public ClubHub reads only a sanitized persisted snapshot; provider media and raw payloads stay server-side.",
      },
    });
  } catch {
    return null;
  }
}

/**
 * Durable public read model for ClubHub. It never calls Sportmonks and never
 * returns raw provider payloads, provider media URLs, or credentials.
 */
export async function readPublicFantasyFixtureSnapshots(options: {
  provider?: FootballDataProviderName;
  limit?: number;
} = {}) {
  const supabase = createAdminClient();
  if (!supabase) return [] as TouchlineFantasyFixtureFeed[];

  const provider = options.provider ?? "sportmonks";
  const requestedLimit = Number.isFinite(options.limit) ? Math.trunc(options.limit ?? DEFAULT_LIMIT) : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
  const { data, error } = await supabase
    .from("football_fantasy_fixture_feeds")
    .select("provider,provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload,last_synced_at")
    .eq("provider", provider)
    .order("last_synced_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) return [] as TouchlineFantasyFixtureFeed[];
  return data
    .map((row) => normalizePersistedRow(row as PersistedFantasyFixtureRow))
    .filter((feed): feed is TouchlineFantasyFixtureFeed => Boolean(feed));
}

/**
 * Reads one already-persisted fixture feed. This is an internal server read
 * model: callers must still map it through an explicit public DTO before
 * serialising it to a browser.
 */
export async function readPersistedFantasyFixtureFeedResult(
  fixtureId: string,
): Promise<PersistedFantasyFixtureFeedReadResult> {
  const normalizedFixtureId = fixtureId.trim();
  if (!/^[0-9]{1,20}$/.test(normalizedFixtureId)) return { status: "pending" };

  const supabase = createAdminClient();
  if (!supabase) return { status: "unavailable" };

  const { data, error } = await supabase
    .from("football_fantasy_fixture_feeds")
    .select("provider,provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload,last_synced_at")
    .eq("provider", "sportmonks")
    .eq("provider_fixture_id", normalizedFixtureId)
    .maybeSingle();

  if (error) return { status: "unavailable" };
  // The schedule intentionally exists before Sportmonks publishes line-ups
  // and detailed match facts. A missing row is an expected pre-match state,
  // not an operational failure.
  if (!data) return { status: "pending" };
  const row = data as PersistedFantasyFixtureRow;
  const capturedAt = persistedTimestamp(row.last_synced_at);
  if (!capturedAt || String(row.provider_fixture_id ?? "").trim() !== normalizedFixtureId) {
    return { status: "unavailable" };
  }
  const feed = normalizePersistedRow(row);
  if (!feed) return { status: "unavailable" };

  return { status: "available", snapshot: { feed, capturedAt } };
}

export async function readPersistedFantasyFixtureFeed(
  fixtureId: string,
): Promise<PersistedFantasyFixtureFeedSnapshot | null> {
  const result = await readPersistedFantasyFixtureFeedResult(fixtureId);
  return result.status === "available" ? result.snapshot : null;
}
