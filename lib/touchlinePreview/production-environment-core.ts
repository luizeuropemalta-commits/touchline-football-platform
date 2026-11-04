import { TOUCHLINE_PUBLIC_ORIGIN } from "../touchlineArena/public-origin.ts";

/** Pure configuration checks shared by server compositions. No feature is
 * enabled here and no caller or credential is authenticated by this module. */
export type TouchlineProductionEnvironment = Readonly<Record<string, string | undefined>>;
export type TouchlineProductionRuntime =
  | Readonly<{ allowed: true; target: Readonly<{ projectRef: string; supabaseOrigin: string; publicOrigin: string }> }>
  | Readonly<{ allowed: false; reason: "runtime-mismatch" | "deployment-mode-conflict" | "project-mismatch" | "database-mismatch" | "auth-origin-mismatch" }>;
export type TouchlineProductionCredentialBinding = Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: "credential-mismatch" }>;

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
function productionProjectRef(value: unknown): value is string {
  return typeof value === "string" && value.length === 20 && /^[a-z]{20}$/.test(value) && value !== QA_PROJECT_REF;
}
function exactOrigin(value: string | undefined, origin: string) {
  // Preserve the existing single trailing slash allowance. URL normalization
  // must not admit explicit ports, userinfo, paths or ambiguous spellings.
  return value === origin || value === `${origin}/`;
}

/** approvedSupabaseProjectRef must come from the operator's private server
 * setting, never a request. This check performs no I/O or process.env reads. */
export function inspectTouchlineProductionRuntime(input: Readonly<{
  environment: TouchlineProductionEnvironment;
  approvedSupabaseProjectRef: string | undefined;
}>): TouchlineProductionRuntime {
  const { environment, approvedSupabaseProjectRef: projectRef } = input;
  if (environment.VERCEL_ENV !== "production") return { allowed: false, reason: "runtime-mismatch" };
  if (environment.TOUCHLINE_DEPLOYMENT_MODE !== undefined
    || environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== undefined) {
    return { allowed: false, reason: "deployment-mode-conflict" };
  }
  if (environment.VERCEL_PROJECT_ID !== "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM"
    || environment.VERCEL_ORG_ID !== "team_P1d7YNrmUObvbJJTJRlGcXoz") {
    return { allowed: false, reason: "project-mismatch" };
  }
  if (!productionProjectRef(projectRef)) return { allowed: false, reason: "database-mismatch" };
  const supabaseOrigin = `https://${projectRef}.supabase.co`;
  if (!exactOrigin(environment.SUPABASE_URL, supabaseOrigin)
    || !exactOrigin(environment.NEXT_PUBLIC_SUPABASE_URL, supabaseOrigin)) {
    return { allowed: false, reason: "database-mismatch" };
  }
  if (!exactOrigin(environment.NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN, TOUCHLINE_PUBLIC_ORIGIN)) {
    return { allowed: false, reason: "auth-origin-mismatch" };
  }
  return { allowed: true, target: Object.freeze({ projectRef, supabaseOrigin, publicOrigin: TOUCHLINE_PUBLIC_ORIGIN }) };
}

function credentialMatches(value: unknown, role: "anon" | "service_role", projectRef: string): boolean {
  if (typeof value !== "string" || value.length > 4096 || /\s/.test(value)
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const encoded = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return payload !== null && typeof payload === "object" && !Array.isArray(payload)
      && "ref" in payload && payload.ref === projectRef && "role" in payload && payload.role === role;
  } catch { return false; }
}
const credentialMismatch = (): TouchlineProductionCredentialBinding => ({ allowed: false, reason: "credential-mismatch" });

/** Structural binding of legacy JWT configuration only: decoding claims does
 * NOT verify signatures, expiry or database access. Opaque keys require their
 * own explicit contract; they are not silently accepted as project-bound JWTs.
 * This export also serves Edge retention, which does not hold an anon key. */
export function inspectTouchlineProductionServiceRoleBinding(input: Readonly<{
  projectRef: string;
  serviceRoleKey: string | undefined;
}>): TouchlineProductionCredentialBinding {
  return productionProjectRef(input.projectRef) && credentialMatches(input.serviceRoleKey, "service_role", input.projectRef)
    ? { allowed: true } : credentialMismatch();
}

/** Web/SSR and sync require both distinct keys. An omitted anon key cannot
 * downgrade this operation to the service-only Edge contract. */
export function inspectTouchlineProductionCredentialBinding(input: Readonly<{
  projectRef: string;
  anonKey: string | undefined;
  serviceRoleKey: string | undefined;
}>): TouchlineProductionCredentialBinding {
  return inspectTouchlineProductionServiceRoleBinding(input).allowed
    && input.anonKey !== input.serviceRoleKey && credentialMatches(input.anonKey, "anon", input.projectRef)
    ? { allowed: true } : credentialMismatch();
}
