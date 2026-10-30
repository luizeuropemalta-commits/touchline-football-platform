import assert from "node:assert/strict";
import test from "node:test";
import { buildQaCandidateEnvironments } from "../scripts/local/qa-candidate-environment.mts";
import { shouldSecureLoginCookie } from "../lib/server/login-cookie-security.ts";
import { inspectTouchlineIsolatedPreviewEnvironment } from "../lib/touchlinePreview/isolation.ts";
import {
  TOUCHLINE_QA_CANONICAL_ALIAS,
  TOUCHLINE_QA_PROJECT_REF,
  TOUCHLINE_QA_SUPABASE_ORIGIN,
} from "../lib/touchlineArena/qa-canonical-persona.ts";

const source = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-source-anon-credential-only",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-source-service-credential-only",
});
const build = (overrides: Record<string, string | undefined> = {}, qaMarketContext = false) =>
  buildQaCandidateEnvironments({ ...source, ...overrides }, {}, { qaMarketContext });

test("local candidate uses the canonical QA guard and localhost cookie contract", () => {
  const { preview } = build();
  assert.deepEqual(inspectTouchlineIsolatedPreviewEnvironment(preview), { status: "qa", reasons: [] });
  assert.equal(preview.NODE_ENV, "development");
  assert.equal(preview.NODE_OPTIONS, "--max-old-space-size=4096");
  assert.equal(preview.NEXT_WEBPACK_PARALLELISM, "1");
  assert.equal(preview.NEXT_TELEMETRY_DISABLED, "1");
  assert.equal(preview.VERCEL_URL, new URL(TOUCHLINE_QA_CANONICAL_ALIAS).hostname);
  assert.equal(preview.TOUCHLINE_QA_SUPABASE_PROJECT_REF, TOUCHLINE_QA_PROJECT_REF);
  assert.equal(preview.SUPABASE_URL, TOUCHLINE_QA_SUPABASE_ORIGIN);
  assert.equal(preview.NEXT_PUBLIC_SUPABASE_URL, TOUCHLINE_QA_SUPABASE_ORIGIN);
  assert.equal(Object.hasOwn(preview, "VERCEL"), false);
  assert.equal(Object.hasOwn(preview, "__NEXT_PROCESSED_ENV"), false);
  const request = (url: string) => ({ url, headers: new Headers({ host: new URL(url).host }) });
  assert.equal(shouldSecureLoginCookie(request("http://localhost:3219/login/submit"), preview), false);
  for (const url of ["http://127.0.0.1:3219/login/submit", `${TOUCHLINE_QA_CANONICAL_ALIAS}/login/submit`]) {
    assert.equal(shouldSecureLoginCookie(request(url), preview), true);
  }
  assert.equal(shouldSecureLoginCookie(request("http://localhost:3219/login/submit"), { ...preview, VERCEL: "1" }), true);
});

test("only four host process keys pass through; host credentials, flags and overrides never do", () => {
  const host = Object.freeze({
    PATH: "/synthetic/bin", HOME: "/synthetic/home", TMPDIR: "/synthetic/tmp", LANG: "en_GB.UTF-8",
    NODE_OPTIONS: "--max-old-space-size=9999", NODE_ENV: "production", VERCEL: "1",
    NEXT_WEBPACK_PARALLELISM: "100",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-host-service", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-host-anon",
    TOUCHLINE_QA_BASE_URL: "https://foreign.invalid", TOUCHLINE_CLUB_COLLECTION_ENABLED: "true",
    TOUCHLINE_SITE_LOCALES_ENABLED: "true", TOUCHLINE_CARD_PUBLICATION_GATE: "true", TOUCHLINE_CURRENT_SEASON: "host-season",
    TOUCHLINE_GOLDEN_BOOT_ENABLED: "true", SPORTMONKS_API_TOKEN: "synthetic-host-provider",
    VERCEL_GIT_COMMIT_REF: "qa", __NEXT_PROCESSED_ENV: "true",
  });
  const { preview, preflight } = buildQaCandidateEnvironments(source, host, { qaMarketContext: false });
  assert.equal(preview.NODE_OPTIONS, "--max-old-space-size=4096");
  assert.equal(preflight.NODE_OPTIONS, "--max-old-space-size=1024");
  assert.equal(preview.NEXT_WEBPACK_PARALLELISM, "1");
  assert.equal(Object.hasOwn(preflight, "NEXT_WEBPACK_PARALLELISM"), false);
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG"] as const) {
    assert.equal(preview[key], host[key]); assert.equal(preflight[key], host[key]);
  }
  assert.equal(preview.SUPABASE_SERVICE_ROLE_KEY, source.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(preview.NEXT_PUBLIC_SUPABASE_ANON_KEY, source.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  assert.equal(preflight.SUPABASE_SERVICE_ROLE_KEY, source.SUPABASE_SERVICE_ROLE_KEY);
  for (const key of ["TOUCHLINE_CLUB_COLLECTION_ENABLED", "TOUCHLINE_SITE_LOCALES_ENABLED", "TOUCHLINE_CARD_PUBLICATION_GATE", "TOUCHLINE_CURRENT_SEASON", "TOUCHLINE_GOLDEN_BOOT_ENABLED", "SPORTMONKS_API_TOKEN", "VERCEL_GIT_COMMIT_REF", "VERCEL", "__NEXT_PROCESSED_ENV"]) {
    assert.equal(Object.hasOwn(preview, key), false, key);
    assert.equal(Object.hasOwn(preflight, key), false, key);
  }
});

test("only existing approved source configuration is preserved without enabling defaults", () => {
  const approved = {
    TOUCHLINE_CLUB_COLLECTION_ENABLED: "false", TOUCHLINE_SITE_LOCALES_ENABLED: "true",
    TOUCHLINE_CARD_PUBLICATION_GATE: "false", TOUCHLINE_CURRENT_SEASON: "synthetic-season",
  };
  const { preview } = build({ ...approved, TOUCHLINE_GOLDEN_BOOT_ENABLED: "true", SPORTMONKS_API_TOKEN: "synthetic-source-provider", VERCEL: "1" });
  for (const [key, value] of Object.entries(approved)) assert.equal(preview[key], value);
  for (const key of ["TOUCHLINE_GOLDEN_BOOT_ENABLED", "SPORTMONKS_API_TOKEN", "VERCEL"]) assert.equal(Object.hasOwn(preview, key), false);
  for (const key of Object.keys(approved)) assert.equal(Object.hasOwn(build().preview, key), false);
});

test("QA market context must be explicit and only true selects the QA branch", () => {
  assert.equal(Object.hasOwn(build({}, false).preview, "VERCEL_GIT_COMMIT_REF"), false);
  assert.equal(build({}, true).preview.VERCEL_GIT_COMMIT_REF, "qa");
  assert.throws(() => buildQaCandidateEnvironments(source, {}, { qaMarketContext: undefined as unknown as boolean }), /explicit qaMarketContext/);
});

test("local collection override is explicit, QA-isolated, and never enables release", () => {
  const { preview, preflight } = buildQaCandidateEnvironments(source, {}, { qaMarketContext: true, clubCollection: true });
  assert.equal(preview.TOUCHLINE_CLUB_COLLECTION_ENABLED, "true");
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(preview).status, "qa");
  assert.equal(Object.hasOwn(preview, "TOUCHLINE_CLUB_RELEASE_ENABLED"), false);
  assert.equal(Object.hasOwn(preflight, "TOUCHLINE_CLUB_COLLECTION_ENABLED"), false);
  assert.equal(Object.hasOwn(build().preview, "TOUCHLINE_CLUB_COLLECTION_ENABLED"), false);
});

test("release requires its own explicit local QA opt-in and never inherits source or host flags", () => {
  const flagged = { ...source, TOUCHLINE_CLUB_RELEASE_ENABLED: "true" };
  assert.equal(buildQaCandidateEnvironments(flagged, flagged, { qaMarketContext: true, clubCollection: true }).preview.TOUCHLINE_CLUB_RELEASE_ENABLED, undefined);
  const options = { qaMarketContext: true, clubCollection: true, clubRelease: true };
  const { preview, preflight } = buildQaCandidateEnvironments(source, {}, options);
  assert.equal(preview.TOUCHLINE_CLUB_RELEASE_ENABLED, "true");
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment(preview).status, "qa");
  assert.equal(preflight.TOUCHLINE_CLUB_RELEASE_ENABLED, undefined);
  // Release is also admitted in the exact hosted QA target; the local builder
  // still requires explicit opt-in and never inherits a host/source flag.
  for (const override of [{ NODE_ENV: "production" }, { VERCEL: "1" }]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment({ ...preview, ...override }).status, "qa");
  }
  for (const override of [{ VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { TOUCHLINE_QA_SUPABASE_PROJECT_REF: "other-project" }, { TOUCHLINE_CLUB_COLLECTION_ENABLED: "false" }]) {
    assert.equal(inspectTouchlineIsolatedPreviewEnvironment({ ...preview, ...override }).status, "invalid");
  }
  assert.throws(() => buildQaCandidateEnvironments(source, {}, { ...options, clubCollection: false }), /requires explicit/);
  assert.throws(() => buildQaCandidateEnvironments(source, {}, { ...options, qaMarketContext: false }), /requires explicit/);
  assert.throws(() => buildQaCandidateEnvironments(source, {}, { ...options, clubRelease: "true" as unknown as boolean }), /boolean clubRelease/);
  assert.throws(() => buildQaCandidateEnvironments({ ...source, NEXT_PUBLIC_SUPABASE_URL: "https://production.invalid" }, {}, options), /canonical project/);
});

test("preflight alone receives the canonical alias and only its needed credentials", () => {
  const { preview, preflight } = build({ TOUCHLINE_QA_BASE_URL: "https://foreign.invalid" });
  assert.equal(Object.hasOwn(preview, "TOUCHLINE_QA_BASE_URL"), false);
  assert.equal(preflight.TOUCHLINE_QA_BASE_URL, TOUCHLINE_QA_CANONICAL_ALIAS);
  assert.deepEqual(Object.keys(preflight).sort(), ["NODE_OPTIONS", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "TOUCHLINE_QA_BASE_URL"]);
  assert.equal(inspectTouchlineIsolatedPreviewEnvironment({ ...preview, TOUCHLINE_QA_BASE_URL: preflight.TOUCHLINE_QA_BASE_URL }).status, "invalid");
});

test("source URLs must be present, exact and mutually consistent before constructing either environment", () => {
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    for (const value of ["", "https://other.supabase.co", `${TOUCHLINE_QA_SUPABASE_ORIGIN}/`, `${TOUCHLINE_QA_SUPABASE_ORIGIN}?token=synthetic-private`, ` ${TOUCHLINE_QA_SUPABASE_ORIGIN}`]) {
      assert.throws(() => build({ [key]: value }), error => error instanceof Error && !error.message.includes(value || "synthetic-private") && /canonical project/.test(error.message));
    }
  }
  assert.throws(() => build({ NEXT_PUBLIC_SUPABASE_URL: undefined }), /source Supabase URL/);
  assert.equal(build({ NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN }).preview.NEXT_PUBLIC_SUPABASE_URL, TOUCHLINE_QA_SUPABASE_ORIGIN);
  assert.equal(build({ SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN }).preview.SUPABASE_URL, TOUCHLINE_QA_SUPABASE_ORIGIN);
});

test("missing, empty or identical credentials fail closed without falling back to host secrets", () => {
  for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    for (const value of [undefined, "", "   ", " synthetic-private ", "synthetic\nprivate", "synthetic\tprivate", "synthetic private", "synthetic\u0000private", "synthetic\u007fprivate"]) {
      assert.throws(() => buildQaCandidateEnvironments({ ...source, [key]: value }, {
        [key]: "synthetic-host-fallback",
      }, { qaMarketContext: false }), error => error instanceof Error && !error.message.includes("synthetic-private") && /source credential/.test(error.message));
    }
  }
  assert.throws(() => build({ SUPABASE_SERVICE_ROLE_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY }), /must be different/);
});

test("input objects remain unchanged and prototype properties are not admitted", () => {
  const before = { ...source };
  buildQaCandidateEnvironments(source, Object.freeze({ PATH: "/synthetic/bin" }), { qaMarketContext: true });
  assert.deepEqual(source, before);
  const inherited = Object.assign(Object.create({ TOUCHLINE_CLUB_COLLECTION_ENABLED: "true" }), source);
  assert.equal(Object.hasOwn(buildQaCandidateEnvironments(inherited, {}, { qaMarketContext: false }).preview, "TOUCHLINE_CLUB_COLLECTION_ENABLED"), false);
});
