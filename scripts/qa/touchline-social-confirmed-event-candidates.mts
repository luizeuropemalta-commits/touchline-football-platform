import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyTouchlineConfirmedMatchEvent } from "../../lib/touchlineArena/social-confirmed-event-contract.ts";
import { checksumTouchlineConfirmedEventFact } from "../../lib/touchlineArena/social-confirmed-event-render-source.ts";
import { touchlineFixtureState } from "../../lib/touchlineArena/match-centre.ts";

const NUMERIC_ID = /^[1-9]\d{0,19}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SOURCE_KEY = /^(fixture-provider|fixture-event|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$/;
const SOURCE_READ_TIMEOUT_MS = 45_000;
const EVENT_DISCOVERY_PAGE_SIZE = 200;
const EVENT_DISCOVERY_MAX_ROWS = 2_000;
const EVENT_FRESHNESS_MS = 15 * 60 * 1000;

export type TouchlineSocialConfirmedEventContentType = "GOAL_CONFIRMED" | "RED_CARD_CONFIRMED" | "HAT_TRICK_HERO";
export type TouchlineSocialConfirmedEventCandidate = Readonly<{
  contentType: TouchlineSocialConfirmedEventContentType;
  fixtureId: string;
  eventId: string;
  teamId: null;
  firstObservedAt: string;
  startsAt: string;
  inputChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
}>;

function parseSourceRevision(payload: Record<string, unknown>) {
  const checksum = String(payload.sourceRevisionChecksum ?? "");
  const value = payload.sourceRevisionManifest;
  if (!SHA256.test(checksum) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const manifest: Record<string, number> = {};
  for (const [key, rawRevision] of Object.entries(value as Record<string, unknown>)) {
    const revision = Number(rawRevision);
    if (!SOURCE_KEY.test(key) || !Number.isSafeInteger(revision) || revision < 0) return null;
    manifest[key] = revision;
  }
  if (Object.keys(manifest).length < 1 || Object.keys(manifest).length > 128) return null;
  return { sourceRevisionManifest: Object.freeze(manifest), sourceRevisionChecksum: checksum } as const;
}

export async function readCurrentTouchlineConfirmedEventSource(input: Readonly<{
  base: URL;
  renderSecret: string;
  fixtureId: string;
  eventId: string;
  contentType: TouchlineSocialConfirmedEventContentType;
}>) {
  const url = new URL("/api/admin/social-publications/source", input.base);
  url.searchParams.set("contentType", input.contentType);
  url.searchParams.set("fixtureId", input.fixtureId);
  url.searchParams.set("eventId", input.eventId);
  const response = await fetch(url, {
    method: "GET",
    headers: { cookie: `tl-social-render=${encodeURIComponent(input.renderSecret)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.status === 409 && payload?.ok === false) {
    throw new Error("TL_CONFIRMED_EVENT_CURRENT_SOURCE_NOT_ELIGIBLE");
  }
  const revision = payload ? parseSourceRevision(payload) : null;
  const startsAt = String(payload?.startsAt ?? "");
  const sourceSnapshotAt = String(payload?.sourceSnapshotAt ?? "");
  const inputChecksum = String(payload?.sourceChecksum ?? "");
  if (!response.ok || payload?.ok !== true || payload.contentType !== input.contentType
    || String(payload.fixtureId ?? "") !== input.fixtureId
    || String(payload.eventId ?? "") !== input.eventId || payload.teamId !== null
    || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(sourceSnapshotAt))
    || Date.parse(sourceSnapshotAt) < Date.parse(startsAt)
    || !SHA256.test(inputChecksum) || !revision) {
    throw new Error("TL_CONFIRMED_EVENT_CURRENT_SOURCE_UNAVAILABLE");
  }
  return { fixtureId: input.fixtureId, eventId: input.eventId, teamId: null,
    startsAt, sourceSnapshotAt, inputChecksum, ...revision };
}

export async function discoverTouchlineSocialConfirmedEventCandidates(input: Readonly<{
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitFixtureId?: string | null;
  explicitEventId?: string | null;
}>): Promise<TouchlineSocialConfirmedEventCandidate[]> {
  const fixtureId = input.explicitFixtureId?.trim() || null;
  const eventId = input.explicitEventId?.trim() || null;
  if ((fixtureId && !NUMERIC_ID.test(fixtureId)) || (eventId && !NUMERIC_ID.test(eventId))
    || Boolean(fixtureId) !== Boolean(eventId)) {
    throw new Error("TL_CONFIRMED_EVENT_EXPLICIT_IDENTITY_INVALID");
  }
  const now = Date.now();
  const eventRows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < EVENT_DISCOVERY_MAX_ROWS; offset += EVENT_DISCOVERY_PAGE_SIZE) {
    let eventQuery = input.admin.from("football_fixture_events")
      .select("provider_event_id,event_type,event_status,result,provider_team_id,provider_player_id,minute,extra_minute,info,addition,source_synced_at,created_at,football_fixtures!inner(provider_fixture_id,starts_at,status)")
      .eq("provider", "sportmonks")
      .gte("created_at", new Date(now - EVENT_FRESHNESS_MS).toISOString())
      .gte("football_fixtures.starts_at", new Date(now - 36 * 60 * 60 * 1000).toISOString())
      .order("source_synced_at", { ascending: true })
      .order("provider_event_id", { ascending: true })
      .range(offset, offset + EVENT_DISCOVERY_PAGE_SIZE - 1);
    if (eventId) eventQuery = eventQuery.eq("provider_event_id", eventId);
    if (fixtureId) eventQuery = eventQuery.eq("football_fixtures.provider_fixture_id", fixtureId);
    const eventPage = await eventQuery;
    if (eventPage.error || !Array.isArray(eventPage.data)) {
      throw new Error("TL_CONFIRMED_EVENT_SOURCE_DISCOVERY_FAILED");
    }
    eventRows.push(...eventPage.data as Record<string, unknown>[]);
    if (eventPage.data.length < EVENT_DISCOVERY_PAGE_SIZE) break;
    if (offset + EVENT_DISCOVERY_PAGE_SIZE >= EVENT_DISCOVERY_MAX_ROWS) {
      throw new Error("TL_CONFIRMED_EVENT_SOURCE_DISCOVERY_OVERFLOW");
    }
  }
  const knownObservations = await input.admin.from("touchline_social_confirmed_event_observations")
    .select("fixture_provider_id,event_provider_id,event_fact_checksum,confirmation_state")
    .eq("confirmation_state", "CONFIRMED").limit(EVENT_DISCOVERY_MAX_ROWS);
  if (knownObservations.error || !Array.isArray(knownObservations.data)) {
    throw new Error("TL_CONFIRMED_EVENT_OBSERVATION_READ_FAILED");
  }
  const confirmedFactByIdentity = new Map(knownObservations.data.map((row) => [
    `${String(row.fixture_provider_id ?? "")}:${String(row.event_provider_id ?? "")}`,
    String(row.event_fact_checksum ?? ""),
  ]));
  for (const row of eventRows) {
    const relation = row.football_fixtures as unknown as Record<string, unknown> | null;
    const observedFixtureId = String(relation?.provider_fixture_id ?? "");
    const observedEventId = String(row.provider_event_id ?? "");
    const kind = classifyTouchlineConfirmedMatchEvent({
      type: String(row.event_type ?? ""), status: String(row.event_status ?? ""),
      info: row.info === null ? null : String(row.info ?? ""),
      addition: row.addition === null ? null : String(row.addition ?? ""),
    });
    const startsAt = String(relation?.starts_at ?? "");
    const createdAt = String(row.created_at ?? "");
    if (!kind || !NUMERIC_ID.test(observedFixtureId) || !NUMERIC_ID.test(observedEventId)
      || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(createdAt))
      || now - Date.parse(createdAt) > EVENT_FRESHNESS_MS
      || touchlineFixtureState({ startsAt, status: String(relation?.status ?? "") }, now) !== "live") continue;
    const factChecksum = checksumTouchlineConfirmedEventFact({
      fixtureId: observedFixtureId, eventId: observedEventId, eventKind: kind,
      result: row.result === null ? null : String(row.result ?? ""),
      teamId: String(row.provider_team_id ?? ""), playerId: String(row.provider_player_id ?? ""),
      minute: Number(row.minute), extraMinute: row.extra_minute === null ? null : Number(row.extra_minute),
    });
    if (confirmedFactByIdentity.get(`${observedFixtureId}:${observedEventId}`) === factChecksum) continue;
    const observed = await input.admin.rpc("touchline_social_043_observe_confirmed_event", {
      p_fixture_provider_id: observedFixtureId, p_event_provider_id: observedEventId,
    });
    if (observed.error) throw new Error("TL_CONFIRMED_EVENT_OBSERVATION_FAILED");
  }
  let query = input.admin.from("touchline_social_confirmed_event_observations")
    .select("fixture_provider_id,event_provider_id,content_type,first_observed_at,confirmed_at")
    .eq("confirmation_state", "CONFIRMED")
    .order("confirmed_at", { ascending: true }).limit(100);
  if (fixtureId && eventId) query = query.eq("fixture_provider_id", fixtureId).eq("event_provider_id", eventId);
  const observations = await query;
  if (observations.error || !Array.isArray(observations.data)) {
    throw new Error("TL_CONFIRMED_EVENT_OBSERVATION_READ_FAILED");
  }
  if (fixtureId && eventId && observations.data.length !== 1) {
    throw new Error("TL_CONFIRMED_EVENT_EXPLICIT_IDENTITY_NOT_ELIGIBLE");
  }
  const groups = await Promise.all(observations.data.map(async (row) => {
    const observedFixtureId = String(row.fixture_provider_id ?? "");
    const observedEventId = String(row.event_provider_id ?? "");
    const contentType = String(row.content_type ?? "") as TouchlineSocialConfirmedEventContentType;
    const firstObservedAt = String(row.first_observed_at ?? "");
    if (!NUMERIC_ID.test(observedFixtureId) || !NUMERIC_ID.test(observedEventId)
      || !["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(contentType)
      || !Number.isFinite(Date.parse(firstObservedAt))) {
      throw new Error("TL_CONFIRMED_EVENT_OBSERVATION_IDENTITY_INVALID");
    }
    const source = await readCurrentTouchlineConfirmedEventSource({
      base: input.base, renderSecret: input.renderSecret, fixtureId: observedFixtureId,
      eventId: observedEventId, contentType,
    });
    const candidates: TouchlineSocialConfirmedEventCandidate[] = [
      { ...source, contentType, firstObservedAt },
    ];
    if (contentType === "GOAL_CONFIRMED") {
      try {
        const hatTrick = await readCurrentTouchlineConfirmedEventSource({
          base: input.base,
          renderSecret: input.renderSecret,
          fixtureId: observedFixtureId,
          eventId: observedEventId,
          contentType: "HAT_TRICK_HERO",
        });
        candidates.push({ ...hatTrick, contentType: "HAT_TRICK_HERO", firstObservedAt });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "TL_CONFIRMED_EVENT_CURRENT_SOURCE_NOT_ELIGIBLE") throw error;
      }
    }
    return candidates;
  }));
  return groups.flat();
}
