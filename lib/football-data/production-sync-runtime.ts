/** Pure, names-only gate. Admission never authenticates a caller or enables a scheduler. */
type Environment = Readonly<Record<string, string | undefined>>;

export type ProductionSyncRuntime =
  | { allowed: true; reason: "production-sync-authorized" }
  | { allowed: false; reason: "disabled" | "runtime-mismatch" | "deployment-mode-conflict" | "project-mismatch" | "database-mismatch" | "auth-origin-mismatch" };

function exactOrigin(value: string | undefined, origin: string) {
  // Deliberately avoid URL normalization accepting userinfo, ports, encoded
  // paths, whitespace or an origin whose original spelling is ambiguous.
  return value === origin || value === `${origin}/`;
}

export function inspectTouchlineProductionSyncRuntime(environment: Environment): ProductionSyncRuntime {
  if (environment.TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED !== "true") return { allowed: false, reason: "disabled" };
  if (environment.VERCEL_ENV !== "production") return { allowed: false, reason: "runtime-mismatch" };
  // Existing Preview isolation remains unchanged. Ordinary Production has no
  // deployment-mode declaration; inventing a new mode would bypass that contract.
  if (environment.TOUCHLINE_DEPLOYMENT_MODE !== undefined
    || environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== undefined) {
    return { allowed: false, reason: "deployment-mode-conflict" };
  }
  if (environment.VERCEL_PROJECT_ID !== "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM"
    || environment.VERCEL_ORG_ID !== "team_P1d7YNrmUObvbJJTJRlGcXoz") {
    return { allowed: false, reason: "project-mismatch" };
  }
  const databaseOrigin = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
  if (!exactOrigin(environment.SUPABASE_URL, databaseOrigin)
    || !exactOrigin(environment.NEXT_PUBLIC_SUPABASE_URL, databaseOrigin)) {
    return { allowed: false, reason: "database-mismatch" };
  }
  if (!exactOrigin(environment.NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN, "https://touchline.com.br")) {
    return { allowed: false, reason: "auth-origin-mismatch" };
  }
  return { allowed: true, reason: "production-sync-authorized" };
}
