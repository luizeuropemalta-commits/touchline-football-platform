import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TOUCHLINE_SQUAD_RULES,
  resolveTouchlineSquadJourney,
} from "../lib/touchlineArena/squad-rules.ts";

const arenaClientPath = new URL("../app/arena/ArenaClient.tsx", import.meta.url);
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
  assert.match(source, /touchlineCanonicalFormationSlots\(formation\)/);
  assert.match(source, /Banco da partida/);
  assert.match(source, /Elenco restante/);
  assert.match(source, /Array\.from\(\{ length: TOUCHLINE_SQUAD_RULES\.bench \}/);
  assert.match(source, /aria-current=\{index === currentStepIndex \? "step"/);
  assert.match(source, /Área técnica e preparação do elenco/);
  assert.match(source, /Defina a formação, contrate atletas e leve o grupo completo para a Arena/);
  assert.match(source, /className=\{styles\.coachBrief\}/);
  assert.doesNotMatch(source, /Complete the Starting XI/);
  assert.doesNotMatch(source, /Confirm club and enter Arena/);
  assert.doesNotMatch(source, /key: "arena"/);
  assert.doesNotMatch(source, /Enter Arena/);
  assert.doesNotMatch(source, /Organizar elenco/);
});

test("the account header exposes four canonical metrics without fake capacity or TC labels", async () => {
  const [source, marketI18n] = await Promise.all([
    readFile(arenaClientPath, "utf8"),
    readFile(marketI18nPath, "utf8"),
  ]);
  const headerStart = source.indexOf('className="team-builder-bank"');
  const headerEnd = source.indexOf("</div>", headerStart);
  const header = source.slice(headerStart, headerEnd);

  assert.match(header, /marketUi\.touchlineCredits/);
  assert.match(header, /marketUi\.squadValue/);
  assert.match(header, /marketUi\.activeContracts/);
  assert.match(header, /marketUi\.clubsRepresented/);
  assert.match(header, /representedClubCount/);
  assert.match(header, /marketHeaderCredits \?\? "—"/);
  assert.match(source, /isAuthenticatedMarketAccount \? null : clubOwnerSquadTcValue/);
  assert.doesNotMatch(header, /marketUi\.contractSlots/);
  assert.doesNotMatch(header, /marketPlayerCount/);
  assert.doesNotMatch(header, /<em>TC<\/em>/);
  assert.match(marketI18n, /touchlineCredits: "TouchLine Credits"/);
  assert.match(marketI18n, /squadValue: "Squad card value"/);
  assert.match(marketI18n, /clubsRepresented: "Clubs represented"/);
  assert.doesNotMatch(marketI18n, /Signing balance|Contract slots|Club players/);
});

test("the Market keeps account capacity first and guides a field slot directly to player selection", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  const bankIndex = source.indexOf('className="team-builder-bank"');
  const stageIndex = source.indexOf("<TouchlineSquadBuilderStage");
  const boardIndex = source.indexOf('className="team-builder-board" ref={marketSelectionRef}');

  assert.ok(bankIndex > 0);
  assert.ok(stageIndex > bankIndex);
  assert.ok(boardIndex > stageIndex);
  const formationHandler = source.slice(
    source.indexOf("function confirmMarketFormation"),
    source.indexOf("async function toggleArenaFullscreen"),
  );
  assert.doesNotMatch(formationHandler, /scrollIntoView|marketSelectionRef/);
  assert.match(formationHandler, /reconcileTouchlineFormationStarters/);
  assert.match(formationHandler, /persistArenaRoster\(nextPlayers, nextBench\)/);
  assert.match(source, /Pair its\s+selection with the athlete gallery/);
  assert.match(source, /shouldReduceMotion \? "auto" : "smooth"/);
  assert.match(source, /scroll-margin-top: 94px/);
  assert.match(source, /Final Market Transfer gallery authority/);
  assert.match(source, /grid-template-columns: minmax\(360px, 36%\) minmax\(0, 64%\)/);
  assert.match(source, /grid-template-columns: repeat\(auto-fit, minmax\(260px, 320px\)\)/);
  assert.match(source, /width: min\(100%, 241px\)/);
  assert.match(source, /width: min\(100%, 215px\);[\s\S]*?--touchline-card-static-scale: \.5/);
  assert.match(source, /width: min\(100%, 170px\);[\s\S]*?--touchline-card-static-scale: \.395/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-roster \{[\s\S]*?overflow: visible;/);
  assert.match(source, /Market is a document-length catalogue/);
  assert.match(source, /min-height: max-content !important;/);
  assert.match(source, /A Market item is a complete product card[\s\S]*?display: block !important;[\s\S]*?overflow: visible !important;/);
  assert.match(source, /grid-template-areas: "clubs roster"/);
  assert.match(source, /grid-template-areas:\s*"clubs"\s*"roster";\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(source, /<a className=\{activeArenaPanel === "market"/);
});

test("the Market card gallery stays static while unrelated live data updates", async () => {
  const source = await readFile(arenaClientPath, "utf8");

  assert.match(source, /const StableMarketPreviewCard = memo\(TouchlineEliteExactCard\)/);
  assert.match(source, /const marketCard = builderPlayerToPreviewCard\(player, \{ allowInventoryVisualPreview: true \}\)/);
  assert.match(source, /className="team-builder-gallery-card"/);
  assert.match(source, /<StableMarketPreviewCard[\s\S]*?player=\{marketCard\}[\s\S]*?subscribeToRanking=\{false\}[\s\S]*?enableInteractiveNeon=\{false\}[\s\S]*?allowVisualInventoryPreview/);
  assert.match(source, /<StableMarketPreviewCard[\s\S]*?staticRenderScale=\{0\.56\}/);
  assert.match(source, /--touchline-card-static-scale: \.56/);
  assert.match(
    source,
    /The Market gallery owns a fixed-ratio card canvas[\s\S]*?\.team-builder-player-select \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;/,
  );
  assert.match(
    source,
    /The Market gallery owns a fixed-ratio card canvas[\s\S]*?\.team-builder-gallery-card \{[\s\S]*?align-self: center;[\s\S]*?overflow: hidden;/,
  );
  assert.match(source, /team-builder-player-list > article\.is-position-locked \{[\s\S]*?overflow: visible;/);
  assert.doesNotMatch(source, /const selectedBuilderPreviewCard = useMemo\(/);
  assert.match(source, /className="team-builder-card-sign"/);
  assert.match(source, /setMarketSpotlightPlayerId\(fieldId\)/);
  assert.match(source, /className="arena-player-spotlight team-builder-card-spotlight"/);
  assert.match(source, /className="arena-player-spotlight team-builder-card-spotlight"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(source, /className="arena-player-spotlight-close"[\s\S]*?autoFocus/);
  assert.match(source, /arenaOverlayPanel === "market" && marketSpotlightPlayer \? " has-market-spotlight" : ""/);
  assert.match(source, /\.arena-action-panel-market\.has-market-spotlight \{[\s\S]*?-webkit-backdrop-filter: none;[\s\S]*?backdrop-filter: none;/);
  assert.match(source, /<TouchlineCardZoomDetailsPanel details=\{marketSpotlightZoomDetails\}/);
  assert.match(source, /touchlinePlayerProfileHref\([\s\S]*?previewTier: marketSpotlightCard\.cardTier/);
  assert.doesNotMatch(source, /className="team-builder-preview"/);
  assert.match(source, /background: linear-gradient\(145deg, rgba\(7,25,22,.98\), rgba\(2,10,9,.98\)\) !important;/);
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
  const styles = await readFile(new URL("../components/touchline/market/TouchlineSquadBuilderStage.module.css", import.meta.url), "utf8");
  assert.match(arenaSource, /TOUCHLINE MARKET · PASSO 1 DE 10/);
  assert.match(arenaSource, /club\.teamId === String\(activeArenaCoachIdentity\.coach\.teamId\)/);
  assert.match(arenaSource, /TOUCHLINE_MARKET_POSITION_SEQUENCE/);
  assert.match(arenaSource, /Substituir contrato/);
  assert.match(arenaSource, /contrato encerrado sem reembolso/);
  assert.match(source, /className=\{styles\.technicalArea\}/);
  const coachCardStyles = await readFile(new URL("../components/touchline/cards/TouchlineCoachCard.module.css", import.meta.url), "utf8");
  assert.match(styles, /\.coachCard \{ display: grid; place-items: center; width: 212px; min-height: 330px;/);
  assert.match(styles, /\.technicalArea \{[\s\S]*?width: 250px;/);
  assert.match(coachCardStyles, /width: clamp\(9px, 16cqw, 28px\)/);
  assert.match(styles, /\.pitch \{[\s\S]*?min-height: 548px;/);
  assert.match(source, /coachProfileHref/);
  assert.doesNotMatch(source, /starters\.push\([^)]*coach/i);
  assert.doesNotMatch(source, /role:\s*["']coach["']/);
});

test("the Market keeps a recoverable contract draft but only the existing checkout persists a real contract", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  assert.match(source, /marketCart: "market-contract-draft"/);
  assert.match(source, /function parseStoredMarketDraftIds/);
  assert.match(source, /writeBrowserStorage\(\s*"localStorage",\s*draftKey/);
  assert.match(source, /marketCartDraftIdsRef\.current\?\.add\(contractId\)/);
  assert.match(source, /marketCartDraftIdsRef\.current\?\.clear\(\)/);
  assert.match(source, /await fetch\("\/api\/touchline-arena\/market\/checkout"/);
  assert.match(source, /persistArenaRoster\(placement\.players, placement\.bench\)/);
});

test("matchday bench and remaining squad are disjoint views of the same authoritative roster", async () => {
  const source = await readFile(arenaClientPath, "utf8");
  const stage = await readFile(stagePath, "utf8");
  assert.match(source, /const matchdayBenchIds = useMemo\(\(\) => new Set\(matchdayBenchPlayers\.map/);
  assert.match(source, /benchPlayers\.filter\(\(bench\) => !matchdayBenchIds\.has\(bench\.id\)\)/);
  assert.match(source, /bench=\{matchdayBenchPlayers\.map\([\s\S]*?card: benchOptionToPreviewCard/);
  assert.match(source, /remainingSquad=\{reserveVaultPlayers\.map\([\s\S]*?card: benchOptionToPreviewCard/);
  assert.match(stage, /export type TouchlineSquadBuilderBenchPlayer = \{[\s\S]*?card: TouchlineEliteExactPlayer;/);
  assert.match(stage, /className=\{styles\.rosterCard\}[\s\S]*?<SquadPlayerCardZoom/);
});

test("owned squad cards remain visibly rendered in the authenticated Market builder", async () => {
  const stage = await readFile(stagePath, "utf8");
  const renderedCards = stage.match(/<TouchlineEliteExactCard[\s\S]*?\/>/g) ?? [];
  const sharedZoomUsages = stage.match(/<SquadPlayerCardZoom/g) ?? [];

  assert.equal(sharedZoomUsages.length, 3);
  assert.equal(renderedCards.length, 3);
  assert.match(stage, /function SquadPlayerCardZoom/);
  assert.match(stage, /allowVisualInventoryPreview/);
  assert.match(stage, /showCardActions=\{false\}/);
  assert.match(stage, /showProfileAction=\{false\}/);
  assert.match(stage, /expandedContent=/);
});

test("formation vacancies and replacements stay inside the pitch with eligible-only controls", async () => {
  const [arena, stage, styles] = await Promise.all([
    readFile(arenaClientPath, "utf8"),
    readFile(stagePath, "utf8"),
    readFile(new URL("../components/touchline/market/TouchlineSquadBuilderStage.module.css", import.meta.url), "utf8"),
  ]);
  const normalize = arena.slice(
    arena.indexOf("function normalizeArenaPlayersForFormation"),
    arena.indexOf("type DemoArenaPlayerSeed"),
  );

  assert.doesNotMatch(normalize, /tacticalRoleByPlayerId|tacticalRoles/);
  assert.match(normalize, /roleCounts\[player\.role\]/);
  assert.match(arena, /function arenaPlayerToFormationReserve/);
  assert.match(arena, /function assignMarketFormationPlayer/);
  assert.match(arena, /isTouchlineFormationCandidateEligible/);
  assert.match(stage, /role="dialog" aria-modal="false"/);
  assert.match(stage, /Only players eligible for this position/);
  assert.match(stage, /onAssignPlayer\(\{/);
  assert.match(stage, /window\.addEventListener\("keydown", closePicker\)/);
  assert.match(styles, /\.slotPicker \{/);
  assert.match(styles, /\.formationStatus \{/);
});
