import {
  TOUCHLINE_QA_HOSTNAME,
  TOUCHLINE_QA_ORIGIN,
} from "../touchlineArena/public-origin.ts";
import {
  TOUCHLINE_QA_PREVIEW_MODE,
  inspectTouchlineIsolatedPreviewEnvironment,
} from "./isolation.ts";

export const TOUCHLINE_QA_SUPABASE_PROJECT_REF = "xgxbwqxjssxxuihuwmgy" as const;

type TouchlineEnvironment = Readonly<Record<string, string | undefined>>;

export type TouchlineQaEnvironmentVerification = Readonly<{
  status: "PASS" | "FAIL";
  reason:
    | "QA_ENVIRONMENT_CONFIGURATION_COHERENT"
    | "QA_RUNTIME_INVALID"
    | "QA_BRANCH_MISMATCH"
    | "QA_ALIAS_MISMATCH"
    | "QA_PROJECT_MISMATCH"
    | "QA_AUTH_ORIGIN_MISMATCH"
    | "QA_CREDENTIAL_CONFIGURATION_INVALID";
}>;

function exactHttpsOrigin(value: string | undefined, expectedHostname: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.hostname.toLowerCase() === expectedHostname
      && parsed.port === ""
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function plausibleCredential(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim();
  return normalized === value
    && normalized.length >= 24
    && normalized.length <= 8_192
    && !/[\s\u0000-\u001f\u007f]/.test(normalized);
}

/**
 * Compares the runtime envelope without returning or logging any inspected
 * value. Credential validity itself is proven separately by the protected
 * server route against the QA-only database assertion.
 */
export function inspectTouchlineQaVercelEnvironment(input: Readonly<{
  environment?: TouchlineEnvironment;
  requestHostname: string;
}>): TouchlineQaEnvironmentVerification {
  const environment = input.environment ?? process.env;

  if (environment.VERCEL_ENV !== "preview"
    || environment.TOUCHLINE_DEPLOYMENT_MODE !== TOUCHLINE_QA_PREVIEW_MODE
    || environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE !== TOUCHLINE_QA_PREVIEW_MODE) {
    return { status: "FAIL", reason: "QA_RUNTIME_INVALID" };
  }
  if (environment.VERCEL_GIT_COMMIT_REF !== "qa") {
    return { status: "FAIL", reason: "QA_BRANCH_MISMATCH" };
  }
  if (environment.VERCEL_BRANCH_URL?.trim().toLowerCase() !== TOUCHLINE_QA_HOSTNAME
    || input.requestHostname.trim().toLowerCase() !== TOUCHLINE_QA_HOSTNAME) {
    return { status: "FAIL", reason: "QA_ALIAS_MISMATCH" };
  }

  const supabaseHostname = `${TOUCHLINE_QA_SUPABASE_PROJECT_REF}.supabase.co`;
  if (environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== TOUCHLINE_QA_SUPABASE_PROJECT_REF
    || !exactHttpsOrigin(environment.NEXT_PUBLIC_SUPABASE_URL, supabaseHostname)
    || !exactHttpsOrigin(environment.SUPABASE_URL, supabaseHostname)) {
    return { status: "FAIL", reason: "QA_PROJECT_MISMATCH" };
  }
  if (!exactHttpsOrigin(environment.NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN, TOUCHLINE_QA_HOSTNAME)
    || environment.NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN !== TOUCHLINE_QA_ORIGIN) {
    return { status: "FAIL", reason: "QA_AUTH_ORIGIN_MISMATCH" };
  }

  const anonCredential = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceCredential = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!plausibleCredential(anonCredential)
    || !plausibleCredential(serviceCredential)
    || anonCredential === serviceCredential) {
    return { status: "FAIL", reason: "QA_CREDENTIAL_CONFIGURATION_INVALID" };
  }

  if (inspectTouchlineIsolatedPreviewEnvironment(environment).status !== "qa") {
    return { status: "FAIL", reason: "QA_RUNTIME_INVALID" };
  }

  return { status: "PASS", reason: "QA_ENVIRONMENT_CONFIGURATION_COHERENT" };
}
