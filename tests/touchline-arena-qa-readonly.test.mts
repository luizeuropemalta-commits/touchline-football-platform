import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isTouchlineQaReadOnlyMutationBlocked } from "../lib/touchlineArena/qa-canonical-persona.ts";

const arenaPageSource = fs.readFileSync(new URL("../app/arena/page.tsx", import.meta.url), "utf8");
const arenaClientSource = fs.readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

test("QA read-only entry is restricted to the stable QA host and cannot enable the editor", () => {
  assert.match(arenaPageSource, /qaReadOnly\?: string \| string\[\];/);
  assert.match(
    arenaPageSource,
    /const initialQaReadOnly = firstValue\(params\.qaReadOnly\) === "1"\s*&& requestHost === TOUCHLINE_QA_HOSTNAME;/,
  );
  assert.match(
    arenaPageSource,
    /const initialQaVisualEditor = firstValue\(params\.qaEditor\) === "1"\s*&& requestHost === TOUCHLINE_QA_HOSTNAME\s*&& !initialQaReadOnly;/,
  );
  assert.match(arenaPageSource, /initialQaReadOnly=\{initialQaReadOnly\}/);
});

test("QA read-only mutation policy fails closed", () => {
  assert.equal(isTouchlineQaReadOnlyMutationBlocked(true), true);
  assert.equal(isTouchlineQaReadOnlyMutationBlocked(false), false);
});

test("QA read-only Arena renders the authenticated state without saving or opening edit controls", () => {
  assert.match(arenaClientSource, /initialQaReadOnly\?: boolean;/);
  assert.match(
    arenaClientSource,
    /const isQaReadOnly = initialQaReadOnly\s*&& \(typeof window === "undefined" \|\| isStableQaArenaHost\);/,
  );
  assert.match(
    arenaClientSource,
    /const isQaVisualEditor = initialQaVisualEditor\s*&& !isQaReadOnly/,
  );
  assert.match(
    arenaClientSource,
    /!initialQaReadOnly && \(initialPanel === "formation" \|\| initialQaVisualEditor\)/,
  );
  assert.match(
    arenaClientSource,
    /if \(!hasLoadedSavedLineup \|\| !hasLoadedClubOwnerRoster \|\| isDemoLineup \|\| !arenaPersistencePrincipal \|\| isQaReadOnly\) return;/,
  );
  assert.match(
    arenaClientSource,
    /if \(!isQaReadOnly\) \{\s*writeBrowserStorage\("localStorage", formationStorageKey, effectiveFormationKey\);\s*writeBrowserStorage\("localStorage", lineupStorageKey, savedLineup \?\? "\[\]"\);\s*\}/,
  );
  assert.match(arenaClientSource, /data-qa-read-only=\{isQaReadOnly \? "true" : undefined\}/);
  assert.match(
    arenaClientSource,
    /inert=\{isArenaFunctionalReady && !isQaReadOnly \? undefined : true\}/,
  );
});

test("QA read-only has one fail-closed boundary before every Arena mutation entry point", () => {
  assert.match(
    arenaClientSource,
    /function blockQaReadOnlyMutation\(\) \{\s*if \(!isTouchlineQaReadOnlyMutationBlocked\(isQaReadOnly\)\) return false;\s*setSaveStatus\("QA read-only validation does not allow changes"\);\s*return true;/,
  );

  const guardedMutators = [
    "handleManualSave",
    "writeQaVisualDraft",
    "saveQaVisualArenaStandard",
    "handleSaveFormationLock",
    "handleUnlockCurrentCamera",
    "changeFormation",
    "updateSelectedPlayerPosition",
    "updateSelectedPlayerSize",
    "nudgeSelectedPlayer",
    "prepareBenchReplacement",
    "requestQuickSubstitutionConfirmation",
    "handleBenchDrop",
    "moveFieldPlayerFromPointer",
    "selectOfficialArenaCoach",
    "endOfficialArenaCoachContract",
    "confirmMarketFormation",
    "assignMarketFormationPlayer",
    "toggleLineupEditor",
    "openArenaPanel",
    "confirmBenchSwap",
    "toggleBuilderPlayerInCart",
    "checkoutBuilderCart",
    "releaseAuthoritativeContract",
    "releaseMarketPositionContract",
    "releaseSelectedBenchContract",
    "replaceAndReleaseSelectedContract",
  ];

  for (const name of guardedMutators) {
    assert.match(
      arenaClientSource,
      new RegExp(`(?:async )?function ${name}[\\s\\S]{0,300}?\\{\\s*if \\(blockQaReadOnlyMutation\\(\\)\\) return`),
      `${name} must stop at the QA read-only boundary`,
    );
  }
  assert.match(
    arenaClientSource,
    /async function releaseAuthoritativeContract[\s\S]{0,300}?if \(blockQaReadOnlyMutation\(\)\) return false;/,
  );
});

test("QA read-only avoids browser persistence during authenticated state hydration", () => {
  assert.match(
    arenaClientSource,
    /if \(isAuthoritativeRoster && !isQaReadOnly\) \{\s*writeBrowserClubOwnerRoster/,
  );
  assert.match(
    arenaClientSource,
    /if \(!isQaReadOnly\) writeBrowserClubOwnerRoster\(roster\.cards, \{ principal: arenaPersistencePrincipal \}\);/,
  );
  assert.match(
    arenaClientSource,
    /if \(!isQaReadOnly\) writeBrowserStorage\("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1"\);/,
  );
  assert.match(
    arenaClientSource,
    /QA read-only is an observation surface\.[\s\S]{0,340}?if \(isQaReadOnly\) \{\s*return;\s*\}[\s\S]{0,220}?readBrowserStorage\("sessionStorage", quickSubstitutionSessionStorageKey\)/,
  );
  assert.match(
    arenaClientSource,
    /useEffect\(\(\) => \{\s*if \(isQaReadOnly\) return;\s*if \(!quickSubstitutionSession \|\| !quickSubstitutionSessionStorageKey \|\| !quickSubstitutionSessionSource\) return;[\s\S]{0,260}?writeBrowserStorage\("sessionStorage", quickSubstitutionSessionStorageKey, JSON\.stringify\(quickSubstitutionSession\)\)/,
  );
});
