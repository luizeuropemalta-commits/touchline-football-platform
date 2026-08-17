#!/usr/bin/env node

/**
 * Read-only, local release checklist. It validates repository contracts and
 * prints the exact follow-up commands/gates; it never reads runtime values,
 * contacts a platform, or makes a deployment decision.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOUCHLINE_AUTH_RECOVERY_SECRET",
  "TOUCHLINE_CURRENT_SEASON",
  "TOUCHLINE_OWNER_EMAILS",
  "TOUCHLINE_SITE_OFFLINE",
]);

export const TOUCHLINE_ISOLATED_PREVIEW_ENVIRONMENT_NAMES = Object.freeze([
  "NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE",
  "TOUCHLINE_DEPLOYMENT_MODE",
  "TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID",
  "TOUCHLINE_ISOLATED_PREVIEW_TEAM_ID",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_ID",
  "VERCEL_ORG_ID",
]);

export const TOUCHLINE_QA_PREVIEW_ENVIRONMENT_NAMES = Object.freeze([
  "NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE",
  "TOUCHLINE_DEPLOYMENT_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN",
  "TOUCHLINE_QA_SUPABASE_PROJECT_REF",
  "TOUCHLINE_CARD_PUBLICATION_GATE",
]);

const REQUIRED_SCRIPTS = Object.freeze({
  test: "node --test --experimental-strip-types tests/*.test.mts",
  typecheck: "tsc --noEmit",
  lint: "eslint .",
  build: "next build --webpack",
});

function envNamesFromTemplate(source) {
  return new Set(
    [...source.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=/gm)].map((match) => match[1]),
  );
}

function missingTokens(source, tokens) {
  return tokens.filter((token) => !source.includes(token));
}

/**
 * This accepts text already loaded by the caller so unit tests do not need a
 * worktree, platform settings, credential values, or browser session.
 */
export function evaluateTouchlineReleaseReadiness({
  packageJson,
  envTemplate,
  publicOriginSource,
  proxySource,
  nextConfigSource,
  clubHubFixtureSource,
  cardFixtureSource,
  cardNeonFixtureSource,
  ownerPortraitFixtureSource,
  officialTableFixtureSource,
  arenaMainFieldFixtureSource,
  twentyClubGalleryFixtureSource,
}) {
  const scripts = packageJson?.scripts ?? {};
  const templateNames = envNamesFromTemplate(envTemplate);
  const missingEnvironmentNames = TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES
    .filter((name) => !templateNames.has(name));
  const missingScripts = Object.entries(REQUIRED_SCRIPTS)
    .filter(([name, command]) => scripts[name] !== command)
    .map(([name]) => name);
  const staticContractFailures = [
    ...missingTokens(publicOriginSource, [
      'TOUCHLINE_PUBLIC_ORIGIN = "https://touchline.com.br"',
      'TOUCHLINE_PUBLIC_WWW_HOSTNAME = "www.touchline.com.br"',
      "return TOUCHLINE_PUBLIC_ORIGIN;",
    ]).map((token) => `public-origin:${token}`),
    ...missingTokens(proxySource, [
      "isTouchLinePublicWwwHost(hostname)",
      "NextResponse.redirect(canonicalUrl, 308)",
      '"/visual-qa"',
    ]).map((token) => `proxy:${token}`),
    ...missingTokens(nextConfigSource, [
      "assertTouchlineIsolatedPreviewEnvironment();",
    ]).map((token) => `next-config:${token}`),
    ...missingTokens(clubHubFixtureSource, [
      "resolveTouchlineVisualQaLocale",
      "data-visual-qa-locale={locale}",
      "locale={locale}",
    ]).map((token) => `clubhub-fixture:${token}`),
    ...missingTokens(cardFixtureSource, [
      "resolveTouchlineVisualQaLocale",
      "data-visual-qa-locale={locale}",
      "runtimeLocaleOverride={locale}",
    ]).map((token) => `card-fixture:${token}`),
    ...missingTokens(cardNeonFixtureSource, [
      "resolveTouchlineVisualQaLocale",
      "data-visual-qa-locale={locale}",
      "runtimeLocaleOverride={locale}",
      "locale={locale}",
    ]).map((token) => `card-neon-fixture:${token}`),
    ...missingTokens(ownerPortraitFixtureSource, [
      "resolveTouchlineVisualQaLocale",
      "data-visual-qa-locale={locale}",
      "Perímetro do retrato do Club Owner",
    ]).map((token) => `owner-portrait-fixture:${token}`),
    ...missingTokens(officialTableFixtureSource, [
      "resolveTouchlineVisualQaLocale",
      "data-visual-qa-locale={locale}",
      "locale={locale}",
      "Tabela oficial inicial da liga",
    ]).map((token) => `official-table-fixture:${token}`),
    ...missingTokens(arenaMainFieldFixtureSource, [
      "resolveTouchlineVisualQaLocale",
      "data-visual-qa-locale={locale}",
      'data-static-arena-score="live"',
      'data-static-arena-score="final"',
      'data-static-arena-score="next"',
      'next: "PRÓXIMO"',
      'next: "NEXT"',
    ]).map((token) => `arena-main-field-fixture:${token}`),
    ...missingTokens(twentyClubGalleryFixtureSource, [
      'data-twenty-club-card-gallery="static"',
      "TOUCHLINE_ENGLAND_CLUBS.map",
      "TOUCHLINE_CARD_TIER_KEYS",
      'currency: "GBP"',
      "ADMIN-GATED · STATIC LOCAL VISUAL QA",
      "resolveTouchlineVisualQaLocale",
    ]).map((token) => `twenty-club-gallery-fixture:${token}`),
  ];

  return Object.freeze({
    schemaVersion: "touchline-release-readiness-local-check-v1",
    status: missingEnvironmentNames.length || missingScripts.length || staticContractFailures.length
      ? "LOCAL_CONTRACT_INVALID"
      : "LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL",
    publicRoute: Object.freeze({
      canonicalOrigin: "https://touchline.com.br",
      wwwPolicy: "308-to-canonical-origin",
      technicalOrigin: "https://touchline-arena-official.vercel.app",
    }),
    environment: Object.freeze({
      mode: "names-only; no runtime values inspected",
      functionalReleaseNames: TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES,
      internalOrigin: "TOUCHLINE_INTERNAL_APP_ORIGIN or platform VERCEL_URL",
      providerAndPayments: "keep SPORTMONKS_*, FOOTBALL_DATA_*, and STRIPE_* absent or disabled unless separately approved",
      isolatedPreviewNames: TOUCHLINE_ISOLATED_PREVIEW_ENVIRONMENT_NAMES,
      isolatedPreviewLimitation: "valid isolated Preview serves only /preview; it is not ClubHub/card product QA",
      qaPreviewNames: TOUCHLINE_QA_PREVIEW_ENVIRONMENT_NAMES,
      functionalPreviewAuth: "REQUIRES_DEDICATED_QA_SUPABASE_CONFIGURATION",
      functionalPreviewDiagnostic: "missing-or-mismatched-qa-supabase-contract",
      missingTemplateNames: missingEnvironmentNames,
    }),
    localCommands: Object.freeze([
      "git diff --check",
      "pnpm run check:release-readiness",
      "pnpm typecheck",
      "pnpm lint",
      "pnpm test",
      "pnpm build",
      "pnpm start",
    ]),
    fixtureMatrix: Object.freeze([
      "/visual-qa/clubhub-profile-contract?lang=en-GB",
      "/visual-qa/clubhub-profile-contract?lang=pt-BR",
      "/visual-qa/card-value-states?lang=en-GB",
      "/visual-qa/card-value-states?lang=pt-BR",
      "/visual-qa/card-neon-trace?lang=en-GB",
      "/visual-qa/card-neon-trace?lang=pt-BR",
      "/visual-qa/club-owner-portrait-neon?lang=en-GB",
      "/visual-qa/club-owner-portrait-neon?lang=pt-BR",
      "/visual-qa/official-league-table-initial?lang=en-GB",
      "/visual-qa/official-league-table-initial?lang=pt-BR",
      "/visual-qa/arena-main-field?lang=en-GB",
      "/visual-qa/arena-main-field?lang=pt-BR",
      "/visual-qa/twenty-club-card-gallery?lang=en-GB",
      "/visual-qa/twenty-club-card-gallery?lang=pt-BR",
    ]),
    manualGates: Object.freeze([
      "Use the static fixtures at 390px, 768px, and 1280px; include the twenty-club gallery and record no horizontal overflow, readable cards, ClubHub order, canonical crest/frame/neon coverage, and EN/PT labels.",
      "Observe the same static fixtures in Safari/WebKit plus Chrome Android or an approved equivalent; keyboard, touch, and reduced-motion remain manual evidence.",
      "Keep functional QA Preview separate: it requires the dedicated QA Supabase contract and may not inherit provider or payment variables. The inert isolated Preview deliberately blocks ClubHub/cards.",
    ]),
    externalGates: Object.freeze([
      "No tracked Vercel project binding or domain/alias verification exists in this repository.",
      "Known durable Quick Sub, immutable shared-data, and functional Preview/data-boundary gates remain separate release NO-GO evidence.",
    ]),
    missingScripts,
    staticContractFailures,
  });
}

function parseArgs(args) {
  if (args.length === 1 && args[0] === "--check") return;
  throw new Error("TL_RELEASE_READINESS_CHECK_REQUIRES_CHECK_MODE");
}

async function readRepositoryInputs(rootDirectory) {
  const read = (path) => readFile(resolve(rootDirectory, path), "utf8");
  const [packageText, envTemplate, publicOriginSource, proxySource, nextConfigSource, clubHubFixtureSource, cardFixtureSource, cardNeonFixtureSource, ownerPortraitFixtureSource, officialTableFixtureSource, arenaMainFieldFixtureSource, twentyClubGalleryFixtureSource] = await Promise.all([
    read("package.json"),
    read(".env.example"),
    read("lib/touchlineArena/public-origin.ts"),
    read("proxy.ts"),
    read("next.config.ts"),
    read("app/visual-qa/clubhub-profile-contract/page.tsx"),
    read("app/visual-qa/card-value-states/page.tsx"),
    read("app/visual-qa/card-neon-trace/page.tsx"),
    read("app/visual-qa/club-owner-portrait-neon/page.tsx"),
    read("app/visual-qa/official-league-table-initial/page.tsx"),
    read("app/visual-qa/arena-main-field/page.tsx"),
    read("app/visual-qa/twenty-club-card-gallery/page.tsx"),
  ]);
  return {
    packageJson: JSON.parse(packageText),
    envTemplate,
    publicOriginSource,
    proxySource,
    nextConfigSource,
    clubHubFixtureSource,
    cardFixtureSource,
    cardNeonFixtureSource,
    ownerPortraitFixtureSource,
    officialTableFixtureSource,
    arenaMainFieldFixtureSource,
    twentyClubGalleryFixtureSource,
  };
}

async function main() {
  parseArgs(process.argv.slice(2));
  const result = evaluateTouchlineReleaseReadiness(await readRepositoryInputs(process.cwd()));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL") process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_RELEASE_READINESS_CHECK_FAILED"}\n`);
    process.exitCode = 1;
  });
}
