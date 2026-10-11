/** Server-authoritative Quick Sub transport. No optimistic state or browser storage. */
export type QuickSubEvent = Readonly<{
  commandId: string;
  expectedRevision: number;
  resultingRevision: number;
  expectedRosterRevision: string;
  outgoingInventoryId: string;
  incomingInventoryId: string;
}>;
export type QuickSubSession = Readonly<{
  id: string;
  userId: string;
  fixtureId: string;
  gameweekId: string;
  rosterRevision: string;
  revision: number;
  startingInventoryIds: readonly string[];
  benchInventoryIds: readonly string[];
  activeInventoryIds: readonly string[];
  availableBenchInventoryIds: readonly string[];
  substitutedOutInventoryIds: readonly string[];
}>;
export type QuickSubSnapshot = Readonly<{ session: QuickSubSession; events: readonly QuickSubEvent[] }>;
export type QuickSubCommand = Readonly<{
  sessionId: string;
  commandId: string;
  expectedRevision: number;
  expectedRosterRevision: string;
  outgoingInventoryId: string;
  incomingInventoryId: string;
}>;
type Pending = Readonly<
  | { kind: "event"; body: QuickSubCommand; serialized: string }
  | { kind: "start"; body: Readonly<{ providerFixtureId: string; benchInventoryIds: readonly string[] }>; serialized: string }
>;
type Failure = "invalid_input" | "invalid_response" | "network_error" | "http_error" | "not_loaded" | "command_pending" | "not_confirmed";
export type QuickSubResult =
  | Readonly<{ status: "ready" | "started" | "applied" | "replayed" | "recovered"; snapshot: QuickSubSnapshot }>
  | Readonly<{ status: "absent" | "busy" }>
  | Readonly<{ status: "rejected" | "uncertain"; reason: Failure; httpStatus?: number }>;

const SESSION_URL = "/api/touchline-arena/quick-substitution/session";
const EVENT_URL = "/api/touchline-arena/quick-substitution/event";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function uuid(value: unknown) { return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null; }
function revision(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 9; }
function roster(value: unknown) { return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null; }
function ids(value: unknown, length: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const parsed = value.map(uuid);
  return parsed.every((id): id is string => id !== null) && new Set(parsed).size === length ? Object.freeze(parsed) : null;
}
function same(left: readonly string[], right: readonly string[]) { return left.length === right.length && left.every((id, i) => id === right[i]); }
function parseSession(value: unknown): QuickSubSession | null {
  const row = object(value);
  if (!row || !revision(row.revision)) return null;
  const id = uuid(row.id), userId = uuid(row.user_id), fixtureId = uuid(row.fixture_id), gameweekId = uuid(row.gameweek_id);
  const rosterRevision = roster(row.roster_revision);
  const starting = ids(row.starting_inventory_ids, 11), bench = ids(row.bench_inventory_ids, 9);
  const active = ids(row.active_inventory_ids, 11), available = ids(row.available_bench_inventory_ids, 9 - row.revision);
  const out = ids(row.substituted_out_inventory_ids, row.revision);
  if (!id || !userId || !fixtureId || !gameweekId || !rosterRevision || !starting || !bench || !active || !available || !out) return null;
  const matchday = new Set([...starting, ...bench]), partition = [...active, ...available, ...out];
  if (matchday.size !== 20 || new Set(partition).size !== 20 || !partition.every((item) => matchday.has(item))) return null;
  return Object.freeze({ id, userId, fixtureId, gameweekId, rosterRevision, revision: row.revision,
    startingInventoryIds: starting, benchInventoryIds: bench, activeInventoryIds: active,
    availableBenchInventoryIds: available, substitutedOutInventoryIds: out });
}
function parseEvent(value: unknown, session: QuickSubSession): QuickSubEvent | null {
  const row = object(value);
  if (!row || uuid(row.user_id) !== session.userId || uuid(row.actor_id) !== session.userId
    || (row.session_id !== undefined && uuid(row.session_id) !== session.id)
    || !revision(row.expected_revision) || !revision(row.resulting_revision)
    || row.resulting_revision !== row.expected_revision + 1) return null;
  const commandId = uuid(row.command_id), outgoingInventoryId = uuid(row.outgoing_inventory_id), incomingInventoryId = uuid(row.incoming_inventory_id);
  const expectedRosterRevision = roster(row.expected_roster_revision);
  if (!commandId || !outgoingInventoryId || !incomingInventoryId || outgoingInventoryId === incomingInventoryId
    || expectedRosterRevision !== session.rosterRevision) return null;
  return Object.freeze({ commandId, outgoingInventoryId, incomingInventoryId, expectedRosterRevision,
    expectedRevision: row.expected_revision, resultingRevision: row.resulting_revision });
}

/** Validate a complete server history against its frozen matchday; never repair it. */
export function parseQuickSubSnapshot(value: unknown): QuickSubSnapshot | null {
  const payload = object(value), session = parseSession(payload?.session);
  if (payload?.ok !== true || !session || !Array.isArray(payload.events) || payload.events.length !== session.revision) return null;
  const events: QuickSubEvent[] = [];
  let active = [...session.startingInventoryIds], available = [...session.benchInventoryIds];
  const out: string[] = [], commandIds = new Set<string>();
  for (const [index, raw] of payload.events.entries()) {
    const event = parseEvent(raw, session);
    if (!event || event.expectedRevision !== index || commandIds.has(event.commandId)
      || !active.includes(event.outgoingInventoryId) || !available.includes(event.incomingInventoryId)) return null;
    // This replay only validates supplied history. It never predicts a command result.
    active = active.map((id) => id === event.outgoingInventoryId ? event.incomingInventoryId : id);
    available = available.filter((id) => id !== event.incomingInventoryId);
    out.push(event.outgoingInventoryId); commandIds.add(event.commandId); events.push(event);
  }
  if (!same(active, session.activeInventoryIds) || !same(available, session.availableBenchInventoryIds)
    || !same(out, session.substitutedOutInventoryIds)) return null;
  return Object.freeze({ session, events: Object.freeze(events) });
}

function sameSession(left: QuickSubSession, right: QuickSubSession) {
  return left.id === right.id && left.userId === right.userId && left.fixtureId === right.fixtureId
    && left.gameweekId === right.gameweekId && left.rosterRevision === right.rosterRevision
    && same(left.startingInventoryIds, right.startingInventoryIds) && same(left.benchInventoryIds, right.benchInventoryIds);
}
function eventMatches(event: QuickSubEvent, command: QuickSubCommand) {
  return event.commandId === command.commandId && event.expectedRevision === command.expectedRevision
    && event.expectedRosterRevision === command.expectedRosterRevision && event.outgoingInventoryId === command.outgoingInventoryId
    && event.incomingInventoryId === command.incomingInventoryId;
}

/** One instance belongs to one fixture and authenticated owner; recreate after account changes. */
export function createTouchlineQuickSubstitutionClient(dependencies: {
  providerFixtureId: string;
  fetch: typeof globalThis.fetch;
  createCommandId: () => string;
}) {
  if (!/^[1-9]\d{0,19}$/.test(dependencies.providerFixtureId)) throw new TypeError("Invalid provider fixture ID.");
  const readUrl = `${SESSION_URL}?providerFixtureId=${encodeURIComponent(dependencies.providerFixtureId)}`;
  let snapshot: QuickSubSnapshot | null = null, pending: Pending | null = null, busy = false;
  let hasUncertainAttempt = false;

  async function request(url: string, method: "GET" | "POST", body?: string) {
    try {
      const response = await dependencies.fetch(url, { method, cache: "no-store", credentials: "same-origin",
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body } : {}) });
      try { return { status: response.status, ok: response.ok, payload: await response.json() as unknown, reason: null }; }
      catch { return { status: response.status, ok: false, payload: null, reason: "invalid_response" as const }; }
    } catch { return { status: 0, ok: false, payload: null, reason: "network_error" as const }; }
  }
  async function read(): Promise<QuickSubResult> {
    const response = await request(readUrl, "GET");
    const payload = object(response.payload);
    if (response.status === 404 && payload?.ok === false && payload.error === "TL_QUICK_SUB_SESSION_NOT_FOUND") {
      return snapshot ? { status: "rejected", reason: "invalid_response" } : { status: "absent" };
    }
    if (!response.ok) return { status: "rejected", reason: response.reason ?? "http_error", httpStatus: response.status };
    const next = parseQuickSubSnapshot(response.payload);
    if (!next || (snapshot && (!sameSession(snapshot.session, next.session) || next.session.revision < snapshot.session.revision
      || snapshot.events.some((event, index) => JSON.stringify(event) !== JSON.stringify(next.events[index]))))) {
      return { status: "rejected", reason: "invalid_response" };
    }
    if (pending?.kind === "event") {
      const command = pending.body;
      if (next.session.id !== command.sessionId || next.session.rosterRevision !== command.expectedRosterRevision) {
        return { status: "rejected", reason: "invalid_response" };
      }
      const event = next.events.find((item) => item.commandId === command.commandId);
      if (event && !eventMatches(event, command)) return { status: "rejected", reason: "invalid_response" };
      snapshot = next;
      if (event) { pending = null; hasUncertainAttempt = false; return { status: "recovered", snapshot }; }
    } else if (pending?.kind === "start") {
      if (!same(next.session.benchInventoryIds, pending.body.benchInventoryIds)) return { status: "rejected", reason: "invalid_response" };
      snapshot = next; pending = null; hasUncertainAttempt = false; return { status: "recovered", snapshot };
    } else snapshot = next;
    return { status: "ready", snapshot };
  }
  async function send(): Promise<QuickSubResult> {
    const attempt = pending;
    if (!attempt) return { status: "rejected", reason: "not_loaded" };
    const previouslyUncertain = hasUncertainAttempt;
    const response = await request(attempt.kind === "event" ? EVENT_URL : SESSION_URL, "POST", attempt.serialized);
    const payload = object(response.payload), result = object(payload?.result);
    const rejected = response.status >= 400 && response.status < 500 && payload?.ok === false
      && typeof payload.error === "string" && /^TL_QUICK_SUB_[A-Z_]+$/.test(payload.error);
    hasUncertainAttempt = previouslyUncertain || !rejected;
    let acknowledged: "started" | "applied" | "replayed" | null = null;
    if (response.ok && payload?.ok === true) {
      const session = parseSession(attempt.kind === "start" ? payload.session : result?.session);
      if (session && attempt.kind === "start" && same(session.benchInventoryIds, attempt.body.benchInventoryIds)) acknowledged = "started";
      if (session && attempt.kind === "event" && session.id === attempt.body.sessionId
        && (result?.status === "applied" || result?.status === "replayed")) {
        const event = parseEvent(result.event, session);
        if (event && eventMatches(event, attempt.body)) acknowledged = result.status;
      }
    }
    // Even a successful POST supplies only one event. GET owns the complete
    // verified projection and confirms lost responses by command_id.
    const confirmed = await read();
    if (confirmed.status === "recovered") return { ...confirmed, status: acknowledged ?? "recovered" };
    // A rejection only proves this attempt did not apply. A prior lost POST
    // could still be in flight, so its pending identity must survive a retry's
    // rejection and an earlier GET that does not yet contain the event.
    const provesNonApplication = confirmed.status === "ready"
      || (attempt.kind === "start" && confirmed.status === "absent");
    if (provesNonApplication && rejected && !previouslyUncertain) {
      pending = null; hasUncertainAttempt = false;
      return { status: "rejected", reason: "http_error", httpStatus: response.status };
    }
    return { status: "uncertain", reason: response.reason ?? (acknowledged ? "not_confirmed" : "invalid_response") };
  }
  async function exclusive(action: () => Promise<QuickSubResult>): Promise<QuickSubResult> {
    if (busy) return { status: "busy" };
    busy = true;
    try { return await action(); } finally { busy = false; }
  }

  return Object.freeze({
    getSnapshot: () => Object.freeze({ snapshot, pending, busy }),
    load: () => exclusive(async () => {
      const result = await read();
      return pending && (result.status === "ready" || result.status === "absent")
        ? { status: "uncertain", reason: "not_confirmed" }
        : result;
    }),
    start: (benchInventoryIds: readonly string[]) => exclusive(async () => {
      if (pending) return { status: "rejected", reason: "command_pending" };
      const bench = ids(benchInventoryIds, 9);
      if (!bench) return { status: "rejected", reason: "invalid_input" };
      if (snapshot) return { status: "rejected", reason: "invalid_input" };
      const body = Object.freeze({ providerFixtureId: dependencies.providerFixtureId, benchInventoryIds: bench });
      hasUncertainAttempt = false;
      pending = Object.freeze({ kind: "start", body, serialized: JSON.stringify(body) });
      return send();
    }),
    substitute: (outgoingInventoryId: string, incomingInventoryId: string) => exclusive(async () => {
      if (pending) return { status: "rejected", reason: "command_pending" };
      if (!snapshot) return { status: "rejected", reason: "not_loaded" };
      const outgoing = uuid(outgoingInventoryId), incoming = uuid(incomingInventoryId);
      if (!outgoing || !incoming || outgoing === incoming || snapshot.session.revision >= 9
        || !snapshot.session.activeInventoryIds.includes(outgoing) || !snapshot.session.availableBenchInventoryIds.includes(incoming)) {
        return { status: "rejected", reason: "invalid_input" };
      }
      let commandId: string | null;
      try { commandId = uuid(dependencies.createCommandId()); } catch { commandId = null; }
      if (!commandId || snapshot.events.some((event) => event.commandId === commandId)) return { status: "rejected", reason: "invalid_input" };
      const body = Object.freeze({ sessionId: snapshot.session.id, commandId, expectedRevision: snapshot.session.revision,
        expectedRosterRevision: snapshot.session.rosterRevision, outgoingInventoryId: outgoing, incomingInventoryId: incoming });
      hasUncertainAttempt = false;
      pending = Object.freeze({ kind: "event", body, serialized: JSON.stringify(body) });
      return send();
    }),
    retry: () => exclusive(async () => {
      if (!pending) return { status: "rejected", reason: "not_loaded" };
      const checked = await read();
      if (checked.status === "recovered") return checked;
      if (checked.status !== "ready" && checked.status !== "absent") return { status: "uncertain", reason: "not_confirmed" };
      return send();
    }),
  });
}
