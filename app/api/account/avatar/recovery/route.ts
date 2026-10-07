import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail, ownerEmails } from "@/lib/admin/owner";
import { createClubOwnerAvatarRecoveryServer } from "@/lib/touchlineArena/club-owner-avatar-server";
import { isAvatarAccountId } from "@/lib/touchlineArena/club-owner-avatar-upload-contract";
import { TOUCHLINE_QA_ORIGIN } from "@/lib/touchlineArena/public-origin";
import { inspectTouchlineQaVercelEnvironment } from "@/lib/touchlinePreview/qa-environment-verifier-core";
import { resolveTouchlineDataSource } from "@/lib/touchlineMirror/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const unavailable = () => Response.json({ ok: false, state: "unknown", error: "AVATAR_RECOVERY_UNCONFIRMED" }, { status: 503, headers: {
  "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
} });

/** Default OFF, same dedicated QA actor as upload. POST carries either a
 * read-only status action or an explicit fence; never image bytes or cleanup. */
export async function POST(request: Request) {
  try {
    const environment = { ...process.env }, target = new URL(request.url);
    const expires = performance.now() + 8_000, accountId = environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID;
    if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED !== "true" || environment.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED !== "true"
      || !isAvatarAccountId(accountId) || target.origin !== TOUCHLINE_QA_ORIGIN
      || inspectTouchlineQaVercelEnvironment({ environment, requestHostname: target.hostname }).status !== "PASS"
      || resolveTouchlineDataSource(environment) !== "direct" || ownerEmails().length === 0) return unavailable();
    const assertSnapshot = () => {
      if (Object.keys(environment).length !== Object.keys(process.env).length
        || Object.keys(environment).some(key => process.env[key] !== environment[key])) throw Error("AVATAR_CONFIGURATION_CHANGED");
    };
    assertSnapshot(); const supabaseOrigin = new URL(environment.SUPABASE_URL!).origin;
    const serve = createClubOwnerAvatarRecoveryServer({ enabled: true, accountId, requestOrigin: TOUCHLINE_QA_ORIGIN,
      supabaseOrigin, publicSupabaseOrigin: new URL(environment.NEXT_PUBLIC_SUPABASE_URL!).origin,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY, dataSource: "direct", environment: "qa",
      deploymentMode: environment.TOUCHLINE_DEPLOYMENT_MODE, publicDeploymentMode: environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE,
    }, {
      assertEnvironment: assertSnapshot,
      async createSessionClient(config, signal) {
        signal.throwIfAborted(); assertSnapshot(); if (config.supabaseOrigin !== supabaseOrigin) throw Error("AVATAR_CONFIGURATION_CHANGED");
        const client = await createClient(); signal.throwIfAborted(); assertSnapshot(); return client;
      },
      createPrivilegedClient(config) {
        assertSnapshot(); if (config.supabaseOrigin !== supabaseOrigin || config.serviceRoleKey !== environment.SUPABASE_SERVICE_ROLE_KEY) throw Error("AVATAR_CONFIGURATION_CHANGED");
        return createAdminClient();
      },
      isOwnerEmail(email) { assertSnapshot(); return isOwnerEmail(email); },
      fetchImpl() { throw Error("AVATAR_CONTROL_HAS_NO_IMAGE_TRANSPORT"); },
    });
    const response = await serve(request); assertSnapshot();
    if (request.signal.aborted || performance.now() >= expires) return unavailable();
    return response;
  } catch { return unavailable(); }
}
