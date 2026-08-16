import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

test("the in-Arena Quick Sub UI uses the no-reentry session projection", () => {
  assert.match(arenaSource, /createTouchlineQuickSubstitutionSession/);
  assert.match(arenaSource, /applyTouchlineQuickSubstitutionSession/);
  assert.match(arenaSource, /restoreTouchlineQuickSubstitutionSession/);
  assert.match(arenaSource, /quickSubstitutionSessionStorageKey/);
  assert.match(arenaSource, /quickSubstitutionAvailableBenchPlayers/);
  assert.match(arenaSource, /quickSubstitutionSubstitutedOutPlayers/);
});

test("Quick Substitution replaces the score rail with nine cards and a central coach", () => {
  assert.match(arenaSource, /data-quick-substitution-rail="true"/);
  assert.match(arenaSource, /quickSubstitutionInteractiveBench\.map/);
  assert.match(arenaSource, /arena-quick-sub-coach/);
  assert.match(arenaSource, /grid-template-columns:\s*repeat\(10, minmax\(0, 1fr\)\)/);
  assert.match(arenaSource, /club-symbol-carousel-empty/);
  assert.match(arenaSource, /arena-score-rail-empty/);
  assert.match(arenaSource, /is-substitution-eligible/);
});

test("in-Arena Quick Sub opens without reloading the Arena document", () => {
  assert.match(
    arenaSource,
    /href=\{touchlineArenaPanelHref\("bench", siteLanguage\)\}[\s\S]{0,360}?event\.preventDefault\(\);[\s\S]{0,120}?openArenaPanel\("bench"\)/,
  );
});

test("a confirmed Quick Sub returns to the score rail without reloading the document", () => {
  const sessionBranchStart = arenaSource.indexOf("if (isQuickSubstitutionSessionActive && quickSubstitutionSession && quickSubstitutionSessionSource)");
  const legacySwapStart = arenaSource.indexOf("const incomingPlayer = benchOptionToArenaPlayer", sessionBranchStart);
  const sessionBranch = arenaSource.slice(sessionBranchStart, legacySwapStart);

  assert.match(sessionBranch, /setQuickSubstitutionSession\(result\.state\)/);
  assert.match(sessionBranch, /touchlineArenaPanelUrl\(window\.location\.href, null\)/);
  assert.match(sessionBranch, /setActiveArenaPanel\(null\)/);
  assert.doesNotMatch(sessionBranch, /setSpotlightPlayerId\(/);
  assert.doesNotMatch(sessionBranch, /window\.location\.(assign|replace|reload)/);
});

test("the score rail does not duplicate or animate a single verified fixture", () => {
  assert.match(arenaSource, /visibleClubMatches\.length > 1\s*\? \[\.\.\.visibleClubMatches, \.\.\.visibleClubMatches\]\s*:\s*visibleClubMatches/);
  assert.match(arenaSource, /visibleClubMatches\.length <= 1 \? " is-static" : ""/);
  assert.match(arenaSource, /\.club-symbol-stream\.is-static\s*\{[\s\S]*?animation:\s*none/);
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

test("opening in-Arena Quick Sub or a fixture matchday view cannot auto-save a derived lineup", () => {
  const persistenceEffectStart = arenaSource.indexOf("useEffect(() => {\n    if (!hasLoadedSavedLineup || !hasLoadedClubOwnerRoster || isDemoLineup || !arenaPersistencePrincipal) return;");
  const nextEffectStart = arenaSource.indexOf("\n  useEffect(() => {", persistenceEffectStart + 1);
  const persistenceEffect = arenaSource.slice(persistenceEffectStart, nextEffectStart);
  const guardIndex = persistenceEffect.indexOf('isQuickSubstitutionOpen || isArenaMatchdayViewActive || players.length === 0');
  const localSaveIndex = persistenceEffect.indexOf("saveLineup(players");
  const remotePutIndex = persistenceEffect.indexOf('fetch("/api/touchline-arena/state"');

  assert.ok(persistenceEffectStart >= 0);
  assert.ok(nextEffectStart > persistenceEffectStart);
  assert.ok(guardIndex >= 0);
  assert.ok(localSaveIndex > guardIndex);
  assert.ok(remotePutIndex > guardIndex);
});

test("substituted-out players remain visible but outside the active bench", () => {
  assert.match(arenaSource, /data-substitution-status="substituted-out"/);
  assert.match(arenaSource, /arena-quick-sub-out/);
  assert.match(arenaSource, /Não podem voltar nesta partida/);
  assert.match(arenaSource, /Cannot return in this match/);
  assert.match(arenaSource, /quickSubstitutionSubstitutedOutPlayers\.length/);
});

test("Quick Sub keeps pinch zoom available unless a card is explicitly being edited", () => {
  assert.match(arenaSource, /\.arena-field-player\s*\{[\s\S]*?touch-action:\s*manipulation/);
  assert.match(arenaSource, /\.arena-field-player\[data-editing="true"\]\s*\{[\s\S]*?touch-action:\s*none/);
});

test("Quick Sub keeps the pitch visible and gives tier cards a shape-following neon hover", () => {
  assert.match(arenaSource, /background: linear-gradient\(180deg, rgba\(2,10,9,\.68\), rgba\(1,5,8,\.78\)\)/);
  assert.match(arenaSource, /backdrop-filter: blur\(6px\)/);
  assert.match(arenaSource, /@keyframes arena-tier-card-neon-pulse/);
  assert.match(arenaSource, /drop-shadow\(0 10px 17px rgb\(var\(--arena-tier-neon-rgb\) \/ \.72\)\)/);
  assert.match(arenaSource, /\.arena-quick-sub-card:hover \.arena-quick-sub-card-art/);
  assert.doesNotMatch(
    arenaSource.slice(arenaSource.indexOf(".arena-quick-sub-card:hover,"), arenaSource.indexOf(".arena-quick-sub-card.is-locked")),
    /0 0 20px/,
  );
});

test("the historical standalone match screen cannot offer contract release controls", () => {
  const releaseControlsStart = arenaSource.indexOf('className="bench-release-target-contract"');
  const enclosingBranch = arenaSource.slice(Math.max(0, releaseControlsStart - 900), releaseControlsStart + 2_200);
  assert.ok(releaseControlsStart >= 0);
  assert.match(enclosingBranch, /\{standalonePanel !== "bench" \? \(/);
  assert.match(enclosingBranch, /replaceAndReleaseSelectedContract/);
  assert.match(enclosingBranch, /releaseSelectedBenchContract/);
});
