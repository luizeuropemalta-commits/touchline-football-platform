import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arenaClientSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);
const pitchSurfaceSource = readFileSync(
  new URL("../components/touchline/pitch/TouchlinePitchSurface.module.css", import.meta.url),
  "utf8",
);
const eliteCardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);
const coachCardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineCoachCard.tsx", import.meta.url),
  "utf8",
);
const livePageSource = readFileSync(
  new URL("../app/live/page.tsx", import.meta.url),
  "utf8",
);
const rankingClientSource = readFileSync(
  new URL("../lib/touchlineArena/card-ranking-client.ts", import.meta.url),
  "utf8",
);
const premierSquadRouteSource = readFileSync(
  new URL("../app/api/football-data/premier-squad/route.ts", import.meta.url),
  "utf8",
);
const globalCssSource = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const stableLivePlayerCardCalls = arenaClientSource.match(/<StableLivePlayerCard\b[^>]*\/>/g) ?? [];

test("Live renders an XI only when each club has eleven verified Sportmonks starters", () => {
  assert.match(arenaClientSource, /\/api\/football-data\/premier-squad\?\$\{params\.toString\(\)\}/);
  assert.match(
    arenaClientSource,
    /buildLiveSimulationCardProducts\(\{[\s\S]*?homeSquad: currentLiveSquads\.home,[\s\S]*?homeClub: selectedLiveHomeClub/,
  );
  assert.match(
    arenaClientSource,
    /function buildLiveSimulationCardProducts\([\s\S]*?buildVerifiedLiveLineup\(awaySquad, awayClub, homePlayerIds\)/,
  );
  assert.match(arenaClientSource, /fixtureStarterPlayersForClub\(fixtureLineups, homeSquad, lineupHomeClub\)/);
  assert.match(arenaClientSource, /fixtureStarterPlayersForClub\(fixtureLineups, awaySquad, lineupAwayClub\)/);
  assert.match(
    arenaClientSource,
    /\/api\/football-data\/fantasy\/fixture\?fixtureId=\$\{encodeURIComponent\(providerFixtureId\)\}/,
  );
  assert.match(
    arenaClientSource,
    /feedHomeTeamId !== lineupHomeClub\.teamId \|\| feedAwayTeamId !== lineupAwayClub\.teamId/,
  );
  assert.match(arenaClientSource, /function buildVerifiedLiveLineup\([\s\S]*?if \(starters\.length !== 11\) return \[\]/);
  assert.match(arenaClientSource, /if \(home\.length !== 11 \|\| away\.length !== 11\) \{[\s\S]*?status: "unavailable"/);
  assert.match(arenaClientSource, /Escalações aguardando confirmação oficial/);
  assert.doesNotMatch(arenaClientSource, /source: "live-club-preview"/);
  assert.doesNotMatch(arenaClientSource, /selectedLiveHomeCards/);
  assert.doesNotMatch(arenaClientSource, /selectedLiveAwayCards/);
});

test("Live mini cards open one shared central zoom and can return to the pitch", () => {
  assert.match(arenaClientSource, /function LiveAtomicCardShell\(/);
  assert.match(
    arenaClientSource,
    /const openLiveSimulationCard = useCallback\(\(playerId: string\) => \{[\s\S]*?setSelectedLiveSimulationCardId\(playerId\);[\s\S]*?\}, \[\]\)/,
  );
  assert.match(arenaClientSource, /onOpen=\{openLiveSimulationCard\}/);
  assert.match(arenaClientSource, /className="arena-player-spotlight arena-live-card-spotlight"/);
  assert.match(arenaClientSource, /aria-label=\{siteLanguage === "pt-BR" \? "Fechar card ampliado"/);
  assert.match(
    arenaClientSource,
    /:not\(\.arena-live-dock\):not\(\.arena-live-card-spotlight\)/,
  );
  assert.match(
    arenaClientSource,
    /data-card-spotlight=\{isCoachSpotlightOpen \|\| selectedLiveCoachData \|\| selectedLiveSimulationCard \|\| spotlightPlayer \? "open" : "closed"\}/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-stage\[data-card-spotlight="open"\] \.arena-live-dock[\s\S]*?visibility: hidden;/,
  );
  assert.match(arenaClientSource, /-webkit-backdrop-filter: blur\(12px\) saturate\(\.76\)/);
});

test("Live does not publish a locally curated coaching card as official match data", () => {
  assert.doesNotMatch(arenaClientSource, /data-live-coach-card=/);
  assert.match(arenaClientSource, /DADOS OFICIAIS/);
  assert.match(arenaClientSource, /OFFICIAL DATA/);
});

test("Live clears a previous XI and reveals complete verified cards atomically", () => {
  assert.match(arenaClientSource, /const defaultFixtureId = fixtures\[0\]\.id/);
  assert.match(arenaClientSource, /function normalizeLiveClubSquad\(/);
  assert.match(arenaClientSource, /loadedLiveSquadFixtureRef\.current !== squadRequestId/);
  assert.match(
    arenaClientSource,
    /const squadRequestId = `\$\{squadFixtureSignature\}:\$\{liveSquadRequestSequenceRef\.current \+= 1\}`/,
  );
  assert.match(arenaClientSource, /home: \[\], away: \[\], status: "loading"/);
  assert.match(arenaClientSource, /async function applyVerifiedLineupSnapshot/);
  assert.doesNotMatch(arenaClientSource, /params\.set\("preferSnapshot", "1"\)/);
  assert.match(premierSquadRouteSource, /readPersistedSquadSnapshot\(teamId\)/);
  assert.doesNotMatch(premierSquadRouteSource, /createFootballDataProvider|persistSquadSnapshot|preferSnapshot/);
  assert.match(arenaClientSource, /normalizeLiveClubSquad\(payload\.players, club, payload\.teamId\)/);
  assert.match(arenaClientSource, /className=\{`\$\{className\} is-card-ready`\}/);
  assert.doesNotMatch(arenaClientSource, /<LiveSimulationPlayerCard[\s\S]*?isReady=/);
  assert.match(eliteCardSource, /data-touchline-card-frame="true"/);
  assert.match(eliteCardSource, /data-club-crest-visual-scale/);
  assert.match(arenaClientSource, /image\.naturalWidth <= 0/);
  assert.match(arenaClientSource, /await image\.decode\(\)/);
  assert.match(arenaClientSource, /firstRevealFrame = window\.requestAnimationFrame[\s\S]*secondRevealFrame = window\.requestAnimationFrame/);
  assert.match(arenaClientSource, /image\.addEventListener\("error", handleError\)/);
  assert.match(arenaClientSource, /querySelectorAll<HTMLImageElement>\("img\[data-live-card-asset\]"\)/);
  assert.match(arenaClientSource, /const StableLivePlayerCard = memo\(TouchlineEliteExactCard\)/);
  assert.match(arenaClientSource, /<StableLivePlayerCard[\s\S]*?optimizeForLiveCompact[\s\S]*?runtimeLocaleOverride=\{siteLanguage\}[\s\S]*?subscribeToRanking/);
  assert.ok(stableLivePlayerCardCalls.length > 0);
  stableLivePlayerCardCalls.forEach((call) => assert.doesNotMatch(call, /subscribeToRanking=\{false\}/));
  assert.match(arenaClientSource, /function liveCanonicalPlayerAssetUrls\(player: TeamBuilderSquadPlayer\)/);
  assert.match(arenaClientSource, /\.\.\.Object\.values\(TOUCHLINE_SHIRT_DIGIT_ASSETS\)/);
  assert.doesNotMatch(eliteCardSource, /data-card-sleeve-guard="official-tier-frame"/);
  assert.match(eliteCardSource, /data-live-card-compact-detail="true"/);
  assert.doesNotMatch(globalCssSource, /\[data-card-live-scale-mode=[^\]]+\] \[data-live-card-compact-detail="true"\][\s\S]*?display: none !important/);
  assert.doesNotMatch(eliteCardSource, /touchlineCardForegroundFrameUrl/);
  assert.match(eliteCardSource, /touchlineCardMetricText/);
  assert.match(eliteCardSource, /const totalPointsText = touchlineCardMetricText\(liveCompetition\.touchlinePoints\)/);
  assert.match(eliteCardSource, /liveCompetition\.phase === "preseason" \? "0" : "—"/);
  assert.match(eliteCardSource, /return text \|\| "—"/);
  const liveBuilder = arenaClientSource.match(/function builderPlayerToPreviewCard\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(liveBuilder, "Live player card builder must exist");
  assert.doesNotMatch(liveBuilder, /fantasyPoints:\s*"0\.0"/);
  assert.doesNotMatch(liveBuilder, /matchStats:\s*\{\s*goals:\s*0/);
  assert.match(liveBuilder, /fantasyPoints:\s*player\.touchlinePoints/);
  assert.match(liveBuilder, /matchStats:\s*player\.matchStats/);
  assert.match(eliteCardSource, /const \[useWebKitCompactPaintScale, setUseWebKitCompactPaintScale\] = useState\(false\)/);
  assert.match(eliteCardSource, /const isWebKitEngine =[\s\S]*?AppleWebKit[\s\S]*?Chrome\|Chromium\|Edg\|OPR\|SamsungBrowser/);
  assert.match(eliteCardSource, /useWebKitCompactPaintScale \? "atomic-transform" : "atomic-layout"/);
  assert.match(eliteCardSource, /zoom: hasStaticRenderScale[\s\S]*?optimizeForLiveCompact && !useWebKitCompactPaintScale[\s\S]*?\? scale/);
  assert.match(eliteCardSource, /hasStaticRenderScale[\s\S]*?`scale\(var\(--touchline-card-static-scale, \$\{scale\}\)\)`/);
  assert.match(eliteCardSource, /useWebKitCompactPaintScale \? `scale\(\$\{scale\}\)` : "none"/);
  assert.match(globalCssSource, /\[data-card-live-scale-mode="atomic-layout"\][\s\S]*?-webkit-text-size-adjust: none/);
  assert.doesNotMatch(globalCssSource, /@supports \(zoom: 1\)[\s\S]*?transform: none !important/);
  assert.match(arenaClientSource, /Promise\.allSettled\(\[/);
  assert.doesNotMatch(arenaClientSource, /boundedReadiness|window\.setTimeout\(resolve, 4_200\)/);
  assert.match(arenaClientSource, /readinessId: `\$\{fixtureId\}:home:\$\{slotIndex\}:\$\{livePlayerProductSignature\(player\)\}`/);
  assert.match(arenaClientSource, /readinessId: `\$\{fixtureId\}:away:\$\{slotIndex\}:\$\{livePlayerProductSignature\(player\)\}`/);
  assert.match(arenaClientSource, /key=\{`live-simulation-\$\{readinessId\}`\}/);
  assert.match(arenaClientSource, /const liveCardProductsSignature = useMemo/);
  assert.match(arenaClientSource, /setReadyLiveCardProductsSignature\(liveCardProductsSignature\)/);
  assert.doesNotMatch(arenaClientSource, /readyLiveSimulationCardIds|setReadyLiveSimulationCardIds/);
  assert.match(arenaClientSource, /const LiveSimulationPlayerCard = memo/);
  assert.match(arenaClientSource, /await preloadLiveProductImages\(\[/);
  assert.match(arenaClientSource, /setLiveMatchSquads\(\{[\s\S]*?setReadyLiveCardProductsSignature\(targetProductSignature\);[\s\S]*?setSelectedLiveFixtureId\(fixtureId\)/);
  assert.match(arenaClientSource, /isLiveLineupVisuallyReady \? "is-lineup-ready" : "is-lineup-loading"/);
  assert.match(arenaClientSource, /Verificando escalações oficiais…/);
  assert.match(
    arenaClientSource,
    /\.arena-live-moving-card\.is-card-ready \.arena-live-compact-card-product > \.touchline-card-surface \{[\s\S]*?opacity: 1;/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-live-moving-card \.arena-live-compact-card-product > \.touchline-card-surface \{[\s\S]*?pointer-events: none;[\s\S]*?-webkit-filter: none !important;/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-live-moving-card \{[\s\S]*?will-change: auto;[\s\S]*?animation: none;/,
  );
  assert.match(
    arenaClientSource,
    /\.touchline-game\.is-live-standalone \.arena-live-moving-card \.arena-live-compact-card-product > \.touchline-card-surface \{[\s\S]*?min-width: var\(--live-card-art-width\) !important;[\s\S]*?max-width: var\(--live-card-art-width\) !important;/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-live-card-simulation:not\(\.is-lineup-ready\) \.arena-live-moving-card \{[\s\S]*?visibility: hidden;/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-live-match-center\[data-live-products-ready="false"\] \.arena-live-coach-card \{[\s\S]*?visibility: hidden;/,
  );
  assert.match(arenaClientSource, /\.arena-live-moving-card\.is-home \{[\s\S]*?-webkit-filter: none;[\s\S]*?filter: none;/);
  assert.match(arenaClientSource, /\.arena-live-moving-card\.is-away \{[\s\S]*?-webkit-filter: none;[\s\S]*?filter: none;/);
});

test("Live never invents a real score and excludes known non-league fixtures", () => {
  assert.doesNotMatch(arenaClientSource, /isFallbackLiveFixture|FALLBACK_LIVE_FIXTURES|"SIMULAÇÃO" : "DEMO"/);
  assert.match(
    arenaClientSource,
    /function fixtureBoardScore\(fixture: TouchlineFixture\) \{[\s\S]*?return "VS"/,
  );
  assert.match(
    arenaClientSource,
    /function fixtureBoardClock\(fixture: TouchlineFixture, locale: TouchLineLocale\) \{[\s\S]*?const status = String\(fixture\.status \?\? ""\)\.trim\(\);/,
  );
  assert.match(
    arenaClientSource,
    /if \(fixture\.competitionId\) return PREMIER_COMPETITION_IDS\.has\(fixture\.competitionId\)/,
  );
  assert.match(arenaClientSource, /fixtureBoardScore\(selectedLiveFixture\)/);
  assert.match(arenaClientSource, /fixtureBoardClock\(selectedLiveFixture, siteLanguage\)/);
});

test("Live warms only the current verified 22 player card products", () => {
  assert.match(arenaClientSource, /simulation\.querySelectorAll\("\[data-live-player-id\]"\)\.length !== 22/);
  assert.doesNotMatch(arenaClientSource, /coaches\.querySelectorAll\("\[data-live-coach-card\]"\)/);
  assert.match(
    arenaClientSource,
    /const shouldRenderArenaOwnerLayer = \(shouldRenderPlayers \|\| isQuickSubstitutionSessionActive\)\s*&& standaloneExperience !== "live"\s*&& !isCoachSelectionRequired/,
  );
  assert.match(arenaClientSource, /standalonePanel !== "live" \? \([\s\S]*?<div className="arena-video-stack"/);
  assert.match(arenaClientSource, /optimizeForLiveCompact/);
  assert.match(arenaClientSource, /readyLiveCardProductsSignature === liveCardProductsSignature/);
  assert.match(arenaClientSource, /setReadyLiveCardProductsSignature\(liveCardProductsSignature\)/);
  assert.match(arenaClientSource, /\.arena-live-card-spotlight > \.arena-player-spotlight-backdrop/);
  assert.match(arenaClientSource, /rgba\(0,0,0,\.985\)/);
  assert.ok(stableLivePlayerCardCalls.length > 0);
  stableLivePlayerCardCalls.forEach((call) => assert.doesNotMatch(call, /subscribeToRanking=\{false\}/));
  assert.match(arenaClientSource, /enableInteractiveNeon=\{false\}/);
  assert.match(arenaClientSource, /layoutOverride=\{TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT\}/);
  assert.match(eliteCardSource, /LIVE_COMPACT_CLUB_TEMPLATE_ROOT/);
  assert.match(eliteCardSource, /touchlineLiveCompactFrameUrl\(versionedCardTemplateUrl\)/);
  assert.match(eliteCardSource, /if \(!unversionedUrl\.startsWith\(clubTemplateRoot\)\) return unversionedUrl/);
  assert.match(eliteCardSource, /useTouchlineActiveRanking\(subscribeToRanking\)/);
  assert.match(coachCardSource, /templates\/live-compact\/coaches/);
  assert.match(coachCardSource, /templates\/zoom\/coaches/);
  assert.match(
    rankingClientSource,
    /subscribeToUpdates \? getActiveRankingSnapshot : getPreseasonRankingSnapshot/,
  );
  assert.match(livePageSource, /initialLocale=\{initialLocale\}/);
  assert.match(livePageSource, /selectArenaFixtureRound\([\s\S]*?readPublicCompetitionFixtures\(\{ includeHistorical: true, limit: 240 \}\)/);
});

test("Live keeps no-store by default and bounds persisted read requests", () => {
  assert.match(arenaClientSource, /cacheOrOptions: RequestCache \| \{ cache\?: RequestCache; timeoutMs\?: number; signal\?: AbortSignal \} = "no-store"/);
  assert.match(arenaClientSource, /controller\.abort\(\)/);
  assert.match(arenaClientSource, /cache: "no-store",[\s\S]*?timeoutMs: ARENA_LIVE_SNAPSHOT_REQUEST_TIMEOUT_MS/);
});

test("Live aborts obsolete fixture work and never falls back to a club squad", () => {
  assert.match(arenaClientSource, /signal: requestController\.signal/);
  assert.match(arenaClientSource, /requestController\.abort\(\)/);
  assert.match(arenaClientSource, /window\.setTimeout\(\(\) => \{[\s\S]*?ARENA_LIVE_SQUAD_REQUEST_SETTLE_MS/);
  assert.match(arenaClientSource, /window\.clearTimeout\(squadRequestTimer\)/);
  assert.match(arenaClientSource, /Promise\.all\(\[loadClubSquad\(homeClub\), loadClubSquad\(awayClub\), loadFixtureLineups\(\)\]\)/);
  assert.doesNotMatch(arenaClientSource, /readStoredLiveSquad|buildLiveClubPreviewEleven|live-club-preview/);
});

test("Live restores the saved fixture before choosing the first fallback", () => {
  const restoreIndex = arenaClientSource.indexOf("setHasRestoredLiveFixtureSelection(true)");
  const fallbackGateIndex = arenaClientSource.indexOf("if (!hasRestoredLiveFixtureSelection) return;");
  assert.ok(restoreIndex >= 0);
  assert.ok(fallbackGateIndex > restoreIndex);
  assert.match(
    arenaClientSource,
    /const selectedLiveFixture = visibleLiveFixtures\.find\([\s\S]*?\?\? visibleLiveFixtures\[0\][\s\S]*?const effectiveSelectedLiveFixtureId = selectedLiveFixture\?\.id \?\? null;/,
  );
  assert.match(
    arenaClientSource,
    /if \(!hasRestoredLiveFixtureSelection\) return;[\s\S]*?const fixture = fixtures\.find\(\(candidate\) => candidate\.id === effectiveSelectedLiveFixtureId\)/,
  );
  assert.match(
    arenaClientSource,
    /effectiveSelectedLiveFixtureId === fixture\.id \? "is-active" : ""[\s\S]*?pendingLiveFixtureId === fixture\.id \? "is-pending" : ""[\s\S]*?aria-pressed=\{effectiveSelectedLiveFixtureId === fixture\.id\}/,
  );
});

test("Premier squad responses carry the canonical team identity used by Live", () => {
  assert.match(premierSquadRouteSource, /clubTeamId,/);
  assert.match(premierSquadRouteSource, /teamId: metadata\.teamId/);
  assert.match(premierSquadRouteSource, /providerId: metadata\.teamId/);
  assert.match(premierSquadRouteSource, /teamId is not registered in TouchLine England/);
});

test("Live club marks remain transparent and scoreboard names stay contained", () => {
  assert.match(
    arenaClientSource,
    /\.arena-live-dock-badge \{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-live-match-team strong \{[\s\S]*?overflow: visible;[\s\S]*?text-wrap: balance;[\s\S]*?white-space: normal;/,
  );
});

test("Live uses the licensed pitch as a proportional visual layer without changing card simulation", () => {
  assert.match(arenaClientSource, /import TouchlinePitchSurface/);
  assert.match(arenaClientSource, /<TouchlinePitchSurface className="arena-live-visualizer"/);
  assert.match(pitchSurfaceSource, /official-live-pitch-960\.webp/);
  assert.doesNotMatch(arenaClientSource, /src="\/touchlineArena\/live\/official-live-pitch-dgim-studio-freepik\.jpg"/);
  assert.match(
    arenaClientSource,
    /\.arena-live-visualizer \{[\s\S]*?aspect-ratio: 2200 \/ 1555;/,
  );
  assert.doesNotMatch(arenaClientSource, /arena-live-pitch-photo/);
  assert.match(
    arenaClientSource,
    /Designed by dgim-studio \/ Freepik/,
  );
  assert.match(arenaClientSource, /liveSimulationCards\.map/);
});

test("Live standalone keeps the full stadium scrollable in short landscape without distorting the pitch", () => {
  assert.match(
    arenaClientSource,
    /\.touchline-game\.is-live-standalone \.arena-live-match-center \{[\s\S]*?grid-auto-rows: max-content;[\s\S]*?align-content: start;/,
  );
  assert.match(
    arenaClientSource,
    /@media \(max-width: 1100px\) and \(max-height: 560px\) and \(orientation: landscape\) \{[\s\S]*?grid-template-columns: clamp\(136px, 19vw, 168px\) minmax\(0, 1fr\);/,
  );
  assert.match(
    arenaClientSource,
    /@media \(max-width: 1100px\) and \(max-height: 560px\) and \(orientation: landscape\) \{[\s\S]*?\.touchline-game\.is-live-standalone \.arena-live-match-center \{[\s\S]*?grid-auto-rows: max-content;[\s\S]*?overflow-y: auto;/,
  );
  assert.match(
    arenaClientSource,
    /\.touchline-game\.is-live-standalone \.arena-live-visualizer \{[\s\S]*?height: auto;[\s\S]*?aspect-ratio: 2200 \/ 1555;/,
  );
});
