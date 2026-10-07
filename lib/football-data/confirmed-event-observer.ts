import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyTouchlineConfirmedMatchEvent } from "../touchlineArena/social-confirmed-event-contract";

const ID = /^[1-9]\d{0,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FIXTURES = 10, MAX_ROWS = 500, MAX_OBSERVATIONS = 50, BUDGET_MS = 5000;
type Row = Record<string, unknown>;
type Status = "disabled" | "completed" | "unavailable" | "limit-exceeded" | "aborted" | "timed-out" | "unconfirmed";
export type ConfirmedEventObservationResult = Readonly<{ status: Status; attempted: number; observed: number }>;
function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
function rows(response: { error: unknown; data: unknown; count: number | null }, cap: number): Row[] {
  if (response.error || !Array.isArray(response.data) || !Number.isSafeInteger(response.count)
    || response.count !== response.data.length || response.data.length > cap
    || response.data.some(row => !object(row))) throw Error("READ_UNAVAILABLE");
  return response.data as Row[];
}

/** Caller must supply ONLY fixtures successfully persisted and reconciled by
 * this sync. This adapter cannot infer that authority from request parameters.
 * At most 3 complete reads + 50 sequential observation RPCs, 5s total. No
 * polling, provider fetch, delivery, enqueue or historical-coverage assertion.
 * Missing historical event rows fail closed: this RPC cannot invalidate an
 * event that no longer exists. Current cancelled/review rows are still observed.
 */
export async function observePersistedConfirmedEvents(input: Readonly<{
  admin: SupabaseClient | null;
  fixtureProviderIds: readonly string[];
  signal: AbortSignal;
  enabled?: boolean;
}>): Promise<ConfirmedEventObservationResult> {
  let attempted = 0, observed = 0;
  const result = (status: Status): ConfirmedEventObservationResult => ({ status, attempted, observed });
  if (input.enabled !== true) return result("disabled");
  const { admin, signal } = input;
  if (!admin || !Array.isArray(input.fixtureProviderIds)
    || input.fixtureProviderIds.length > 100
    || input.fixtureProviderIds.some(id => typeof id !== "string" || !ID.test(id))) return result("unavailable");
  const ids = [...new Set(input.fixtureProviderIds)].sort();
  if (ids.length > MAX_FIXTURES) return result("limit-exceeded");
  if (signal.aborted) return result("aborted");
  if (!ids.length) return result("completed");
  const controller = new AbortController();
  const started = performance.now();
  const check = () => {
    if (controller.signal.aborted || performance.now() - started >= BUDGET_MS) throw Error("STOPPED");
  };
  return new Promise(resolve => {
    let settled = false;
    const finish = (status: Status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(result(status));
    };
    const abort = () => { finish("aborted"); controller.abort(); };
    const timer = setTimeout(() => { finish("timed-out"); controller.abort(); }, BUDGET_MS);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    const run = async (): Promise<Status> => {
      check();
      const fixtures = rows(await admin.from("football_fixtures")
        .select("id,provider,provider_fixture_id", { count: "exact" }).eq("provider", "sportmonks")
        .in("provider_fixture_id", ids).limit(MAX_FIXTURES + 1).abortSignal(controller.signal), MAX_FIXTURES);
      check();
      if (fixtures.length !== ids.length || new Set(fixtures.map(row => row.id)).size !== ids.length
        || new Set(fixtures.map(row => row.provider_fixture_id)).size !== ids.length
        || fixtures.some(row => typeof row.id !== "string" || !UUID.test(row.id)
          || row.provider !== "sportmonks" || typeof row.provider_fixture_id !== "string"
          || !ids.includes(row.provider_fixture_id))) return "unavailable";
      const byUuid = new Map(fixtures.map(row => [row.id as string, row.provider_fixture_id as string]));
      const events = rows(await admin.from("football_fixture_events")
        .select("fixture_id,provider,provider_event_id,event_type", { count: "exact" }).eq("provider", "sportmonks")
        .in("fixture_id", [...byUuid.keys()]).order("provider_event_id", { ascending: true })
        .limit(MAX_ROWS + 1).abortSignal(controller.signal), MAX_ROWS);
      check();
      const known = rows(await admin.from("touchline_social_confirmed_event_observations")
        .select("fixture_provider_id,event_provider_id", { count: "exact" }).in("fixture_provider_id", ids)
        .limit(MAX_ROWS + 1).abortSignal(controller.signal), MAX_ROWS);
      check();
      const all = new Map<string, { fixture: string; event: string; type: string }>();
      const eventIds = new Set<string>();
      for (const row of events) {
        const fixture = byUuid.get(String(row.fixture_id));
        if (!fixture || row.provider !== "sportmonks" || typeof row.provider_event_id !== "string"
          || !ID.test(row.provider_event_id) || typeof row.event_type !== "string"
          || eventIds.has(row.provider_event_id)) return "unavailable";
        eventIds.add(row.provider_event_id);
        all.set(`${fixture}:${row.provider_event_id}`, { fixture, event: row.provider_event_id, type: row.event_type });
      }
      const knownKeys = new Set<string>();
      for (const row of known) {
        if (typeof row.fixture_provider_id !== "string" || !ids.includes(row.fixture_provider_id)
          || typeof row.event_provider_id !== "string" || !ID.test(row.event_provider_id)) return "unavailable";
        const key = `${row.fixture_provider_id}:${row.event_provider_id}`;
        if (knownKeys.has(key) || !all.has(key)) return "unavailable";
        knownKeys.add(key);
      }
      // Type-only categorization, never confirmation. SQL rereads status/VAR
      // facts and moves cancelled/review/changed previously observed rows out.
      const candidates = [...all.entries()].filter(([key, row]) => knownKeys.has(key)
        || classifyTouchlineConfirmedMatchEvent({ type: row.type, status: "recorded", info: null, addition: null }) !== null)
        .sort(([a], [b]) => a.localeCompare(b));
      if (candidates.length > MAX_OBSERVATIONS) return "limit-exceeded";
      for (const [, candidate] of candidates) {
        check();
        attempted++;
        const response = await admin.rpc("touchline_social_043_observe_confirmed_event", {
          p_fixture_provider_id: candidate.fixture, p_event_provider_id: candidate.event,
        }).abortSignal(controller.signal);
        check();
        const receipt = object(response.data);
        if (response.error || receipt?.ok !== true
          || !["OBSERVING", "CONFIRMED", "REVIEW_REQUIRED"].includes(String(receipt.state))) return "unconfirmed";
        observed++;
      }
      return "completed";
    };
    void run().then(finish, () => finish(attempted ? "unconfirmed" : "unavailable"));
  });
}
