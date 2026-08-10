import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

test("the standalone Quick Sub UI uses the no-reentry session projection", () => {
  assert.match(arenaSource, /createTouchlineQuickSubstitutionSession/);
  assert.match(arenaSource, /applyTouchlineQuickSubstitutionSession/);
  assert.match(arenaSource, /isTouchlineQuickSubstitutionSessionState/);
  assert.match(arenaSource, /quickSubstitutionSessionStorageKey/);
  assert.match(arenaSource, /quickSubstitutionAvailableBenchPlayers/);
  assert.match(arenaSource, /quickSubstitutionSubstitutedOutPlayers/);
});

test("a standalone match substitution never persists or swaps the saved roster", () => {
  const sessionBranchStart = arenaSource.indexOf("if (isQuickSubstitutionSessionActive && quickSubstitutionSession && quickSubstitutionSessionSource)");
  const legacySwapStart = arenaSource.indexOf("const incomingPlayer = benchOptionToArenaPlayer", sessionBranchStart);
  assert.ok(sessionBranchStart >= 0);
  assert.ok(legacySwapStart > sessionBranchStart);

  const sessionBranch = arenaSource.slice(sessionBranchStart, legacySwapStart);
  assert.match(sessionBranch, /setQuickSubstitutionSession\(result\.state\)/);
  assert.match(sessionBranch, /return;/);
  assert.doesNotMatch(sessionBranch, /setPlayers\(|setBenchPlayers\(|persistArenaRoster\(/);
});

test("substituted-out players are visible, locked, and outside the available bench", () => {
  assert.match(arenaSource, /data-substitution-status="substituted-out"/);
  assert.match(arenaSource, /Jogadores que saíram da partida/);
  assert.match(arenaSource, /não pode voltar nesta partida/);
  assert.match(arenaSource, /quick-substitution-substituted-out/);
  assert.match(arenaSource, /pointer-events:\s*none/);
});

test("the standalone match screen cannot offer contract release controls", () => {
  const releaseControlsStart = arenaSource.indexOf('className="bench-release-target-contract"');
  const enclosingBranch = arenaSource.slice(Math.max(0, releaseControlsStart - 900), releaseControlsStart + 2_200);
  assert.ok(releaseControlsStart >= 0);
  assert.match(enclosingBranch, /\{standalonePanel !== "bench" \? \(/);
  assert.match(enclosingBranch, /replaceAndReleaseSelectedContract/);
  assert.match(enclosingBranch, /releaseSelectedBenchContract/);
});
