import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER, TOUCHLINE_ISOLATED_PREVIEW_MODE } from "@/lib/touchlinePreview/isolation";
import { hasTouchLineArenaAccess } from "./auth-access";
import { handlePushRehearsal, type PushRehearsalDependencies } from "./push-rehearsal-handler";
import { createPushRehearsalStore } from "./push-rehearsal-store";
import { parseMatchPushVapidConfig } from "./match-push-vapid-config";
import { sendMatchWebPush } from "./match-push-transport";

const QA_ORIGIN = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const qaUrl = (value: string | undefined) => value === QA_ORIGIN || value === `${QA_ORIGIN}/`;
const present = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;
function reply(status: string, code: number) {
  return Response.json({ ok: false, status }, { status: code, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie", ...(code === 405 ? { Allow: "POST" } : {}),
  } });
}

/** One explicitly consented diagnostic attempt on one configured QA account and
 * installation. These proposed server settings are never enabled here. No queue,
 * game preference, football event or delivery claim is created by this boundary.
 */
export async function handlePushRehearsalServer(request: Request): Promise<Response> {
  try {
    if (request.method !== "POST") return reply("method-not-allowed", 405);
    const env = process.env;
    if (env.TOUCHLINE_PUSH_REHEARSAL_ENABLED !== "true") return reply("disabled", 503);
    const origin = env.TOUCHLINE_PUSH_REHEARSAL_ORIGIN;
    const actorId = env.TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID;
    const installationId = env.TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID;
    // Match the effective URL selection of each existing client factory. Never
    // allow a QA service client paired with production browser authentication.
    if (!qaUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL) || !qaUrl(env.NEXT_PUBLIC_SUPABASE_URL)
      || !present(env.SUPABASE_SERVICE_ROLE_KEY) || !present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      || !origin || !origin.startsWith("https://") || new URL(origin).origin !== origin
      || !actorId || !UUID.test(actorId) || !installationId || !UUID.test(installationId)
      || env.VERCEL_ENV === "production" || resolveTouchlineDataSource(env) !== "direct"
      || env.TOUCHLINE_DEPLOYMENT_MODE === TOUCHLINE_ISOLATED_PREVIEW_MODE
      || env.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === TOUCHLINE_ISOLATED_PREVIEW_MODE) return reply("unconfigured", 503);
    if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin
      || request.headers.get("sec-fetch-site") === "cross-site"
      || isTouchlineIsolatedPreviewRequest(request.headers.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) return reply("forbidden", 403);
    const vapid = parseMatchPushVapidConfig({
      subject: env.TOUCHLINE_WEB_PUSH_SUBJECT,
      publicKey: env.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY,
      privateKey: env.TOUCHLINE_WEB_PUSH_PRIVATE_KEY,
    });
    if (!vapid) return reply("unconfigured", 503);

    const configuredActor = actorId.toLowerCase(), configuredInstallation = installationId.toLowerCase();
    let authenticatedActor: string | null = null;
    let store: ReturnType<typeof createPushRehearsalStore> | undefined;
    const deps: PushRehearsalDependencies = {
      enabled: true, requestTimeoutMs: 5000, now: () => new Date(),
      async actor(signal) {
        signal.throwIfAborted();
        const client = await createClient();
        signal.throwIfAborted();
        if (!client) return null;
        // getUser is authoritative. The core bounds waiting and late callbacks;
        // the SDK does not accept this AbortSignal, so transport cancellation is
        // not claimed. A late auth receipt cannot create a service client.
        const result = await client.auth.getUser();
        signal.throwIfAborted();
        if (result.error) throw Error("authentication-unconfirmed");
        const user = result.data.user;
        if (!user) return null;
        if (!hasTouchLineArenaAccess(user) || typeof user.id !== "string"
          || user.id.toLowerCase() !== configuredActor) return { id: user.id, allowed: false };
        authenticatedActor = configuredActor;
        return { id: configuredActor, allowed: true };
      },
      async loadOwnedDevice(owner, installation, signal) {
        signal.throwIfAborted();
        if (authenticatedActor !== owner || owner !== configuredActor || installation !== configuredInstallation) return null;
        if (!store) {
          const admin = createAdminClient();
          if (!admin) throw Error("store-unavailable");
          store = createPushRehearsalStore(admin);
        }
        return store.loadOwnedDevice(owner, installation, signal);
      },
      async reserve(input, signal) {
        signal.throwIfAborted();
        if (!store || input.actorId !== authenticatedActor || input.actorId !== configuredActor
          || input.installationId !== configuredInstallation) return { status: "unavailable" };
        return store.reserve(input, signal);
      },
      async send(input) {
        input.signal.throwIfAborted();
        return sendMatchWebPush({ ...input, vapid });
      },
      async finish(input, signal) {
        signal.throwIfAborted();
        if (!store || input.actorId !== authenticatedActor || input.actorId !== configuredActor) return false;
        return store.finish(input, signal);
      },
    };
    return await handlePushRehearsal(request, deps);
  } catch {
    // No provider error, configuration value, account ID or subscription leaks.
    return reply("unconfirmed", 503);
  }
}
