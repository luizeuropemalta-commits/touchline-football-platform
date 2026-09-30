import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TOUCHLINE_SQUAD_RULES,
  resolveTouchlineSquadJourney,
} from "../lib/touchlineArena/squad-rules.ts";

const stagePath = new URL("../components/touchline/market/TouchlineSquadBuilderStage.tsx", import.meta.url);
const marketI18nPath = new URL("../lib/touchlineArena/market-i18n.ts", import.meta.url);

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

test("the canonical squad model still resolves the complete internal journey", () => {
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
  assert.match(source, /touchlineCanonicalFormationSlots\(formation, geometryRegistry\)/);
  assert.doesNotMatch(source, /Banco da partida|Matchday bench|Substitutes|Reservas/);
  assert.doesNotMatch(source, /className=\{styles\.bench\}/);
  assert.doesNotMatch(source, /className=\{styles\.remaining\}/);
  assert.match(source, /aria-current=\{index === currentStepIndex \? "step"/);
  assert.match(source, /Área técnica e preparação do elenco/);
  assert.match(source, /Defina a formação e contrate os seus 11 titulares/);
  assert.match(source, /className=\{styles\.coachBrief\}/);
  assert.doesNotMatch(source, /Complete the Starting XI/);
  assert.doesNotMatch(source, /Confirm club and enter Arena/);
  assert.doesNotMatch(source, /key: "arena"/);
  assert.doesNotMatch(source, /Enter Arena/);
  assert.doesNotMatch(source, /Organizar elenco/);
});

test("the account header exposes four canonical metrics without fake capacity or TC labels", async () => {
  const marketI18n = await readFile(marketI18nPath, "utf8");
  assert.match(marketI18n, /touchlineCredits: "TouchLine Credits"/);
  assert.match(marketI18n, /squadValue: "Squad card value"/);
  assert.match(marketI18n, /clubsRepresented: "Clubs represented"/);
  assert.doesNotMatch(marketI18n, /Signing balance|Contract slots|Club players/);
});









test("coach remains a dedicated entity outside every player slot", async () => {
  const source = await readFile(stagePath, "utf8");
  const styles = await readFile(new URL("../components/touchline/market/TouchlineSquadBuilderStage.module.css", import.meta.url), "utf8");
  assert.match(source, /className=\{styles\.technicalArea\}/);
  const coachCardStyles = await readFile(new URL("../components/touchline/cards/TouchlineCoachCard.module.css", import.meta.url), "utf8");
  assert.match(styles, /\.coachCard \{ display: grid; place-items: center; width: 78px; min-height: 112px;/);
  assert.match(styles, /\.technicalArea \{[\s\S]*?width: var\(--market-technical-width\);/);
  assert.match(coachCardStyles, /width: clamp\(9px, 16cqw, 28px\)/);
  assert.match(styles, /\.pitch \{[\s\S]*?min-height: 0;/);
  assert.match(source, /coachProfileHref/);
  assert.doesNotMatch(source, /starters\.push\([^)]*coach/i);
  assert.doesNotMatch(source, /role:\s*["']coach["']/);
});



test("owned non-starters remain eligible selection inputs without rendering a Market bench", async () => {
  const stage = await readFile(stagePath, "utf8");
  assert.match(stage, /export type TouchlineSquadBuilderBenchPlayer = \{[\s\S]*?card: TouchlineEliteExactPlayer;/);
  assert.match(stage, /const squadCandidates = useMemo\([\s\S]*?\[\.\.\.bench, \.\.\.remainingSquad\]/);
  assert.match(stage, /squadCandidates\.filter/);
  assert.doesNotMatch(stage, /className=\{styles\.bench\}|className=\{styles\.remaining\}/);
});

test("owned squad cards remain visibly rendered in the authenticated Market builder", async () => {
  const stage = await readFile(stagePath, "utf8");
  const renderedCards = stage.match(/<TouchlineEliteExactCard[\s\S]*?\/>/g) ?? [];
  const sharedZoomUsages = stage.match(/<SquadPlayerCardZoom/g) ?? [];

  assert.equal(sharedZoomUsages.length, 1);
  assert.equal(renderedCards.length, 3);
  assert.match(stage, /function SquadPlayerCardZoom/);
  assert.match(stage, /allowVisualInventoryPreview/);
  assert.match(stage, /showCardActions=\{false\}/);
  assert.match(stage, /showProfileAction=\{false\}/);
  assert.match(stage, /expandedContent=/);
  assert.match(stage, /className=\{styles\.playerSlot\}[\s\S]*?<SquadPlayerCardZoom card=\{player\.card\}/);
  assert.doesNotMatch(stage, /className=\{styles\.dugoutSeat\}/);
});

test("formation vacancies and replacements stay inside the pitch with eligible-only controls", async () => {
  const [stage, styles] = await Promise.all([
    readFile(stagePath, "utf8"),
    readFile(new URL("../components/touchline/market/TouchlineSquadBuilderStage.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(stage, /role="dialog" aria-modal="false"/);
  assert.match(stage, /Cards eligible for the selected position on the pitch/);
  assert.match(stage, /onAssignPlayer\(\{/);
  assert.match(stage, /window\.addEventListener\("keydown", closePicker\)/);
  assert.match(styles, /\.slotPicker \{/);
  assert.match(styles, /\.positionPrompt \{/);
  assert.match(styles, /\.formationStatus \{/);
  assert.doesNotMatch(stage, /Formation complete|Formação completa/);
});
