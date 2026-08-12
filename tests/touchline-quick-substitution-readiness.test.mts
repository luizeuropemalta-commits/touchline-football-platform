import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveTouchlineQuickSubstitutionReadiness } from "../lib/touchlineArena/quick-substitution-readiness.ts";

const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const selfLoadingSource = readFileSync(
  new URL("../app/club-owner/me/substitution/loading.tsx", import.meta.url),
  "utf8",
);
const dynamicLoadingSource = readFileSync(
  new URL("../app/club-owner/[owner]/substitution/loading.tsx", import.meta.url),
  "utf8",
);
const fixtureSource = readFileSync(
  new URL("../app/visual-qa/quick-substitution-readiness/page.tsx", import.meta.url),
  "utf8",
);

test("Quick Substitution stays loading until both persisted reads have settled", () => {
  assert.deepEqual(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: false,
      hasLoadedClubOwnerRoster: true,
      starterCount: 11,
      benchCount: 9,
    }),
    {
      state: "loading",
      starterCount: 11,
      benchCount: 9,
      missingStarters: 0,
      missingBench: 0,
    },
  );
});

test("Quick Substitution fails closed for an incomplete or malformed matchday", () => {
  assert.deepEqual(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: true,
      hasLoadedClubOwnerRoster: true,
      starterCount: 0,
      benchCount: 0,
    }),
    {
      state: "setup-required",
      starterCount: 0,
      benchCount: 0,
      missingStarters: 11,
      missingBench: 9,
    },
  );

  assert.equal(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: true,
      hasLoadedClubOwnerRoster: true,
      starterCount: 12,
      benchCount: 10,
    }).state,
    "setup-required",
  );
});

test("Quick Substitution opens only for exactly eleven starters and nine substitutes", () => {
  assert.deepEqual(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: true,
      hasLoadedClubOwnerRoster: true,
      starterCount: 11,
      benchCount: 9,
    }),
    {
      state: "ready",
      starterCount: 11,
      benchCount: 9,
      missingStarters: 0,
      missingBench: 0,
    },
  );
});

test("the standalone panel renders an honest readiness state instead of an empty substitution board", () => {
  assert.match(arenaSource, /resolveTouchlineQuickSubstitutionReadiness/);
  assert.match(arenaSource, /data-quick-substitution-readiness=/);
  assert.match(arenaSource, /Nenhum jogador é criado automaticamente/);
  assert.match(arenaSource, /href=\{`\/market-transfer\?lang=\$\{encodeURIComponent\(siteLanguage\)\}`\}/);
  assert.match(arenaSource, /standaloneQuickSubstitutionSessionState && standaloneQuickSubstitutionSessionState !== "ready"/);
});

test("the authenticated self route skips the opaque redirect handoff and both substitution routes have a local loader", () => {
  assert.match(proxySource, /clubOwnerCanonicalSubstitutionRedirect/);
  assert.match(proxySource, /pathname === "\/club-owner\/me\/substitution"/);
  assert.match(selfLoadingSource, /ClubOwnerSubstitutionLoading/);
  assert.match(dynamicLoadingSource, /ClubOwnerSubstitutionLoading/);
});

test("the local Quick Sub visual fixture uses the actual in-Arena rail with deterministic demo data", () => {
  assert.match(fixtureSource, /data-quick-substitution-readiness-fixture=\{isSetupScenario \? "setup" : "ready"\}/);
  assert.match(fixtureSource, /initialPanel="bench"/);
  assert.match(fixtureSource, /initialDemoLineup/);
  assert.match(fixtureSource, /initialEmptyLineup/);
  assert.doesNotMatch(fixtureSource, /fetch\(|createClient\(|createAdminClient\(/);
});
