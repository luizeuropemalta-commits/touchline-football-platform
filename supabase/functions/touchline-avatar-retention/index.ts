import { createAvatarRetentionServer } from "../../../lib/touchlineArena/club-owner-avatar-retention-server.ts";
import { createAvatarRetentionRpc } from "../../../lib/touchlineArena/club-owner-avatar-retention-rpc.ts";

// Explicit local shape keeps this entrypoint compatible with the repository's
// Next/Node typecheck without adding Deno globals to the whole application.
type EdgeRuntime = Readonly<{
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}>;
const runtime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
const unavailable = () => Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });

function compose(): (request: Request) => Promise<Response> {
  try {
    if (!runtime) return async () => unavailable();
    const captured = Object.freeze({
      origin: runtime.env.get("SUPABASE_URL"),
      key: runtime.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      flag: runtime.env.get("TOUCHLINE_QA_AVATAR_RETENTION_ENABLED"),
    });
    const assertEnvironment = () => {
      if (runtime.env.get("SUPABASE_URL") !== captured.origin
        || runtime.env.get("SUPABASE_SERVICE_ROLE_KEY") !== captured.key
        || runtime.env.get("TOUCHLINE_QA_AVATAR_RETENTION_ENABLED") !== captured.flag) {
        throw Error("QA_RETENTION_ENVIRONMENT_CHANGED");
      }
    };
    // OFF/missing never constructs a transport. Enabling later requires a new
    // isolate/config capture; this instance cannot silently adopt changed env.
    if (captured.flag !== "true" || !captured.origin || !captured.key) return async () => unavailable();
    const fetchImpl = globalThis.fetch.bind(globalThis);
    const rpc = createAvatarRetentionRpc({ supabaseOrigin: captured.origin, serviceRoleKey: captured.key, assertEnvironment, fetchImpl });
    return createAvatarRetentionServer({ enabled: true, supabaseOrigin: captured.origin, serviceRoleKey: captured.key, assertEnvironment }, { rpc, fetchImpl });
  } catch {
    // No credentials, claims, request paths or provider errors are logged.
    return async () => unavailable();
  }
}

// One singleton per isolate; no configuration disables platform JWT validation.
// This local entrypoint does not deploy, set secrets, register cron or enable it.
const handler = compose();
if (runtime) runtime.serve(handler);
