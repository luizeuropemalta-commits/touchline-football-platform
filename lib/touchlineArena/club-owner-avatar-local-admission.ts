import { TOUCHLINE_QA_PREVIEW_MODE } from "../touchlinePreview/isolation.ts";
import { TOUCHLINE_QA_SUPABASE_PROJECT_REF } from "../touchlinePreview/qa-environment-verifier-core.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const QA_ORIGIN = `https://${TOUCHLINE_QA_SUPABASE_PROJECT_REF}.supabase.co`;

/** Exact origin strings only: no URL normalization, arbitrary loopback ports,
 * credentials, paths or forwarded-host interpretation. */
export function isClubOwnerAvatarLocalRequestOrigin(value: unknown): value is string {
  return value === "http://localhost:3319";
}

/** Pure transport exception for an already-admitted local composition. This
 * does not enable a feature or authorize an account. HTTPS policy elsewhere
 * stays unchanged, including the privileged Storage destination. */
export function allowsClubOwnerAvatarLocalCore(config: Readonly<{
  environment?: string;
  requestOrigin?: string;
  supabaseOrigin?: string;
  publicSupabaseOrigin?: string;
}>): boolean {
  return config.environment === "local"
    && isClubOwnerAvatarLocalRequestOrigin(config.requestOrigin)
    && config.supabaseOrigin === QA_ORIGIN
    && config.publicSupabaseOrigin === QA_ORIGIN;
}

/** Avatar-specific local runtime gate, not a substitute for the hosted QA
 * verifier. No Vercel environment is synthesized. Paired qa-preview labels
 * are allowed locally, while hosted and isolated-preview envelopes are not.
 * Read/upload/selection/retention and authenticated-actor checks remain
 * independent mandatory gates at their existing boundaries. */
export function allowsClubOwnerAvatarLocalEnvironment(environment: Environment, requestOrigin: string): boolean {
  if (environment.TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED !== "true"
    || environment.NODE_ENV !== "development"
    || Object.keys(environment).some(key => environment[key] !== undefined
      && (key === "VERCEL" || key.startsWith("VERCEL_") || key.startsWith("NEXT_PUBLIC_VERCEL_")))
    || !allowsClubOwnerAvatarLocalCore({ environment: "local", requestOrigin,
      supabaseOrigin: environment.SUPABASE_URL, publicSupabaseOrigin: environment.NEXT_PUBLIC_SUPABASE_URL })) return false;

  const mode = environment.TOUCHLINE_DEPLOYMENT_MODE;
  if (mode !== environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE
    || (mode !== undefined && mode !== TOUCHLINE_QA_PREVIEW_MODE)
    || Object.keys(environment).some(key => key.startsWith("TOUCHLINE_ISOLATED_PREVIEW_") && environment[key] !== undefined)
    || (environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== undefined
      && environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== TOUCHLINE_QA_SUPABASE_PROJECT_REF)) return false;
  return true;
}
