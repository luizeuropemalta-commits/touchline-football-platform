/**
 * A deliberately narrow deployment contract for an isolated Vercel Preview.
 *
 * This module is edge-safe: it has no Node, network, storage, credential or
 * framework dependency. A valid contract only proves that the application can
 * serve the inert `/preview` envelope. It does not make the product data or
 * authentication safe to preview.
 */

export const TOUCHLINE_ISOLATED_PREVIEW_MODE = "isolated-preview" as const;
export const TOUCHLINE_ISOLATED_PREVIEW_HEADER = "x-touchline-isolated-preview";

type TouchlineEnvironment = Readonly<Record<string, string | undefined>>;

export type TouchlineIsolatedPreviewEnvironment =
  | { status: "inactive"; reasons: readonly [] }
  | { status: "active"; reasons: readonly [] }
  | { status: "invalid"; reasons: readonly string[] };

export type TouchlineIsolatedPreviewRoutePolicy =
  | { status: "inactive" }
  | { status: "allow-preview" }
  | { status: "blocked"; reason: "isolated-preview" | "invalid-preview-contract" };

/**
 * These names are the only TouchLine/Next public configuration values allowed
 * in the dedicated isolated Preview project. Platform process variables such
 * as PATH are intentionally outside this application-level audit.
 */
export const TOUCHLINE_ISOLATED_PREVIEW_ALLOWED_APPLICATION_ENVIRONMENT_KEYS = [
  "NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE",
  "TOUCHLINE_DEPLOYMENT_MODE",
  "TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID",
  "TOUCHLINE_ISOLATED_PREVIEW_TEAM_ID",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_ID",
  "VERCEL_ORG_ID",
] as const;

const allowedApplicationEnvironmentKeys = new Set<string>(
  TOUCHLINE_ISOLATED_PREVIEW_ALLOWED_APPLICATION_ENVIRONMENT_KEYS,
);

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGeneratedVercelPreviewHostname(value: string | undefined) {
  if (!isPresent(value)) return false;
  const hostname = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/.test(hostname) && !hostname.includes("/");
}

const touchlineApplicationEnvironmentPrefixes = [
  "NEXT_PUBLIC_",
  "TOUCHLINE_",
  "SUPABASE_",
  "SPORTMONKS_",
  "FOOTBALL_DATA_",
  "STRIPE_",
  "RESEND_",
  "SENDGRID_",
  "AWS_",
  "BLOB_",
  "KV_",
  "UPSTASH_",
  "DATABASE_",
  "REDIS_",
  "OPENAI_",
  "SENTRY_",
  "POSTHOG_",
  "AUTH_",
  "JWT_",
  "SECRET_",
] as const;

function isTouchlineApplicationEnvironmentKey(name: string) {
  return touchlineApplicationEnvironmentPrefixes.some((prefix) => name.startsWith(prefix))
    || /(?:_SECRET|_TOKEN|_API_KEY|_URL)$/.test(name)
    || name === "VERCEL_OIDC_TOKEN"
    || name === "VERCEL_TOKEN";
}

function previewSignal(environment: TouchlineEnvironment) {
  if (environment.VERCEL_ENV === "preview") return true;
  if (environment.TOUCHLINE_DEPLOYMENT_MODE !== undefined) return true;
  if (environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== undefined) return true;
  // A generated Vercel hostname with no declared environment is unsafe: it
  // must not silently behave as a normal product deployment.
  return environment.VERCEL_ENV !== "production" && environment.VERCEL_URL !== undefined;
}

/**
 * Checks only values that may be safely compared and reports names/reasons,
 * never environment values. This is intentionally stricter than a denylist:
 * any recognised application setting outside the contract rejects Preview.
 */
export function inspectTouchlineIsolatedPreviewEnvironment(
  environment: TouchlineEnvironment = process.env,
): TouchlineIsolatedPreviewEnvironment {
  if (!previewSignal(environment)) return { status: "inactive", reasons: [] };

  const reasons: string[] = [];
  if (environment.VERCEL_ENV !== "preview") reasons.push("vercel-env-not-preview");
  if (environment.TOUCHLINE_DEPLOYMENT_MODE !== TOUCHLINE_ISOLATED_PREVIEW_MODE) {
    reasons.push("missing-server-preview-mode");
  }
  if (environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== TOUCHLINE_ISOLATED_PREVIEW_MODE) {
    reasons.push("missing-public-preview-mode");
  }
  if (!isGeneratedVercelPreviewHostname(environment.VERCEL_URL)) {
    reasons.push("invalid-vercel-preview-hostname");
  }
  if (!isPresent(environment.TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID)
    || environment.TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID !== environment.VERCEL_PROJECT_ID) {
    reasons.push("project-binding-mismatch");
  }
  if (!isPresent(environment.TOUCHLINE_ISOLATED_PREVIEW_TEAM_ID)
    || environment.TOUCHLINE_ISOLATED_PREVIEW_TEAM_ID !== environment.VERCEL_ORG_ID) {
    reasons.push("team-binding-mismatch");
  }

  Object.keys(environment)
    .filter(isTouchlineApplicationEnvironmentKey)
    .filter((name) => !allowedApplicationEnvironmentKeys.has(name))
    .sort()
    .forEach((name) => reasons.push(`forbidden-environment-key:${name}`));

  return reasons.length > 0
    ? { status: "invalid", reasons }
    : { status: "active", reasons: [] };
}

/** Rejects a configured Preview at build/config load before it can deploy. */
export function assertTouchlineIsolatedPreviewEnvironment(
  environment: TouchlineEnvironment = process.env,
) {
  const result = inspectTouchlineIsolatedPreviewEnvironment(environment);
  if (result.status === "invalid") {
    throw new Error(`TouchLine isolated Preview configuration rejected: ${result.reasons.join(", ")}`);
  }
  return result;
}

/**
 * Every dynamic route is denied in isolated mode except the inert local
 * `/preview` page. The proxy applies this before locale, auth or Supabase.
 */
export function resolveTouchlineIsolatedPreviewRoutePolicy(
  pathname: string,
  environment: TouchlineEnvironment = process.env,
): TouchlineIsolatedPreviewRoutePolicy {
  const result = inspectTouchlineIsolatedPreviewEnvironment(environment);
  if (result.status === "inactive") return { status: "inactive" };
  if (result.status === "invalid") {
    return { status: "blocked", reason: "invalid-preview-contract" };
  }
  return pathname === "/preview"
    ? { status: "allow-preview" }
    : { status: "blocked", reason: "isolated-preview" };
}

export function isTouchlineIsolatedPreviewRequest(value: string | null | undefined) {
  return value === "true";
}
