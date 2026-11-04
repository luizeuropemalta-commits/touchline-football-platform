import { createProductionAvatarRetentionTarget } from "../../../lib/touchlineArena/club-owner-avatar-retention-target.ts";
import { createAvatarRetentionScheduler } from "../../../lib/touchlineArena/club-owner-avatar-retention-scheduler.ts";

type EdgeRuntime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const runtime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
if (runtime) {
  const productionNames = ["TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF", "TOUCHLINE_PRODUCTION_AVATAR_RETENTION_PROFILE_ID",
    "TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SERVICE_ROLE_KEY", "TOUCHLINE_PRODUCTION_AVATAR_RETENTION_ENABLED",
    "TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SCHEDULER_ENABLED", "TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SCHEDULER_SECRET"] as const;
  const qaNames = ["TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY", "TOUCHLINE_QA_AVATAR_RETENTION_ENABLED",
    "TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_ENABLED", "TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_SECRET"] as const;
  if (productionNames.some(name => runtime.env.get(name) !== undefined)) {
    const names = ["SUPABASE_URL", ...productionNames, ...qaNames] as const;
    const values = Object.fromEntries(names.map(name => [name, runtime.env.get(name)]));
    const target = createProductionAvatarRetentionTarget({
      projectRef: values.TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF,
      profileId: values.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_PROFILE_ID,
      supabaseOrigin: values.SUPABASE_URL,
      serviceRoleKey: values.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SERVICE_ROLE_KEY,
    });
    const enabled = target !== null && values.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SCHEDULER_ENABLED === "true"
      && values.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_ENABLED === "true"
      && qaNames.every(name => values[name] === undefined);
    const handler = !enabled || !target
      ? async () => Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })
      : createAvatarRetentionScheduler({ target, enabled,
        supabaseOrigin: target.supabaseOrigin, serviceRoleKey: values.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SERVICE_ROLE_KEY!,
        triggerSecret: values.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SCHEDULER_SECRET || "",
        assertEnvironment() {
          if (names.some(name => runtime.env.get(name) !== values[name])) throw Error("AVATAR_RETENTION_ENVIRONMENT_CHANGED");
        },
      });
    runtime.serve(handler);
  } else {
  const names = ["SUPABASE_URL", "TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_SECRET", "TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_ENABLED"] as const;
  const values = names.map(name => runtime.env.get(name));
  const handler = createAvatarRetentionScheduler({
    enabled: values[4] === "true",
    supabaseOrigin: values[0] || "",
    serviceRoleKey: values[1] !== undefined ? values[1] : values[2] || "",
    triggerSecret: values[3] || "",
    assertEnvironment() {
      if (productionNames.some(name => runtime.env.get(name) !== undefined)
        || names.some((name, index) => runtime.env.get(name) !== values[index])) throw new Error("Configuration changed");
    },
  });
  runtime.serve(handler);
  }
}
