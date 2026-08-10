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

test("opening standalone Quick Sub cannot auto-save an empty or match-session lineup", () => {
  const persistenceEffectStart = arenaSource.indexOf("useEffect(() => {\n    if (!hasLoadedSavedLineup || !hasLoadedClubOwnerRoster || isDemoLineup || !arenaPersistencePrincipal) return;");
  const nextEffectStart = arenaSource.indexOf("\n  useEffect(() => {", persistenceEffectStart + 1);
  const persistenceEffect = arenaSource.slice(persistenceEffectStart, nextEffectStart);
  const guardIndex = persistenceEffect.indexOf('standalonePanel === "bench" || players.length === 0');
  const localSaveIndex = persistenceEffect.indexOf("saveLineup(players");
  const remotePutIndex = persistenceEffect.indexOf('fetch("/api/touchline-arena/state"');

  assert.ok(persistenceEffectStart >= 0);
  assert.ok(nextEffectStart > persistenceEffectStart);
  assert.ok(guardIndex >= 0);
  assert.ok(localSaveIndex > guardIndex);
  assert.ok(remotePutIndex > guardIndex);
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
