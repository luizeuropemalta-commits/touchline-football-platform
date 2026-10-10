import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateTouchlineReleaseReadiness,
  TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES,
  TOUCHLINE_ISOLATED_PREVIEW_ENVIRONMENT_NAMES,
  TOUCHLINE_QA_PREVIEW_ENVIRONMENT_NAMES,
  TOUCHLINE_CENTRAL_QUOTA_ENVIRONMENT_NAMES,
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
    twentyClubGalleryFixtureSource: source("../app/visual-qa/twenty-club-card-gallery/page.tsx"),
  };
}

test("the local release checklist maps the public route, name-only environment contract and EN/PT fixtures", () => {
  const result = evaluateTouchlineReleaseReadiness(currentRepositoryInput());

  assert.equal(result.status, "LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL");
  assert.equal(result.publicRoute.canonicalOrigin, "https://touchline.com.br");
  assert.equal(result.publicRoute.wwwPolicy, "308-to-canonical-origin");
  assert.deepEqual(result.environment.functionalReleaseNames, TOUCHLINE_FUNCTIONAL_RELEASE_ENVIRONMENT_NAMES);
  assert.deepEqual(result.environment.isolatedPreviewNames, TOUCHLINE_ISOLATED_PREVIEW_ENVIRONMENT_NAMES);
  assert.deepEqual(result.environment.qaPreviewNames, TOUCHLINE_QA_PREVIEW_ENVIRONMENT_NAMES);
  assert.equal(result.environment.functionalPreviewAuth, "REQUIRES_DEDICATED_QA_SUPABASE_CONFIGURATION");
  assert.equal(result.environment.functionalPreviewDiagnostic, "missing-or-mismatched-qa-supabase-contract");
  assert.deepEqual(result.environment.missingTemplateNames, []);
  assert.deepEqual(result.environment.centralQuota.names, TOUCHLINE_CENTRAL_QUOTA_ENVIRONMENT_NAMES);
  assert.deepEqual(result.environment.centralQuota.missingTemplateNames, []);
  assert.equal(result.environment.centralQuota.runtimeStatus, "NOT_INSPECTED_NOT_ACTIVATION_APPROVAL");
  assert.ok(result.localCommands.includes("pnpm build"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/clubhub-profile-contract?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/card-value-states?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/card-neon-trace?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/club-owner-portrait-neon?lang=pt-BR"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/official-league-table-initial?lang=pt-BR"));
  assert.equal(result.fixtureMatrix.some((path) => path.startsWith("/visual-qa/arena-main-field")), false);
  assert.ok(result.fixtureMatrix.includes("/visual-qa/twenty-club-card-gallery?lang=en-GB"));
  assert.ok(result.fixtureMatrix.includes("/visual-qa/twenty-club-card-gallery?lang=pt-BR"));
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

  // Retiring one historical fixture must not make remaining fixtures optional.
  for (const [key, prefix] of [
    ["clubHubFixtureSource", "clubhub-fixture:"],
    ["cardFixtureSource", "card-fixture:"],
    ["cardNeonFixtureSource", "card-neon-fixture:"],
    ["ownerPortraitFixtureSource", "owner-portrait-fixture:"],
    ["officialTableFixtureSource", "official-table-fixture:"],
    ["twentyClubGalleryFixtureSource", "twenty-club-gallery-fixture:"],
  ] as const) {
    const missingFixture = evaluateTouchlineReleaseReadiness({ ...input, [key]: "" });
    assert.equal(missingFixture.status, "LOCAL_CONTRACT_INVALID", key);
    assert.ok(missingFixture.staticContractFailures.some((failure) => failure.startsWith(prefix)), key);
  }
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

test("central quota template omissions fail the checklist without claiming runtime activation", () => {
  const input = currentRepositoryInput();
  assert.equal(TOUCHLINE_CENTRAL_QUOTA_ENVIRONMENT_NAMES.length, 9);
  for (const name of TOUCHLINE_CENTRAL_QUOTA_ENVIRONMENT_NAMES) {
    const result = evaluateTouchlineReleaseReadiness({ ...input,
      envTemplate: input.envTemplate.replace(`${name}=`, `REMOVED_${name}=`),
    });
    assert.equal(result.status, "LOCAL_CONTRACT_INVALID", name);
    assert.deepEqual(result.environment.centralQuota.missingTemplateNames, [name]);
    assert.equal(result.environment.centralQuota.runtimeStatus, "NOT_INSPECTED_NOT_ACTIVATION_APPROVAL");
  }
  const result = evaluateTouchlineReleaseReadiness(input);
  assert.match(result.environment.centralQuota.activationGate, /does not disable user login/);
  assert.match(result.environment.centralQuota.separation, /Never place operator recovery credentials/);
  assert.ok(result.environment.centralQuota.names.every(name => !name.startsWith("NEXT_PUBLIC_")));
});
