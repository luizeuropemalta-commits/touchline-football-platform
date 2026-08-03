import { sanitizeFantasyFixtureFeedForClient } from "@/lib/football-data/fantasy-sanitize";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProviderName(value: unknown): value is FootballDataProviderName {
  return value === "sportmonks" || value === "opta" || value === "sportradar" || value === "statsperform";
}

function isStoredFixture(value: unknown): value is TouchlineFixture {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.providerId !== "string") return false;
  if (!isProviderName(value.provider) || !isRecord(value.source)) return false;
  return isProviderName(value.source.provider) && typeof value.source.providerId === "string";
}

function safeTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : new Date(0).toISOString();
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
