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
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: false, starterCount: 0, benchCount: 0, contractedCount: 0 }).currentStep, "coach");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, starterCount: 10, benchCount: 0, contractedCount: 10 }).currentStep, "starting-xi");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, starterCount: 11, benchCount: 8, contractedCount: 19 }).currentStep, "bench");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, starterCount: 11, benchCount: 9, contractedCount: 34 }).currentStep, "full-squad");
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, starterCount: 11, benchCount: 9, contractedCount: 35 }).reviewAvailable, true);
  assert.equal(resolveTouchlineSquadJourney({ hasCoach: true, starterCount: 12, benchCount: 10, contractedCount: 36 }).reviewAvailable, true);
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
});

test("successful contracts fill eligible Starting XI slots before bench and preserve canonical pricing", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  assert.match(source, /function placeNewContractsInSquad\(/);
  assert.match(source, /roleCount < roleCapacity/);
  assert.match(source, /nextPlayers\.length < TOUCHLINE_SQUAD_RULES\.starters/);
  assert.match(source, /const placement = placeNewContractsInSquad\(/);
  assert.match(source, /persistArenaRoster\(placement\.players, placement\.bench\)/);
  assert.match(source, /resolveTouchlineCommercialCardPrice/);
});

test("coach remains a dedicated entity outside every player slot", async () => {
  const arenaSource = await readFile(arenaClientPath, "utf8");
  const source = await readFile(stagePath, "utf8");
  assert.match(arenaSource, /MERCADO · PASSO 1 DE 6/);
  assert.match(source, /className=\{styles\.technicalArea\}/);
  assert.doesNotMatch(source, /starters\.push\([^)]*coach/i);
  assert.doesNotMatch(source, /role:\s*["']coach["']/);
});

test("matchday bench and remaining squad are disjoint views of the same authoritative roster", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  assert.match(source, /const matchdayBenchIds = new Set\(matchdayBenchPlayers\.map/);
  assert.match(source, /benchPlayers\.filter\(\(bench\) => !matchdayBenchIds\.has\(bench\.id\)\)/);
});
