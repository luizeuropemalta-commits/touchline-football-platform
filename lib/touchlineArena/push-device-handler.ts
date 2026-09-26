import { parseTouchlineDeviceRegistration, type TouchlineDeviceRegistration } from "./push-device-contract.ts";

type Dependencies = {
  actor: () => Promise<{ id: string; allowed: boolean } | null>;
  save: (value: { userId: string; registration: TouchlineDeviceRegistration; userAgent: string | null }) => Promise<void>;
};

/** Registration acknowledges storage only, never consent to an event or delivery. */
export async function handlePushDeviceRegistration(request: Request, deps: Dependencies): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
  if (request.method !== "PUT") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site") return json(403, { ok: false, error: "INVALID_ORIGIN" });
  try {
    const actor = await deps.actor();
    if (!actor) return json(401, { ok: false, error: "AUTHENTICATION_REQUIRED" });
    if (!actor.allowed) return json(403, { ok: false, error: "ARENA_ACCESS_REQUIRED" });
    const value = await request.json().catch(() => null);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !["installationId", "permission", "subscription"].includes(key))) {
      return json(400, { ok: false, error: "INVALID_DEVICE_REGISTRATION" });
    }
    const registration = parseTouchlineDeviceRegistration(value);
    if (!registration) return json(400, { ok: false, error: "INVALID_DEVICE_REGISTRATION" });
    await deps.save({ userId: actor.id, registration, userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null });
    return json(200, { ok: true, delivery: "not-sent" });
  } catch {
    // Push endpoints, keys and database errors must not enter public responses.
    return json(503, { ok: false, error: "DEVICE_REGISTRATION_UNAVAILABLE" });
  }
}
