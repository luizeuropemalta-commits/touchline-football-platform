/** Private ingestion evidence. Never included in public fixture DTOs. */
import { mapSportmonksFixtureCoaches } from "./fixture-coach-attribution.ts";
import { sanitizeProviderPayloadForPersistence } from "./provider-payload-sanitize.ts";

export type PrivateFixtureCoachNames = Readonly<{
  version: 1;
  source: "sportmonks.fixture.coaches";
  fixtureProviderId: string;
  competitionProviderId: string;
  seasonProviderId: string;
  identities: readonly Readonly<{
    coachProviderId: string;
    clubProviderId: string;
    location: "home" | "away";
    displayName: string | null;
  }>[];
}>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function name(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 240) return null;
  // Refuse controls/formatting, HTML, contact/address strings and placeholders.
  // Do not guess a missing name from ID, club, ranking or another fixture.
  if (/[\p{Cc}\p{Cf}<>@]/u.test(value)) return null;
  const label = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!label || [...label].length > 120 || !/\p{L}/u.test(label)
    || /:\/\/|www\.|^coach\s+\d+$/iu.test(label)) return null;
  const safe = sanitizeProviderPayloadForPersistence({ displayName: label });
  return safe.displayName === label ? label : null;
}

/** Called on the original official response in server memory, before raw is
 * discarded. Its output is private review evidence, never editorial approval,
 * a current appointment, or a change to fixture attribution/scoring. */
export function projectPrivateFixtureCoachNames(raw: unknown): PrivateFixtureCoachNames | null {
  const attribution = mapSportmonksFixtureCoaches(raw);
  if (attribution.status !== "complete") return null;
  const coaches = record(raw).coaches as unknown[];
  return {
    version: 1,
    source: attribution.source,
    fixtureProviderId: attribution.fixtureProviderId,
    competitionProviderId: attribution.competitionProviderId,
    seasonProviderId: attribution.seasonProviderId,
    identities: attribution.assignments.map(assignment => {
      // mapSportmonksFixtureCoaches already proved the exact two meta links.
      const coach = record(coaches.find(value => String(record(value).id) === assignment.coachProviderId));
      const absent = coach.display_name === undefined || coach.display_name === null
        || typeof coach.display_name === "string" && coach.display_name.trim() === "";
      return { ...assignment, displayName: name(absent ? coach.name : coach.display_name) };
    }),
  };
}


export type CoachFeedReceipt = Readonly<{ id: string; persistedAt: string }>;
export const coachEditorialEvidenceEnabled = () => process.env.TOUCHLINE_COACH_EDITORIAL_ENABLED === "true";

export function parseCoachFeedReceipt(value: unknown): CoachFeedReceipt | null {
  const row = record(value);
  return typeof row.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
    && typeof row.persistedAt === "string" && Number.isFinite(Date.parse(row.persistedAt))
    ? { id: row.id, persistedAt: row.persistedAt } : null;
}

/** Only ingestion callers possess the service client and unsanitized provider
 * response. Names go to a private review RPC, never to the stored public feed. */
export async function stageObservedCoachEvidence(
  admin: Pick<import("@supabase/supabase-js").SupabaseClient, "rpc">,
  feed: import("./types.ts").TouchlineFantasyFixtureFeed,
  sanitized: import("./types.ts").TouchlineFantasyFixtureFeed,
  receipt: CoachFeedReceipt | null,
): Promise<string | null> {
  if (!coachEditorialEvidenceEnabled()) return null;
  const projection = projectPrivateFixtureCoachNames(feed.fixture.source?.raw);
  if (!projection) return "coach-editorial:evidence-unavailable";
  if (!receipt) return "coach-editorial:receipt-unconfirmed";
  try {
    const result = await admin.rpc("touchline_stage_coach_fixture_v2", {
      p_fixture_id: sanitized.fixture.providerId,
      p_feed_id: receipt.id,
      p_synced_at: receipt.persistedAt,
      p_expected: { fixture: sanitized.fixture, lineups: sanitized.lineups,
        formations: sanitized.formations, sidelined: sanitized.sidelined, events: sanitized.events },
      p_projection: projection,
    }).abortSignal(AbortSignal.timeout(8_000));
    return result.error || !Number.isSafeInteger(result.data) || result.data < 0
      ? "coach-editorial:staging-unconfirmed" : null;
  } catch { return "coach-editorial:staging-unavailable"; }
}
