import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TOUCHLINE_SQUAD_RULES,
  resolveTouchlineSquadJourney,
} from "../lib/touchlineArena/squad-rules.ts";

const stagePath = new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url);
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

test("the Market owns one canonical XI editor with coach-first setup", async () => {
  const source = await readFile(stagePath, "utf8");
  assert.match(source, /workflowCopy\.startingXI/);
  const { getTouchlineFantasyMarketWorkflowCopy } = await import("../lib/touchlineFantasy/market-workflow-i18n.ts");
  assert.deepEqual([getTouchlineFantasyMarketWorkflowCopy("pt-BR").startingXI, getTouchlineFantasyMarketWorkflowCopy("en-GB").startingXI], ["ELENCO TITULAR", "STARTING XI"]);
  assert.match(source, /TouchlinePitchSurface/);
  assert.match(source, /snapshot\?\.formationRegistry\[formationCode\]/);
  assert.match(source, /const selectedCards = geometry\?\.slots\.map/);
  assert.match(source, /data-market-starting-xi="true"/);
  assert.doesNotMatch(source, /Banco da partida|Matchday bench/);
  assert.doesNotMatch(source, /className=\{styles\.bench\}/);
  assert.doesNotMatch(source, /className=\{styles\.remaining\}/);
  assert.match(source, /data-my-club-setup="coach"/);
  assert.match(source, /data-my-club-setup="formation"/);
  assert.match(source, /\{selectedCount\}\/11/);
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
  assert.match(source, /data-market-technical-area="true"/);
  const coachCardStyles = await readFile(new URL("../components/touchline/cards/TouchlineCoachCard.module.css", import.meta.url), "utf8");
  assert.match(coachCardStyles, /width: clamp\(9px, 16cqw, 28px\)/);
  const pitch = source.match(/<TouchlinePitchSurface className=\{styles\.myClubTacticalPitch\}[\s\S]*?<\/TouchlinePitchSurface>/)?.[0] ?? "";
  assert.match(pitch, /selectedCards\.map/);
  assert.doesNotMatch(pitch, /FantasyCoachZoom|TouchlineCoachCardZoom/);
  assert.match(source, /<FantasyCoachZoom entry=\{selectedCoach\}/);
  assert.match(source, /profileHref=\{`\/touchline-coaches\//);
  assert.doesNotMatch(source, /starters\.push\([^)]*coach/i);
  assert.doesNotMatch(source, /role:\s*["']coach["']/);
});



test("published catalogue candidates remain available without rendering a Market bench", async () => {
  const stage = await readFile(stagePath, "utf8");
  assert.match(stage, /snapshot\?\.catalogue \?\? \[\]/);
  assert.match(stage, /browseCards\.map\(\(card\)/);
  assert.match(stage, /const inLineup = selections\.some/);
  assert.match(stage, /marketPage \? Boolean\(activeSlot\) && slotAccepts\(activeSlot, card\)/);
  assert.match(stage, /!editable \? <span[\s\S]*?: inLineup \? <span/);
  assert.doesNotMatch(stage, /className=\{styles\.bench\}|className=\{styles\.remaining\}/);
});

test("canonical XI cards retain the shared expanded card and suppress duplicate actions", async () => {
  const stage = await readFile(stagePath, "utf8");
  const card = await readFile(new URL("../components/touchline/fantasy/TouchlineGameweekCard.tsx", import.meta.url), "utf8");
  assert.match(stage, /className=\{styles\.myClubTacticalSlot\}[\s\S]*?<TouchlineGameweekCard card=\{card\}/);
  assert.match(card, /<TouchlineCardZoom/);
  assert.match(card, /showCardActions=\{false\}/);
  assert.match(card, /showProfileAction=\{false\}/);
  assert.match(card, /expandedContent=\{<TouchlineEliteExactCard/);
  assert.match(card, /canonicalPlayerId: card\.editorialCard \? exact\.canonicalPlayerId : null/);
  assert.doesNotMatch(stage, /className=\{styles\.dugoutSeat\}/);
});

test("formation vacancies and replacements use the inline list with eligible-only controls", async () => {
  const stage = await readFile(stagePath, "utf8");

  assert.doesNotMatch(stage, /TouchlinePositionPicker|positionPickerOpen|aria-haspopup/);
  assert.match(stage, /id="my-club-player-selection" tabIndex=\{-1\} data-open="true" data-inline-selection="true"/);
  assert.match(stage, /touchlineFantasySlotAcceptsPlayer\(activeSlot, player\)/);
  assert.match(stage, /replaceTouchlineFantasyPlayerAtSlot/);
  assert.match(stage, /const editable = snapshot\?\.entitlementActive === true && activeGameweek\?\.state === "MARKET_OPEN" && !deadlineReached/);
  assert.match(stage, /if \(!editable \|\| !geometry\) return false/);
  assert.match(stage, /if \(!addPlayer\(card\)\) return;[\s\S]*scrollToLineupSection\("my-club-xi-pitch"\)/);
});
