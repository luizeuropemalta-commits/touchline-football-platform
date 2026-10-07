import { parseTouchlineDeviceRegistration, type TouchlineDeviceRegistration } from "./push-device-contract.ts";

type Dependencies = {
  actor: () => Promise<{ id: string; allowed: boolean } | null>;
  save: (value: { userId: string; registration: TouchlineDeviceRegistration; userAgent: string | null }) => Promise<void>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Registration acknowledges storage only, never consent to an event or delivery. */
export async function handlePushDeviceRegistration(request: Request, deps: Dependencies): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
  if (request.method !== "PUT") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site") return json(403, { ok: false, error: "INVALID_ORIGIN" });
  try {
    request.signal.throwIfAborted();
    const expectedAccount = request.headers.get("x-touchline-expected-account");
    if (expectedAccount !== null && !UUID.test(expectedAccount)) return json(400, { ok: false, error: "INVALID_ACCOUNT_CONTEXT" });
    const actor = await deps.actor();
    request.signal.throwIfAborted();
    if (!actor) return json(401, { ok: false, error: "AUTHENTICATION_REQUIRED" });
    if (!actor.allowed) return json(403, { ok: false, error: "ARENA_ACCESS_REQUIRED" });
    if (expectedAccount !== null && expectedAccount.toLowerCase() !== actor.id.toLowerCase()) return json(409, { ok: false, error: "ACCOUNT_CHANGED" });
    const value = await request.json().catch(() => null);
    request.signal.throwIfAborted();
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !["installationId", "permission", "subscription"].includes(key))) {
      return json(400, { ok: false, error: "INVALID_DEVICE_REGISTRATION" });
    }
    const registration = parseTouchlineDeviceRegistration(value);
    if (!registration) return json(400, { ok: false, error: "INVALID_DEVICE_REGISTRATION" });
    await deps.save({ userId: actor.id, registration, userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null });
    // Cancellation never proves that an already-started save was rolled back.
    request.signal.throwIfAborted();
    return json(200, { ok: true, delivery: "not-sent", accountId: actor.id, installationId: registration.installationId });
  } catch {
    // Push endpoints, keys and database errors must not enter public responses.
    return json(503, { ok: false, error: "DEVICE_REGISTRATION_UNAVAILABLE" });
  }
}
