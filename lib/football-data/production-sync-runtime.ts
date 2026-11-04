import { inspectTouchlineProductionRuntime, inspectTouchlineProductionCredentialBinding,
  type TouchlineProductionEnvironment } from "../touchlinePreview/production-environment-core.ts";

/** Pure, names-only gate. Admission never authenticates a caller or enables a scheduler. */
export type ProductionSyncRuntime =
  | { allowed: true; reason: "production-sync-authorized" }
  | { allowed: false; reason: "disabled" | "runtime-mismatch" | "deployment-mode-conflict" | "project-mismatch" | "database-mismatch" | "auth-origin-mismatch" | "credential-mismatch" };

export function inspectTouchlineProductionSyncRuntime(environment: TouchlineProductionEnvironment): ProductionSyncRuntime {
  if (environment.TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED !== "true") return { allowed: false, reason: "disabled" };
  const runtime = inspectTouchlineProductionRuntime({ environment,
    approvedSupabaseProjectRef: environment.TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF });
  if (!runtime.allowed) return runtime;
  const credentials = inspectTouchlineProductionCredentialBinding({ projectRef: runtime.target.projectRef,
    anonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  if (!credentials.allowed) return credentials;
  return { allowed: true, reason: "production-sync-authorized" };
}
