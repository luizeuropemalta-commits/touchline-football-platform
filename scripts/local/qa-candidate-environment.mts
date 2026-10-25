import {
  TOUCHLINE_QA_CANONICAL_ALIAS,
  TOUCHLINE_QA_PROJECT_REF,
  TOUCHLINE_QA_SUPABASE_ORIGIN,
} from "../../lib/touchlineArena/qa-canonical-persona.ts";
import { inspectTouchlineIsolatedPreviewEnvironment } from "../../lib/touchlinePreview/isolation.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const HOST_KEYS = ["PATH", "HOME", "TMPDIR", "LANG"] as const;
const APPROVED_SOURCE_CONFIGURATION = [
  "TOUCHLINE_CLUB_COLLECTION_ENABLED",
  "TOUCHLINE_SITE_LOCALES_ENABLED",
  "TOUCHLINE_CARD_PUBLICATION_GATE",
  "TOUCHLINE_CURRENT_SEASON",
] as const;

function ownValue(environment: Environment, key: string) {
  return Object.hasOwn(environment, key) ? environment[key] : undefined;
}

function sourceCredential(source: Environment, key: string) {
  const value = ownValue(source, key);
  if (typeof value !== "string" || !value || /[\s\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Local QA requires a nonempty source credential: ${key}`);
  }
  return value;
}

/** Pure construction only: no env loading, process mutation, logging or I/O.
 * The launcher must independently reject loadable repository .env files.
 */
export function buildQaCandidateEnvironments(
  source: Environment,
  hostEnvironment: Environment,
  options: Readonly<{ qaMarketContext: boolean; clubCollection?: boolean; clubRelease?: boolean }>,
): { preview: Record<string, string>; preflight: Record<string, string> } {
  if (typeof options.qaMarketContext !== "boolean") {
    throw new Error("Local QA requires an explicit qaMarketContext choice");
  }
  if (options.clubCollection !== undefined && typeof options.clubCollection !== "boolean") {
    throw new Error("Local QA requires an explicit boolean clubCollection choice");
  }
  if (options.clubRelease !== undefined && typeof options.clubRelease !== "boolean") {
    throw new Error("Local QA requires an explicit boolean clubRelease choice");
  }
  if (options.clubRelease === true && (options.clubCollection !== true || options.qaMarketContext !== true)) {
    throw new Error("Local QA release requires explicit collection and QA market context");
  }
  const sourceUrls = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
  if (sourceUrls.every(key => ownValue(source, key) === undefined)) {
    throw new Error("Local QA requires a source Supabase URL");
  }
  for (const key of sourceUrls) {
    const value = ownValue(source, key);
    if (value !== undefined && value !== TOUCHLINE_QA_SUPABASE_ORIGIN) {
      throw new Error(`Local QA source URL does not match the canonical project: ${key}`);
    }
  }
  const anon = sourceCredential(source, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = sourceCredential(source, "SUPABASE_SERVICE_ROLE_KEY");
  if (anon === service) throw new Error("Local QA source credentials must be different");

  const host: Record<string, string> = {};
  for (const key of HOST_KEYS) {
    const value = ownValue(hostEnvironment, key);
    if (value !== undefined) host[key] = value;
  }
  const preview: Record<string, string> = {
    ...host,
    NODE_ENV: "development",
    NODE_OPTIONS: "--max-old-space-size=4096",
    // Bound concurrent module work in local Webpack (supported by installed Next).
    // This limits compilation concurrency, not total process memory.
    NEXT_WEBPACK_PARALLELISM: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    VERCEL_ENV: "preview",
    VERCEL_URL: new URL(TOUCHLINE_QA_CANONICAL_ALIAS).hostname,
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: TOUCHLINE_QA_PROJECT_REF,
    SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
  };
  for (const key of APPROVED_SOURCE_CONFIGURATION) {
    const value = ownValue(source, key);
    if (value !== undefined) preview[key] = value;
  }
  if (options.qaMarketContext) preview.VERCEL_GIT_COMMIT_REF = "qa";
  // Collection review alone never enables release. Release is a separate owner opt-in.
  if (options.clubCollection === true) preview.TOUCHLINE_CLUB_COLLECTION_ENABLED = "true";
  if (options.clubRelease === true) preview.TOUCHLINE_CLUB_RELEASE_ENABLED = "true";
  const inspection = inspectTouchlineIsolatedPreviewEnvironment(preview);
  if (inspection.status !== "qa") throw new Error("Local QA environment failed the canonical preview contract");

  // This alias belongs to the persona command, never to the Next environment.
  const preflight: Record<string, string> = {
    ...host,
    NODE_OPTIONS: "--max-old-space-size=1024",
    SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN,
    SUPABASE_SERVICE_ROLE_KEY: service,
    TOUCHLINE_QA_BASE_URL: TOUCHLINE_QA_CANONICAL_ALIAS,
  };
  return { preview, preflight };
}
