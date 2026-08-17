/**
 * A deliberately narrow deployment contract for an isolated Vercel Preview.
 *
 * This module is edge-safe: it has no Node, network, storage, credential or
 * framework dependency. A valid contract only proves that the application can
 * serve the inert `/preview` envelope. It does not make the product data or
 * authentication safe to preview.
 */

export const TOUCHLINE_ISOLATED_PREVIEW_MODE = "isolated-preview" as const;
/**
 * A branch-scoped functional QA Preview. It is intentionally distinct from
 * the inert isolated Preview: it may use only the dedicated QA Supabase
 * project and must never inherit Production credentials or providers.
 */
export const TOUCHLINE_QA_PREVIEW_MODE = "qa-preview" as const;
export const TOUCHLINE_ISOLATED_PREVIEW_HEADER = "x-touchline-isolated-preview";
export const TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC =
  "TL_PREVIEW_AUTH_UNAVAILABLE_NO_STAGING_CONFIGURATION" as const;

type TouchlineEnvironment = Readonly<Record<string, string | undefined>>;

export type TouchlineIsolatedPreviewEnvironment =
  | { status: "inactive"; reasons: readonly [] }
  | { status: "active"; reasons: readonly [] }
  | { status: "qa"; reasons: readonly [] }
  | { status: "invalid"; reasons: readonly string[] };

export type TouchlineIsolatedPreviewRoutePolicy =
  | { status: "inactive" }
  | { status: "allow-preview" }
  | {
    status: "blocked";
    reason: "isolated-preview" | "invalid-preview-contract";
    /**
     * Safe, name-only diagnostics for server runtime logs. Environment values
     * must never cross the Preview boundary or enter logs.
     */
    diagnosticReasons: readonly string[];
  };

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

/** Names only. Values remain runtime secrets and are never reported. */
export const TOUCHLINE_QA_PREVIEW_ALLOWED_APPLICATION_ENVIRONMENT_KEYS = [
  "NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE",
  "TOUCHLINE_DEPLOYMENT_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN",
  "TOUCHLINE_QA_SUPABASE_PROJECT_REF",
  "TOUCHLINE_CURRENT_SEASON",
  "TOUCHLINE_CARD_PUBLICATION_GATE",
  "TOUCHLINE_OWNER_EMAILS",
  "TOUCHLINE_SITE_OFFLINE",
] as const;

const allowedApplicationEnvironmentKeys = new Set<string>(
  TOUCHLINE_ISOLATED_PREVIEW_ALLOWED_APPLICATION_ENVIRONMENT_KEYS,
);
const allowedQaApplicationEnvironmentKeys = new Set<string>(
  TOUCHLINE_QA_PREVIEW_ALLOWED_APPLICATION_ENVIRONMENT_KEYS,
);
// This is an opaque runtime marker injected by Vercel's serverless runtime.
// It is not an AWS credential. Keep this a name-level exception: real AWS_*
// credentials must continue to fail the QA Preview contract closed.
const allowedQaPlatformRuntimeEnvironmentKeys = new Set<string>([
  "AWS_EXECUTION_ENV",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
]);

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGeneratedVercelPreviewHostname(value: string | undefined) {
  if (!isPresent(value)) return false;
  const hostname = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/.test(hostname) && !hostname.includes("/");
}

function isQaSupabaseHostname(value: string | undefined, projectRef: string | undefined) {
  if (!isPresent(value) || !isPresent(projectRef)) return false;
  try {
    return new URL(value).hostname === `${projectRef.trim().toLowerCase()}.supabase.co`;
  } catch {
    return false;
  }
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

  const isUndeclaredVercelPreview = environment.VERCEL_ENV === "preview"
    && environment.TOUCHLINE_DEPLOYMENT_MODE === undefined
    && environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === undefined;
  if (isUndeclaredVercelPreview) {
    return {
      status: "invalid",
      reasons: [TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC],
    };
  }

  if (environment.TOUCHLINE_DEPLOYMENT_MODE === TOUCHLINE_QA_PREVIEW_MODE
    || environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === TOUCHLINE_QA_PREVIEW_MODE) {
    const reasons: string[] = [];
    if (environment.VERCEL_ENV !== "preview") reasons.push("vercel-env-not-preview");
    if (environment.TOUCHLINE_DEPLOYMENT_MODE !== TOUCHLINE_QA_PREVIEW_MODE) {
      reasons.push("missing-server-qa-preview-mode");
    }
    if (environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== TOUCHLINE_QA_PREVIEW_MODE) {
      reasons.push("missing-public-qa-preview-mode");
    }
    if (!isGeneratedVercelPreviewHostname(environment.VERCEL_URL)) {
      reasons.push("invalid-vercel-preview-hostname");
    }
    if (!isQaSupabaseHostname(environment.NEXT_PUBLIC_SUPABASE_URL, environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF)
      || !isQaSupabaseHostname(environment.SUPABASE_URL, environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF)
      || !isPresent(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      || !isPresent(environment.SUPABASE_SERVICE_ROLE_KEY)) {
      reasons.push("missing-or-mismatched-qa-supabase-contract");
    }
    Object.keys(environment)
      .filter(isTouchlineApplicationEnvironmentKey)
      .filter((name) => !allowedQaApplicationEnvironmentKeys.has(name))
      .filter((name) => !allowedQaPlatformRuntimeEnvironmentKeys.has(name))
      .filter((name) => !name.startsWith("VERCEL_") && !name.startsWith("NEXT_PUBLIC_VERCEL_"))
      .sort()
      .forEach((name) => reasons.push(`forbidden-qa-environment-key:${name}`));
    return reasons.length > 0
      ? { status: "invalid", reasons }
      : { status: "qa", reasons: [] };
  }

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
    if (result.reasons.length === 1
      && result.reasons[0] === TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC) {
      throw new Error(TOUCHLINE_PREVIEW_AUTH_UNAVAILABLE_DIAGNOSTIC);
    }
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
  if (result.status === "inactive" || result.status === "qa") return { status: "inactive" };
  if (result.status === "invalid") {
    return {
      status: "blocked",
      reason: "invalid-preview-contract",
      diagnosticReasons: result.reasons,
    };
  }
  return pathname === "/preview"
    ? { status: "allow-preview" }
    : { status: "blocked", reason: "isolated-preview", diagnosticReasons: [] };
}

export function isTouchlineIsolatedPreviewRequest(value: string | null | undefined) {
  return value === "true";
}
