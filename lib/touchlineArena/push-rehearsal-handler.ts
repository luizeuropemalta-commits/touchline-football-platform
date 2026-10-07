import { parseTouchlineDeviceRegistration, type TouchlineDeviceRegistration } from "./push-device-contract.ts";
import { touchlinePushSubscriptionFingerprint } from "./push-subscription-fingerprint.ts";
import { isSupportedMatchPushEndpoint } from "./match-push-transport.ts";

type ReservationInput = Readonly<{
  actorId: string; requestId: string; installationId: string; deviceId: string;
  fingerprint: string; expiresAt: string;
}>;
type Reservation = ReservationInput & Readonly<{ status: "reserved"; reservationId: string }>;
type Outcome = "provider_accepted" | "rejected" | "cancelled" | "unknown";
export type PushRehearsalDependencies = {
  enabled?: boolean;
  requestTimeoutMs?: number;
  now: () => Date;
  /** Request-scoped authentication, including trusted eligibility; never a body/header identity. */
  actor: (signal: AbortSignal) => Promise<{ id: string; allowed: boolean } | null>;
  /** Exact installation owned by actor. No latest-device or other-device fallback. */
  loadOwnedDevice: (actorId: string, installationId: string, signal: AbortSignal) => Promise<{
    ownerId: string; deviceId: string; registration: unknown;
  } | null>;
  /** MUST atomically persist unique (actorId,requestId), actor/device cooldown,
   * current ownership/granted binding and an irreversible one-attempt claim.
   * A reserved receipt confirms the commit and every input field. Duplicate,
   * uncertain or lost receipts never authorize sending. In-memory locks are
   * insufficient. Never reset/release a reservation for automatic retry.
   * Store this test consent separately; do not change game preferences/events.
   */
  reserve: (input: ReservationInput, signal: AbortSignal) => Promise<Reservation | {
    status: "duplicate" | "cooldown" | "unavailable" | "unknown";
  }>;
  /** One transport attempt; must honor signal/expiry, check signal before HTTP,
   * reject redirects, and never retry internally. Acceptance is not delivery. */
  send: (input: {
    subscription: NonNullable<TouchlineDeviceRegistration["subscription"]>;
    payload: string; expiresAt: Date; signal: AbortSignal;
  }) => Promise<"provider_accepted" | "rejected">;
  /** Persistent idempotent terminal receipt, conditioned on reservation/actor/request.
   * Unknown remains consumed. A timeout may leave a consumed pending row; it
   * must never become retryable. This cleanup gets a separate 1s abort budget. */
  finish: (input: { reservationId: string; actorId: string; requestId: string; outcome: Outcome }, signal: AbortSignal) => Promise<boolean>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYLOAD = JSON.stringify({ title: "TouchLine · TESTE / TEST", body: "Teste de notificação / Notification test", href: "/notifications", silent: true });
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
function reply(status: string, code: number) {
  return Response.json({ ok: status === "provider_accepted", status }, { status: code,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie", ...(code === 405 ? { Allow: "POST" } : {}) } });
}
async function boundedBody(request: Request, signal: AbortSignal) {
  if (!request.body) throw Error("INVALID_BODY");
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      if (signal.aborted) throw Error("STOPPED");
      const next = await reader.read();
      if (signal.aborted) throw Error("STOPPED");
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 1024) { abort(); throw Error("INVALID_BODY"); }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
}

/** Framework-neutral server core. No route, scheduler, environment access,
 * preference writes, football facts or provider calls outside injected send.
 * Overall request budget includes body/auth/reservation/reread/transport;
 * checks after every await fence collaborators that ignore cancellation.
 */
export async function handlePushRehearsal(request: Request, deps: PushRehearsalDependencies): Promise<Response> {
  if (request.method !== "POST") return reply("method-not-allowed", 405);
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site") return reply("forbidden", 403);
  if (deps.enabled !== true) return reply("disabled", 503);
  const expectedAccount = request.headers.get("x-touchline-expected-account");
  if (!uuid(expectedAccount)) return reply("invalid-request", 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply("invalid-request", 400);
  const budget = deps.requestTimeoutMs ?? 5000;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 10_000) return reply("unconfigured", 503);
  const controller = new AbortController();
  const started = performance.now();
  let startedAt: number;
  try { startedAt = deps.now().getTime(); } catch { return reply("unconfirmed", 503); }
  if (!Number.isSafeInteger(startedAt)) return reply("unconfirmed", 503);
  const check = () => {
    const now = deps.now().getTime();
    if (controller.signal.aborted || performance.now() - started >= budget
      || !Number.isSafeInteger(now) || now < startedAt || now - startedAt >= budget) throw Error("STOPPED");
    return now;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortRequest: () => void = () => {};
  const state: { reserved: Reservation | null } = { reserved: null };
  let attempted = false;
  let outcome: Outcome = "cancelled";
  const stopped = new Promise<never>((_resolve, reject) => {
    const stop = () => { controller.abort(); reject(Error("STOPPED")); };
    abortRequest = stop;
    timer = setTimeout(stop, budget);
    request.signal.addEventListener("abort", stop, { once: true });
    if (request.signal.aborted) stop();
  });
  const run = async () => {
    check();
    let value: unknown;
    try { value = await boundedBody(request, controller.signal); }
    catch { check(); return reply("invalid-request", 400); }
    check();
    if (!value || typeof value !== "object" || Array.isArray(value)) return reply("invalid-request", 400);
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== 3 || !uuid(body.installationId) || !uuid(body.requestId)
      || body.explicitTestConsent !== true) return reply("invalid-request", 400);
    const actor = await deps.actor(controller.signal); check();
    if (!actor) return reply("unauthorized", 401);
    if (actor.allowed !== true) return reply("forbidden", 403);
    if (!uuid(actor.id)) return reply("unconfirmed", 503);
    if (actor.id.toLowerCase() !== expectedAccount.toLowerCase()) return reply("account-changed", 409);
    const actorId = actor.id.toLowerCase(), installationId = body.installationId.toLowerCase(), requestId = body.requestId.toLowerCase();
    const read = async () => {
      const device = await deps.loadOwnedDevice(actorId, installationId, controller.signal); check();
      if (!device || device.ownerId.toLowerCase() !== actorId || !uuid(device.deviceId)) return null;
      const registration = parseTouchlineDeviceRegistration(device.registration);
      if (!registration || registration.installationId.toLowerCase() !== installationId
        || registration.permission !== "granted" || !registration.subscription
        || !isSupportedMatchPushEndpoint(registration.subscription.endpoint)) return null;
      const fingerprint = touchlinePushSubscriptionFingerprint(registration);
      return fingerprint ? { deviceId: device.deviceId.toLowerCase(), registration, fingerprint } : null;
    };
    const device = await read(); check();
    if (!device) return reply("device-unavailable", 409);
    const input: ReservationInput = { actorId, installationId, requestId, deviceId: device.deviceId,
      fingerprint: device.fingerprint, expiresAt: new Date(check() + 30_000).toISOString() };
    const receipt = await deps.reserve(input, controller.signal); check();
    if (!receipt || receipt.status !== "reserved") {
      if (receipt?.status === "duplicate") return reply("duplicate", 409);
      if (receipt?.status === "cooldown") return reply("cooldown", 429);
      return reply("unconfirmed", 503);
    }
    if (!uuid(receipt.reservationId) || Object.keys(input).some(key => receipt[key as keyof ReservationInput] !== input[key as keyof ReservationInput])
      || Date.parse(receipt.expiresAt) <= check()) return reply("unconfirmed", 503);
    state.reserved = { ...receipt };
    const fresh = await read(); check();
    if (!fresh || fresh.deviceId !== input.deviceId || fresh.fingerprint !== input.fingerprint) return reply("device-changed", 409);
    if (!fresh.registration.subscription || Date.parse(state.reserved.expiresAt) - check() < 1000) return reply("unconfirmed", 503);
    attempted = true; outcome = "unknown";
    const result = await deps.send({ subscription: fresh.registration.subscription, payload: PAYLOAD,
      expiresAt: new Date(state.reserved.expiresAt), signal: controller.signal });
    check();
    if (result !== "provider_accepted" && result !== "rejected") return reply("unconfirmed", 503);
    outcome = result;
    return reply(result, result === "provider_accepted" ? 202 : 502);
  };
  let response: Response;
  try { response = await Promise.race([stopped, run()]); }
  catch { outcome = attempted ? "unknown" : "cancelled"; response = reply("unconfirmed", 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", abortRequest); controller.abort(); }
  const reserved = state.reserved;
  if (reserved) {
    const finishController = new AbortController();
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<false>(resolve => { finishTimer = setTimeout(() => { finishController.abort(); resolve(false); }, 1000); });
      const confirmed = await Promise.race([timeout, deps.finish({ reservationId: reserved.reservationId,
        actorId: reserved.actorId, requestId: reserved.requestId, outcome }, finishController.signal)]);
      if (confirmed !== true || finishController.signal.aborted) response = reply("unconfirmed", 503);
    } catch { response = reply("unconfirmed", 503); }
    finally { clearTimeout(finishTimer); finishController.abort(); }
  }
  return response;
}
