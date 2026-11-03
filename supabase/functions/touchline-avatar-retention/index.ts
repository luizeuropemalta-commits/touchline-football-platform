import { createAvatarRetentionServer } from "../../../lib/touchlineArena/club-owner-avatar-retention-server.ts";
import { createAvatarRetentionRpc } from "../../../lib/touchlineArena/club-owner-avatar-retention-rpc.ts";
import { avatarRetentionConfigurationFailure, type AvatarRetentionConfigurationFailure } from "../../../lib/touchlineArena/club-owner-avatar-retention-configuration.ts";

// Explicit local shape keeps this entrypoint compatible with the repository's
// Next/Node typecheck without adding Deno globals to the whole application.
type EdgeRuntime = Readonly<{
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}>;
const runtime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
const unavailable = () => Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
type BootstrapFailure = AvatarRetentionConfigurationFailure | "QA_RETENTION_RUNTIME_MISSING" | "QA_RETENTION_FLAG_OFF"
  | "QA_RETENTION_CONFIGURATION_MISSING" | "QA_RETENTION_CONFIGURATION_READ_FAILED" | "QA_RETENTION_CONSTRUCTOR_FAILED";
let failureLogged = false;
function failedComposition(code: BootstrapFailure): (request: Request) => Promise<Response> {
  // At most one fixed diagnostic per isolate. Never serialize the exception,
  // environment, credentials, claims or a request; HTTP remains generic.
  if (!failureLogged) {
    failureLogged = true;
    try { console.error(JSON.stringify({ event: "qa_avatar_retention_bootstrap", code })); }
    catch { /* Observability failure cannot open the gate or change the reply. */ }
  }
  return async () => unavailable();
}

function compose(): (request: Request) => Promise<Response> {
  let failureCode: BootstrapFailure = "QA_RETENTION_CONFIGURATION_READ_FAILED";
  try {
    if (!runtime) return failedComposition("QA_RETENTION_RUNTIME_MISSING");
    const readCredential = () => {
      // A present but invalid explicit binding must fail closed, never fall
      // back to a different authority. Both sources retain the same QA JWT gate.
      const explicit = runtime.env.get("TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY");
      return explicit === undefined
        ? { keySource: "SUPABASE_SERVICE_ROLE_KEY", key: runtime.env.get("SUPABASE_SERVICE_ROLE_KEY") }
        : { keySource: "TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY", key: explicit };
    };
    const captured = Object.freeze({
      origin: runtime.env.get("SUPABASE_URL"),
      ...readCredential(),
      flag: runtime.env.get("TOUCHLINE_QA_AVATAR_RETENTION_ENABLED"),
    });
    const assertEnvironment = () => {
      const credential = readCredential();
      if (runtime.env.get("SUPABASE_URL") !== captured.origin
        || credential.keySource !== captured.keySource || credential.key !== captured.key
        || runtime.env.get("TOUCHLINE_QA_AVATAR_RETENTION_ENABLED") !== captured.flag) {
        throw Error("QA_RETENTION_ENVIRONMENT_CHANGED");
      }
    };
    // OFF/missing never constructs a transport. Enabling later requires a new
    // isolate/config capture; this instance cannot silently adopt changed env.
    if (captured.flag !== "true") return failedComposition("QA_RETENTION_FLAG_OFF");
    if (!captured.origin || !captured.key) return failedComposition("QA_RETENTION_CONFIGURATION_MISSING");
    const invalid = avatarRetentionConfigurationFailure(captured.origin, captured.key);
    if (invalid) return failedComposition(invalid);
    failureCode = "QA_RETENTION_CONSTRUCTOR_FAILED";
    const fetchImpl = globalThis.fetch.bind(globalThis);
    const rpc = createAvatarRetentionRpc({ supabaseOrigin: captured.origin, serviceRoleKey: captured.key, assertEnvironment, fetchImpl });
    return createAvatarRetentionServer({ enabled: true, supabaseOrigin: captured.origin, serviceRoleKey: captured.key, assertEnvironment }, { rpc, fetchImpl });
  } catch {
    return failedComposition(failureCode);
  }
}

// One singleton per isolate; no configuration disables platform JWT validation.
// This local entrypoint does not deploy, set secrets, register cron or enable it.
const handler = compose();
if (runtime) runtime.serve(handler);
