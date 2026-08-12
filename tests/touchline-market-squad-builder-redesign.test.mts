import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TOUCHLINE_SQUAD_RULES,
  resolveTouchlineSquadJourney,
} from "../lib/touchlineArena/squad-rules.ts";

const arenaClientPath = new URL("../app/arena/ArenaClient.tsx", import.meta.url);
const stagePath = new URL("../components/touchline/market/TouchlineSquadBuilderStage.tsx", import.meta.url);

test("canonical TouchLine England squad rules remain in one server-independent read model", () => {
  assert.deepEqual(TOUCHLINE_SQUAD_RULES, {
    contracted: 35,
    matchday: 20,
    starters: 11,
    bench: 9,
    reserveVault: 15,
    goalkeepers: 3,
    matchdayBenchGoalkeepers: 1,
    substitutions: 5,
  });
});

test("the guided journey unlocks coach, Starting XI, bench and full squad in order", () => {
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: false, hasFormation: false, starterCount: 0, benchCount: 0, contractedCount: 0 }).currentStep, "coach");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, hasFormation: false, starterCount: 0, benchCount: 0, contractedCount: 0 }).currentStep, "formation");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, hasFormation: true, starterCount: 10, benchCount: 0, contractedCount: 10 }).currentStep, "starting-xi");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, hasFormation: true, starterCount: 11, benchCount: 8, contractedCount: 19 }).currentStep, "bench");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, hasFormation: true, starterCount: 11, benchCount: 9, contractedCount: 34 }).currentStep, "full-squad");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, hasFormation: true, starterCount: 11, benchCount: 9, contractedCount: 35 }).reviewAvailable, true);
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, hasFormation: true, starterCount: 12, benchCount: 10, contractedCount: 36 }).reviewAvailable, true);
});

test("the Market owns one premium squad-building stage with distinct player groups", async () => {
  const source = await readFile(stagePath, "utf8");
  assert.match(source, /Monte seu time TouchLine/);
  assert.match(source, /TouchlinePitchSurface/);
  assert.match(source, /formationLines\.slice\(1, -1\)\.reduce/);
  assert.match(source, /Banco da partida/);
  assert.match(source, /Elenco restante/);
  assert.match(source, /Array\.from\(\{ length: TOUCHLINE_SQUAD_RULES\.bench \}/);
  assert.match(source, /aria-current=\{index === currentStepIndex \? "step"/);
  assert.match(source, /aria-label=\{portuguese \? "Área técnica" : "Technical area"\}/);
  assert.doesNotMatch(source, /Organizar elenco/);
});

test("the Market keeps account capacity first and guides a field slot directly to player selection", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  const bankIndex = source.indexOf('className="team-builder-bank"');
  const stageIndex = source.indexOf("<TouchlineSquadBuilderStage");
  const boardIndex = source.indexOf('className="team-builder-board" ref={marketSelectionRef}');

  assert.ok(bankIndex > 0);
  assert.ok(stageIndex > bankIndex);
  assert.ok(boardIndex > stageIndex);
  assert.match(source, /marketSelectionRef\.current\?\.scrollIntoView/);
  assert.match(source, /behavior: reduceMotion \? "auto" : "smooth"/);
  assert.match(source, /scroll-margin-top: 94px/);
  assert.match(source, /@media \(min-width: 1181px\) \{[\s\S]*?team-builder-player-list \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(source, /@media \(max-width: 760px\) \{[\s\S]*?grid-template-areas:[\s\S]*?"clubs"[\s\S]*?"roster"[\s\S]*?"preview"/);
  assert.doesNotMatch(source, /<a className=\{activeArenaPanel === "market"/);
});

test("the Market Card View stays static while unrelated live data updates", async () => {
  const source = await readFile(arenaClientPath, "utf8");

  assert.match(source, /const StableMarketPreviewCard = memo\(TouchlineEliteExactCard\)/);
  assert.match(source, /builderPlayerToPreviewCard\(selectedBuilderPlayer, \{ allowInventoryVisualPreview: true \}\)/);
  assert.match(source, /const selectedBuilderPreviewCard = useMemo\(/);
  assert.match(source, /<StableMarketPreviewCard[\s\S]*?rankingMode="preview"[\s\S]*?subscribeToRanking=\{false\}[\s\S]*?enableInteractiveNeon=\{false\}[\s\S]*?allowVisualInventoryPreview/);
  assert.match(source, /\.arena-action-panel-market \.team-builder-preview-card > \.touchline-card-surface\[data-card-motion="true"\] \{[\s\S]*?transition: none !important;[\s\S]*?will-change: auto !important;[\s\S]*?filter: none !important;/);
  assert.match(source, /\.arena-action-panel-market \.team-builder-preview-status i \{[\s\S]*?animation: none;/);
});

test("successful contracts fill eligible Starting XI slots before bench and preserve canonical pricing", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  assert.match(source, /function placeNewContractsInSquad\(/);
  assert.match(source, /roleCount < roleCapacity/);
  assert.match(source, /nextPlayers\.length < TOUCHLINE_SQUAD_RULES\.starters/);
  assert.match(source, /const placement = placeNewContractsInSquad\(/);
  assert.match(source, /persistArenaRoster\(placement\.players, placement\.bench\)/);
  assert.match(source, /function builderPlayerRetailPriceTc\(/);
  assert.match(source, /parseTouchlinePublicEditorialCardPresentation/);
});

test("coach remains a dedicated entity outside every player slot", async () => {
  const arenaSource = await readFile(arenaClientPath, "utf8");
  const source = await readFile(stagePath, "utf8");
  assert.match(arenaSource, /MERCADO · PASSO 1 DE 10/);
  assert.match(arenaSource, /TOUCHLINE_MARKET_POSITION_SEQUENCE/);
  assert.match(arenaSource, /Substituir contrato/);
  assert.match(arenaSource, /contrato encerrado sem reembolso/);
  assert.match(source, /className=\{styles\.technicalArea\}/);
  assert.doesNotMatch(source, /starters\.push\([^)]*coach/i);
  assert.doesNotMatch(source, /role:\s*["']coach["']/);
});

test("matchday bench and remaining squad are disjoint views of the same authoritative roster", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  assert.match(source, /const matchdayBenchIds = useMemo\(\(\) => new Set\(matchdayBenchPlayers\.map/);
  assert.match(source, /benchPlayers\.filter\(\(bench\) => !matchdayBenchIds\.has\(bench\.id\)\)/);
});
