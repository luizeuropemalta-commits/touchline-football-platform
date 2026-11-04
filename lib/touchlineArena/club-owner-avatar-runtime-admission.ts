import { allowsClubOwnerAvatarLocalEnvironment } from "./club-owner-avatar-local-admission.ts";
import { TOUCHLINE_PUBLIC_ORIGIN, TOUCHLINE_QA_ORIGIN } from "./public-origin.ts";
import { inspectTouchlineQaVercelEnvironment, TOUCHLINE_QA_SUPABASE_PROJECT_REF } from "../touchlinePreview/qa-environment-verifier-core.ts";
import { inspectTouchlineProductionCredentialBinding, inspectTouchlineProductionRuntime } from "../touchlinePreview/production-environment-core.ts";

type Environment = Readonly<Record<string, string | undefined>>;
declare const admissionBrand: unique symbol;
export type AvatarRuntimeAdmission = Readonly<{
  kind: "local" | "qa" | "production";
  requestOrigin: string;
  supabaseOrigin: string;
  projectRef: string;
  [admissionBrand]: true;
}>;
const admitted = new WeakMap<AvatarRuntimeAdmission, string | undefined>();

/** Environment admission only. No auth, resource flag, audience or request actor
 * is inferred here. Credentials stay in the factory's private identity map.
 * Production is a separate explicit branch; invalid Production never falls
 * back to QA/local. Callers retain their full immutable environment snapshot. */
export function resolveClubOwnerAvatarRuntimeAdmission(environment: Environment, requestOrigin: string): AvatarRuntimeAdmission | null {
  let value: Omit<AvatarRuntimeAdmission, typeof admissionBrand>;
  if (environment.VERCEL_ENV === "production") {
    if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_PRODUCTION_ENABLED !== "true"
      || requestOrigin !== TOUCHLINE_PUBLIC_ORIGIN
      || environment.TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED !== undefined
      || environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== undefined
      || Object.keys(environment).some(name => name.startsWith("TOUCHLINE_ISOLATED_PREVIEW_") && environment[name] !== undefined)) return null;
    const result = inspectTouchlineProductionRuntime({ environment,
      approvedSupabaseProjectRef: environment.TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF });
    if (!result.allowed || environment.SUPABASE_URL !== result.target.supabaseOrigin
      || environment.NEXT_PUBLIC_SUPABASE_URL !== result.target.supabaseOrigin
      || environment.NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN !== TOUCHLINE_PUBLIC_ORIGIN
      || !inspectTouchlineProductionCredentialBinding({ projectRef: result.target.projectRef,
      anonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }).allowed) return null;
    value = { kind: "production", requestOrigin, supabaseOrigin: result.target.supabaseOrigin, projectRef: result.target.projectRef };
  } else if (allowsClubOwnerAvatarLocalEnvironment(environment, requestOrigin)) {
    value = { kind: "local", requestOrigin, supabaseOrigin: `https://${TOUCHLINE_QA_SUPABASE_PROJECT_REF}.supabase.co`, projectRef: TOUCHLINE_QA_SUPABASE_PROJECT_REF };
  } else {
    if (requestOrigin !== TOUCHLINE_QA_ORIGIN || inspectTouchlineQaVercelEnvironment({ environment,
      requestHostname: new URL(TOUCHLINE_QA_ORIGIN).hostname }).status !== "PASS") return null;
    value = { kind: "qa", requestOrigin, supabaseOrigin: `https://${TOUCHLINE_QA_SUPABASE_PROJECT_REF}.supabase.co`, projectRef: TOUCHLINE_QA_SUPABASE_PROJECT_REF };
  }
  const admission = Object.freeze(value) as AvatarRuntimeAdmission;
  admitted.set(admission, environment.SUPABASE_SERVICE_ROLE_KEY);
  return admission;
}

/** A string environment='production' or a structurally similar JSON object
 * cannot admit the core. Bind its exact captured origin/credential tuple. */
export function matchesAvatarRuntimeAdmission(value: AvatarRuntimeAdmission | undefined, config: Readonly<{
  environment?: string; requestOrigin?: string; supabaseOrigin?: string; publicSupabaseOrigin?: string; serviceRoleKey?: string;
}>): boolean {
  return value !== undefined && admitted.has(value) && config.environment === value.kind
    && config.requestOrigin === value.requestOrigin && config.supabaseOrigin === value.supabaseOrigin
    && config.publicSupabaseOrigin === value.supabaseOrigin && config.serviceRoleKey === admitted.get(value);
}
