import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateTouchlineReleaseReadiness,
  TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES,
  TOUCHLINE_ISOLATED_PREVIEW_ENVIRONMENT_NAMES,
} from "../scripts/check-touchline-release-readiness.mjs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const checklistSource = source("../scripts/check-touchline-release-readiness.mjs");

function currentRepositoryInput() {
  return {
    packageJson: JSON.parse(source("../package.json")),
    envTemplate: source("../.env.example"),
    publicOriginSource: source("../lib/touchlineArena/public-origin.ts"),
    proxySource: source("../proxy.ts"),
    nextConfigSource: source("../next.config.ts"),
    clubHubFixtureSource: source("../app/visual-qa/clubhub-profile-contract/page.tsx"),
    cardFixtureSource: source("../app/visual-qa/card-value-states/page.tsx"),
    cardNeonFixtureSource: source("../app/visual-qa/card-neon-trace/page.tsx"),
    ownerPortraitFixtureSource: source("../app/visual-qa/club-owner-portrait-neon/page.tsx"),
    officialTableFixtureSource: source("../app/visual-qa/official-league-table-initial/page.tsx"),
    arenaMainFieldFixtureSource: source("../app/visual-qa/arena-main-field/page.tsx"),
  };
}

test("the local release checklist maps the public route, name-only environment contract and EN/PT fixtures", () => {
  const result = evaluateTouchlineReleaseReadiness(currentRepositoryInput());

  assert.equal(result.status, "LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL");
  assert.equal(result.publicRoute.canonicalOrigin, "https://touchline.com.br");
  assert.equal(result.publicRoute.wwwPolicy, "308-to-canonical-origin");
  assert.deepEqual(result.environment.functionalReleaseNames, TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES);
  assert.deepEqual(result.environment.isolatedPreviewNames, TOUCHLINE_ISOLATED_PREVIEW_ENVIRONMENT_NAMES);
  assert.deepEqual(result.environment.missingTemplateNames, []);
  assert.ok(result.localCommands.includes("pnpm build"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/clubhub-profile-contract?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/card-value-states?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/card-neon-trace?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/club-owner-portrait-neon?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/official-league-table-initial?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/arena-main-field?lang=pt-BR"));
  assert.ok(result.manualGates.some((gate) => gate.includes("Safari/WebKit")));
  assert.ok(result.externalGates.some((gate) => gate.includes("Vercel project binding")));
});

test("the checklist fails closed when a script, name-only contract or static route guard drifts", () => {
  const input = currentRepositoryInput();
  const missingScript = evaluateTouchlineReleaseReadiness({
    ...input,
    packageJson: { ...input.packageJson, scripts: { ...input.packageJson.scripts, build: "next build" } },
  });
  assert.equal(missingScript.status, "LOCAL_CONTRACT_INVALID");
  assert.deepEqual(missingScript.missingScripts, ["build"]);

  const missingName = evaluateTouchlineReleaseReadiness({
    ...input,
    envTemplate: input.envTemplate.replace("TOUCHLINE_SITE_OFFLINE=", "REMOVED_TOUCHLINE_SITE_OFFLINE="),
  });
  assert.equal(missingName.status, "LOCAL_CONTRACT_INVALID");
  assert.deepEqual(missingName.environment.missingTemplateNames, ["TOUCHLINE_SITE_OFFLINE"]);

  const missingOrigin = evaluateTouchlineReleaseReadiness({
    ...input,
    publicOriginSource: input.publicOriginSource.replace('TOUCHLINE_PUBLIC_ORIGIN = "https://touchline.com.br"', "TOUCHLINE_PUBLIC_ORIGIN = \"https://invalid.example\""),
  });
  assert.equal(missingOrigin.status, "LOCAL_CONTRACT_INVALID");
  assert.ok(missingOrigin.staticContractFailures.some((failure) => failure.startsWith("public-origin:")));
});

test("the executable checklist cannot inspect credentials or contact product infrastructure", () => {
  for (const forbidden of [
    /process\.env/,
    /\bfetch\s*\(/,
    /create(?:Admin)?Client/,
    /@supabase/,
    /createFootballDataProvider/,
    /child_process/,
    /\.insert\s*\(/,
    /\.update\s*\(/,
    /\.delete\s*\(/,
    /\.upsert\s*\(/,
    /\.rpc\s*\(/,
  ]) {
    assert.doesNotMatch(checklistSource, forbidden);
  }
});
