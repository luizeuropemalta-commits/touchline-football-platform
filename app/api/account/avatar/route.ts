import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail, ownerEmails } from "@/lib/admin/owner";
import { createClubOwnerAvatarReadServer, createClubOwnerAvatarServer } from "@/lib/touchlineArena/club-owner-avatar-server";
import { TOUCHLINE_QA_ORIGIN } from "@/lib/touchlineArena/public-origin";
import { inspectTouchlineQaVercelEnvironment } from "@/lib/touchlinePreview/qa-environment-verifier-core";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";
import { AVATAR_UPLOAD_TOTAL_TIMEOUT_MS, isAvatarAccountId } from "@/lib/touchlineArena/club-owner-avatar-upload-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unavailable = () => Response.json({ ok: false, error: "AVATAR_READ_UNAVAILABLE" }, { status: 503, headers: {
  "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
} });

// Preparation only: GET and POST default OFF. POST also requires its own exact
// configured account; no account/configuration, grant or bucket is installed here.
// Activation, hosted resources and unknown-result reload recovery remain gates.
export async function GET(request: Request) {
  try {
    // The preview verifier must inspect the full envelope: filtering to known
    // keys would hide forbidden provider/production configuration.
    const environment = { ...process.env };
    const expires = performance.now() + AVATAR_UPLOAD_TOTAL_TIMEOUT_MS;
    const target = new URL(request.url);
    if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED !== "true"
      || inspectTouchlineQaVercelEnvironment({ environment, requestHostname: target.hostname }).status !== "PASS"
      || target.origin !== TOUCHLINE_QA_ORIGIN || resolveTouchlineDataSource(environment) !== "direct"
      || ownerEmails().length === 0) return unavailable();
    const assertSnapshot = () => {
      if (Object.keys(environment).length !== Object.keys(process.env).length
        || Object.keys(environment).some(key => process.env[key] !== environment[key])) throw Error("AVATAR_CONFIGURATION_CHANGED");
    };
    const supabaseOrigin = new URL(environment.SUPABASE_URL!).origin;
    const serve = createClubOwnerAvatarReadServer({
      enabled: true, requestOrigin: TOUCHLINE_QA_ORIGIN, supabaseOrigin,
      publicSupabaseOrigin: new URL(environment.NEXT_PUBLIC_SUPABASE_URL!).origin,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY, dataSource: "direct", environment: "qa",
      deploymentMode: environment.TOUCHLINE_DEPLOYMENT_MODE, publicDeploymentMode: environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE,
    }, {
      async createSessionClient(config, signal) {
        signal.throwIfAborted(); assertSnapshot();
        if (config.supabaseOrigin !== supabaseOrigin) throw Error("AVATAR_CONFIGURATION_CHANGED");
        // Existing factory captures URL/key before awaiting the cookie store.
        const client = await createClient();
        signal.throwIfAborted(); assertSnapshot();
        return client;
      },
      createPrivilegedClient(config) {
        assertSnapshot();
        if (config.supabaseOrigin !== supabaseOrigin || config.serviceRoleKey !== environment.SUPABASE_SERVICE_ROLE_KEY) throw Error("AVATAR_CONFIGURATION_CHANGED");
        return createAdminClient();
      },
      isOwnerEmail(email) { assertSnapshot(); return isOwnerEmail(email); },
      fetchImpl(input, init) { assertSnapshot(); return fetch(input, init); },
    });
    const response = await serve(request);
    assertSnapshot();
    if (response.ok && (performance.now() >= expires || request.signal.aborted)) return unavailable();
    return response;
  } catch { return unavailable(); }
}

// This is not push-rehearsal authority or general customer activation. The
// configured UUID must match the request expectation AND getUser's actor in
// the existing composition before body decoding or privileged work begins.
export async function POST(request: Request) {
  const reply = (status = 503, error = "AVATAR_UPLOAD_UNAVAILABLE") => Response.json({
    ok: false, state: status >= 500 ? "unknown" : "rejected", error,
  }, { status, headers: {
    "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
  } });
  try {
    const environment = { ...process.env };
    const expires = performance.now() + AVATAR_UPLOAD_TOTAL_TIMEOUT_MS;
    const target = new URL(request.url);
    const configuredAccount = environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID;
    if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED !== "true"
      || environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED !== "true"
      || !isAvatarAccountId(configuredAccount)
      || inspectTouchlineQaVercelEnvironment({ environment, requestHostname: target.hostname }).status !== "PASS"
      || target.origin !== TOUCHLINE_QA_ORIGIN || resolveTouchlineDataSource(environment) !== "direct"
      || ownerEmails().length === 0) return reply();
    const expectedAccount = request.headers.get("x-touchline-expected-account");
    if (!isAvatarAccountId(expectedAccount)) return reply(400, "INVALID_ACCOUNT_OR_OPERATION");
    if (expectedAccount.toLowerCase() !== configuredAccount.toLowerCase()) return reply(403, "ACCESS_REQUIRED");
    const assertSnapshot = () => {
      if (Object.keys(environment).length !== Object.keys(process.env).length
        || Object.keys(environment).some(key => process.env[key] !== environment[key])) throw Error("AVATAR_CONFIGURATION_CHANGED");
    };
    assertSnapshot();
    const supabaseOrigin = new URL(environment.SUPABASE_URL!).origin;
    const serve = createClubOwnerAvatarServer({
      enabled: true, requestOrigin: TOUCHLINE_QA_ORIGIN, supabaseOrigin,
      publicSupabaseOrigin: new URL(environment.NEXT_PUBLIC_SUPABASE_URL!).origin,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY, dataSource: "direct", environment: "qa",
      deploymentMode: environment.TOUCHLINE_DEPLOYMENT_MODE, publicDeploymentMode: environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE,
    }, {
      assertEnvironment: assertSnapshot,
      async createSessionClient(config, signal) {
        signal.throwIfAborted(); assertSnapshot();
        if (config.supabaseOrigin !== supabaseOrigin) throw Error("AVATAR_CONFIGURATION_CHANGED");
        const client = await createClient();
        signal.throwIfAborted(); assertSnapshot();
        return client;
      },
      createPrivilegedClient(config) {
        assertSnapshot();
        if (config.supabaseOrigin !== supabaseOrigin || config.serviceRoleKey !== environment.SUPABASE_SERVICE_ROLE_KEY) throw Error("AVATAR_CONFIGURATION_CHANGED");
        return createAdminClient();
      },
      isOwnerEmail(email) { assertSnapshot(); return isOwnerEmail(email); },
      fetchImpl(input, init) { assertSnapshot(); return fetch(input, init); },
    });
    const response = await serve(request);
    assertSnapshot();
    if (response.ok && (performance.now() >= expires || request.signal.aborted)) return reply();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return response;
  } catch { return reply(); }
}
