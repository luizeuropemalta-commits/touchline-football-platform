import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TouchlineFixturePeriod } from "./types";
import { readTouchlineConfirmedEventPushSource } from "../touchlineArena/social-confirmed-event-draft-server";
import { readTouchlineSocialSourceRevisionCheckpoint } from "../touchlineArena/social-source-revision-server";
import { normalizeMatchPushSourceAgePolicy, matchPushSourceDeadline } from "../touchlineArena/match-push-source-freshness";
import { parseTouchlineDeviceRegistration } from "../touchlineArena/push-device-contract";
import { touchlinePushSubscriptionFingerprint } from "../touchlineArena/push-subscription-fingerprint";
import { evaluateNotificationQuietHours } from "../touchlineArena/notification-quiet-hours";
import { buildMatchEventNotification } from "../touchlineArena/match-event-notification";
import { matchPushLiveEventWindow } from "../touchlineArena/match-push-live-event-window";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[1-9]\d{0,19}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const BUDGET_MS = 10_000, MAX_ROWS = 500, MAX_PAIRS = 50;
type Row = Record<string, unknown>;
type Status = "disabled" | "completed" | "unavailable" | "limit-exceeded" | "aborted" | "timed-out" | "unconfirmed";
export type MatchPushProducerResult = Readonly<{ status: Status; prepared: number; baselined: number;
  attempted: number; storedOrExisting: number; suppressed: number }>;
export type MatchPushProducerInput = Readonly<{
  admin: SupabaseClient | null;
  fixtureProviderIds: readonly string[];
  enabled?: boolean;
  signal: AbortSignal;
  policy: Readonly<{ maximumEventLagSeconds: number; maximumSourceAgeSeconds: number; sourceAgeMs: unknown }>;
  locale: "en-GB" | "pt-BR";
  now: () => Date;
}>;
const object = (value: unknown): Row | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const providerId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
function complete(response: { data: unknown; error: unknown; count: number | null }, cap: number): Row[] {
  if (response.error || !Array.isArray(response.data) || !Number.isSafeInteger(response.count)
    || response.count !== response.data.length || response.data.length > cap || response.data.some(row => !object(row))) throw Error("READ_UNAVAILABLE");
  return JSON.parse(JSON.stringify(response.data)) as Row[];
}
function unique(rows: Row[], key: (row: Row) => unknown): boolean { return new Set(rows.map(key)).size === rows.length; }

/** Only current-cycle successfully persisted/reconciled fixture IDs are allowed.
 * At most 10 fixtures, 50 device/fixture pairs, 500 source events and 50 admit
 * attempts, sequential and under one 10s deadline. No provider fetch/send/retry.
 * Existing canonical readers own their configured admin; identity/revision must
 * agree with the supplied admin. Their ignored cancellation cannot progress late.
 */
export async function runMatchPushProducer(input: MatchPushProducerInput): Promise<MatchPushProducerResult> {
  const counts = { prepared: 0, baselined: 0, attempted: 0, storedOrExisting: 0, suppressed: 0 };
  const result = (status: Status): MatchPushProducerResult => ({ status, ...counts });
  if (input.enabled !== true) return result("disabled");
  const { admin, signal, now, locale } = input;
  const maximumEventLagSeconds = input.policy?.maximumEventLagSeconds;
  const maximumSourceAgeSeconds = input.policy?.maximumSourceAgeSeconds;
  const sourceAgeMs = normalizeMatchPushSourceAgePolicy(input.policy?.sourceAgeMs);
  if (!admin || !sourceAgeMs || !Number.isSafeInteger(maximumEventLagSeconds) || maximumEventLagSeconds <= 0 || maximumEventLagSeconds > 2147483647
    || !Number.isSafeInteger(maximumSourceAgeSeconds) || maximumSourceAgeSeconds <= 0 || maximumSourceAgeSeconds > 2147483647
    || !["en-GB", "pt-BR"].includes(locale) || !Array.isArray(input.fixtureProviderIds)
    || input.fixtureProviderIds.length > 100 || input.fixtureProviderIds.some(id => !providerId(id))) return result("unavailable");
  const ids = [...new Set(input.fixtureProviderIds)].sort();
  if (ids.length > 10) return result("limit-exceeded");
  if (signal.aborted) return result("aborted");
  if (!ids.length) return result("completed");
  const controller = new AbortController(), started = performance.now();
  let rpcPending = false;
  const check = () => { if (controller.signal.aborted || performance.now() - started >= BUDGET_MS) throw Error("STOPPED"); };
  const instant = () => { const date = now(); if (!Number.isFinite(date.getTime())) throw Error("INVALID_CLOCK"); return date; };
  return new Promise(resolve => {
    let settled = false;
    const finish = (status: Status) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(result(status));
    };
    const abort = () => { finish(rpcPending ? "unconfirmed" : "aborted"); controller.abort(); };
    const timer = setTimeout(() => { finish(rpcPending ? "unconfirmed" : "timed-out"); controller.abort(); }, BUDGET_MS);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    const run = async (): Promise<Status> => {
      check();
      const checkpoint = await readTouchlineSocialSourceRevisionCheckpoint([]); check();
      if (!checkpoint || !Number.isSafeInteger(checkpoint.clockRevision)) return "unavailable";
      const fixtures = complete(await admin.from("football_fixtures").select("id,provider,provider_fixture_id", { count: "exact" })
        .eq("provider", "sportmonks").in("provider_fixture_id", ids).limit(11).abortSignal(controller.signal), 10); check();
      if (fixtures.length !== ids.length || !unique(fixtures, r => r.id) || !unique(fixtures, r => r.provider_fixture_id)
        || fixtures.some(r => !uuid(r.id) || r.provider !== "sportmonks" || !providerId(r.provider_fixture_id) || !ids.includes(r.provider_fixture_id))) return "unavailable";
      const fixtureIds = fixtures.map(r => r.id as string);
      const interests = complete(await admin.from("touchline_fixture_alert_subscriptions").select("fixture_id,user_id,created_at", { count: "exact" })
        .in("fixture_id", fixtureIds).limit(MAX_ROWS + 1).abortSignal(controller.signal), MAX_ROWS); check();
      if (!unique(interests, r => `${r.fixture_id}:${r.user_id}`) || interests.some(r => !fixtureIds.includes(String(r.fixture_id)) || !uuid(r.user_id))) return "unavailable";
      if (!interests.length) return "completed";
      const users = [...new Set(interests.map(r => r.user_id as string))];
      const devices = complete(await admin.from("notification_devices").select("id,user_id,installation_id,permission,push_subscription", { count: "exact" })
        .in("user_id", users).limit(MAX_ROWS + 1).abortSignal(controller.signal), MAX_ROWS); check();
      const preferences = complete(await admin.from("notification_preferences").select("user_id,channels,settings,frequency,explicit_consent_at,quiet_hours", { count: "exact" })
        .in("user_id", users).limit(MAX_ROWS + 1).abortSignal(controller.signal), MAX_ROWS); check();
      if (!unique(devices, r => r.id) || devices.some(r => !uuid(r.id) || !users.includes(String(r.user_id)))
        || !unique(preferences, r => r.user_id) || preferences.some(r => !users.includes(String(r.user_id)))) return "unavailable";
      const pairs = interests.flatMap(interest => devices.filter(device => device.user_id === interest.user_id).map(device => ({ interest, device })));
      if (pairs.length > MAX_PAIRS) return "limit-exceeded";
      if (!pairs.length) return "completed";
      const feeds = complete(await admin.from("football_fantasy_fixture_feeds").select("provider,provider_fixture_id,fixture_payload,events_payload,last_synced_at", { count: "exact" })
        .eq("provider", "sportmonks").in("provider_fixture_id", ids).limit(11).abortSignal(controller.signal), 10); check();
      const observations = complete(await admin.from("touchline_social_confirmed_event_observations").select("*", { count: "exact" })
        .in("fixture_provider_id", ids).limit(MAX_ROWS + 1).abortSignal(controller.signal), MAX_ROWS); check();
      if (feeds.length !== ids.length || !unique(feeds, r => r.provider_fixture_id)
        || feeds.some(r => r.provider !== "sportmonks" || !ids.includes(String(r.provider_fixture_id)))
        || !unique(observations, r => `${r.fixture_provider_id}:${r.event_provider_id}`)
        || observations.some(r => !ids.includes(String(r.fixture_provider_id)) || !providerId(r.event_provider_id))) return "unavailable";
      let totalEvents = 0;
      for (const feed of feeds) {
        const fixture = object(feed.fixture_payload);
        if (!fixture || fixture.provider !== "sportmonks" || fixture.providerId !== feed.provider_fixture_id || !Array.isArray(feed.events_payload)) return "unavailable";
        const events = feed.events_payload as unknown[];
        totalEvents += events.length;
        if (events.some(value => { const e = object(value); return !e || !providerId(e.providerId) || e.provider !== "sportmonks" || e.fixtureId !== feed.provider_fixture_id; })
          || new Set(events.map(e => (e as Row).providerId)).size !== events.length) return "unavailable";
      }
      if (totalEvents > MAX_ROWS) return "limit-exceeded";
      const freshCheckpoint = await readTouchlineSocialSourceRevisionCheckpoint([]); check();
      if (!freshCheckpoint || freshCheckpoint.clockRevision !== checkpoint.clockRevision) return "unavailable";
      const rpc = async (request: Row): Promise<Row> => {
        check(); rpcPending = true;
        const response = await admin.rpc("touchline_match_push_enrollment", { p_request: request }).abortSignal(controller.signal);
        check();
        const payload = object(response.data);
        if (response.error || !payload || typeof payload.status !== "string") throw Error("RPC_UNCONFIRMED");
        rpcPending = false; return payload;
      };
      let sourceReads = 0;
      for (const { interest, device } of pairs) {
        check();
        const pref = preferences.find(r => r.user_id === device.user_id);
        const eligibleConsent = () => {
          const time = instant();
          const consent = typeof pref?.explicit_consent_at === "string" ? Date.parse(pref.explicit_consent_at) : NaN;
          const subscribed = typeof interest.created_at === "string" ? Date.parse(interest.created_at) : NaN;
          const quiet = evaluateNotificationQuietHours(pref?.quiet_hours, time);
          return pref && object(pref.channels)?.push === true && object(pref.settings)?.goalsAndEvents === true
            && pref.frequency === "realtime" && Number.isFinite(consent) && consent <= time.getTime()
            && Number.isFinite(subscribed) && subscribed <= time.getTime() && ["disabled", "outside"].includes(quiet);
        };
        const registration = parseTouchlineDeviceRegistration({ installationId: device.installation_id, permission: device.permission, subscription: device.push_subscription });
        const binding = touchlinePushSubscriptionFingerprint(registration);
        if (!binding || !eligibleConsent()) { counts.suppressed++; continue; }
        const canonical = fixtures.find(r => r.id === interest.fixture_id)!;
        const feed = feeds.find(r => r.provider_fixture_id === canonical.provider_fixture_id)!;
        const fixture = feed.fixture_payload as Row;
        const age = typeof feed.last_synced_at === "string" ? instant().getTime() - Date.parse(feed.last_synced_at) : NaN;
        if (!Number.isFinite(age) || age < 0 || age > maximumSourceAgeSeconds * 1000) { counts.suppressed++; continue; }
        const source = { fixture_payload: feed.fixture_payload, events_payload: feed.events_payload, last_synced_at: feed.last_synced_at };
        const common: Row = { deviceId: device.id, fixtureId: canonical.id, expectedClockRevision: String(checkpoint.clockRevision),
          expectedSource: source, expectedSubscription: device.push_subscription, expectedQuietHours: pref!.quiet_hours,
          subscriptionFingerprint: binding, maximumEventLagSeconds, maximumSourceAgeSeconds };
        const prepared = await rpc({ ...common, operation: "prepare" }); counts.prepared++;
        if (prepared.status === "baselined") { counts.baselined++; continue; }
        // A closed/paused fixture or changed consent affects this pair only.
        // Source revision drift invalidates the shared snapshot and stops all.
        if (["unavailable", "stale-baseline"].includes(String(prepared.status))) { counts.suppressed++; continue; }
        if (prepared.status === "stale-source") return "unavailable";
        if (prepared.status !== "ready" || !providerId(prepared.generation) || !object(prepared.baseline) || !object(prepared.current)) return "unconfirmed";
        const periods = fixture.periods;
        if (!Array.isArray(periods) || periods.some(p => !object(p))) return "unavailable";
        const candidates = (feed.events_payload as Row[]).filter(e => observations.some(o => o.fixture_provider_id === canonical.provider_fixture_id
          && o.event_provider_id === e.providerId && o.confirmation_state === "CONFIRMED"));
        for (const event of candidates) {
          check();
          const window = matchPushLiveEventWindow({ fixtureId: canonical.provider_fixture_id as string,
            live: ["2", "22", "6"].includes(String(fixture.providerStateId)), confirmed: true,
            periods: periods as TouchlineFixturePeriod[], baseline: prepared.baseline as TouchlineFixturePeriod,
            current: prepared.current as TouchlineFixturePeriod,
            event: { periodId: event.periodId as string | undefined, minute: event.minute as number | undefined, extraMinute: event.extraMinute as number | undefined }, maximumEventLagSeconds });
          if (window.status !== "eligible") { counts.suppressed++; continue; }
          if (sourceReads >= 50) return "limit-exceeded";
          sourceReads++;
          const verified = await readTouchlineConfirmedEventPushSource(canonical.provider_fixture_id as string, event.providerId as string); check();
          if (!verified.ok || verified.evidence.canonicalFixtureId !== canonical.id || verified.evidence.fixtureProviderId !== canonical.provider_fixture_id
            || verified.evidence.eventProviderId !== event.providerId || verified.evidence.clockRevision !== checkpoint.clockRevision
            || verified.data.fixtureId !== canonical.provider_fixture_id || verified.data.eventId !== event.providerId
            || !["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(verified.data.contentType)
            || !HASH.test(verified.data.sourceChecksum)) { counts.suppressed++; continue; }
          const copy = buildMatchEventNotification(verified, locale, false);
          if (!copy || Buffer.byteLength(JSON.stringify(copy), "utf8") > 3072) { counts.suppressed++; continue; }
          const observation = observations.find(o => o.fixture_provider_id === canonical.provider_fixture_id && o.event_provider_id === event.providerId)!;
          const lastObserved = typeof observation.last_observed_at === "string" ? Date.parse(observation.last_observed_at) : NaN;
          const requestedDeadline = Math.min(Date.parse(feed.last_synced_at as string), lastObserved) + maximumSourceAgeSeconds * 1000;
          if (!Number.isSafeInteger(requestedDeadline) || !Number.isFinite(new Date(requestedDeadline).getTime())) { counts.suppressed++; continue; }
          const expiry = matchPushSourceDeadline(verified.evidence, sourceAgeMs, new Date(requestedDeadline).toISOString(), instant());
          if (!expiry || !eligibleConsent()) { counts.suppressed++; continue; }
          const revision = await readTouchlineSocialSourceRevisionCheckpoint(Object.keys(verified.data.sourceRevisionManifest)); check();
          if (!revision || revision.clockRevision !== checkpoint.clockRevision || revision.checksum !== verified.data.sourceRevisionChecksum) return "unavailable";
          const finalExpiry = matchPushSourceDeadline(verified.evidence, sourceAgeMs, expiry, instant());
          if (!finalExpiry || !eligibleConsent()) { counts.suppressed++; continue; }
          if (counts.attempted >= 50) return "limit-exceeded";
          counts.attempted++;
          const receipt = await rpc({ ...common, operation: "admit", generation: prepared.generation, eventId: event.providerId,
            sourceChecksum: verified.data.sourceChecksum, sourceSnapshotAt: verified.data.sourceSnapshotAt,
            expectedObservation: observation, expiresAt: finalExpiry, locale });
          if (receipt.status === "stored-or-existing" && uuid(receipt.id)) counts.storedOrExisting++;
          else if (receipt.status === "suppressed") { counts.suppressed++; }
          else if (["rebaseline", "baselined", "unavailable", "stale-baseline"].includes(String(receipt.status))) { counts.suppressed++; break; }
          else if (receipt.status === "stale-source") return "unavailable";
          else return "unconfirmed";
        }
      }
      return "completed";
    };
    void run().then(finish, () => finish(rpcPending ? "unconfirmed" : controller.signal.aborted ? "aborted" : "unavailable"));
  });
}
