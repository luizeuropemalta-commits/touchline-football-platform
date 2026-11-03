import { createAvatarRetentionScheduler } from "../../../lib/touchlineArena/club-owner-avatar-retention-scheduler.ts";

type EdgeRuntime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const runtime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
if (runtime) {
  const names = ["SUPABASE_URL", "TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_SECRET", "TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_ENABLED"] as const;
  const values = names.map(name => runtime.env.get(name));
  const handler = createAvatarRetentionScheduler({
    enabled: values[4] === "true",
    supabaseOrigin: values[0] || "",
    serviceRoleKey: values[1] !== undefined ? values[1] : values[2] || "",
    triggerSecret: values[3] || "",
    assertEnvironment() {
      if (names.some((name, index) => runtime.env.get(name) !== values[index])) throw new Error("Configuration changed");
    },
  });
  runtime.serve(handler);
}
