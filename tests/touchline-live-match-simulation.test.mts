import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arenaClientSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
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

test("Live builds both elevens only from the clubs selected for the fixture", () => {
  assert.match(arenaClientSource, /\/api\/football-data\/premier-squad\?\$\{params\.toString\(\)\}/);
  assert.match(
    arenaClientSource,
    /buildLiveSimulationCardProducts\(\{[\s\S]*?homeSquad: currentLiveSquads\.home,[\s\S]*?homeClub: selectedLiveHomeClub/,
  );
  assert.match(
    arenaClientSource,
    /function buildLiveSimulationCardProducts\([\s\S]*?buildLiveSimulationEleven\(awaySquad, awayClub, \[\], homePlayerIds\)/,
  );
  assert.match(arenaClientSource, /fixtureStarterPlayersForClub\(fixtureLineups, homeSquad, lineupHomeClub\)/);
  assert.match(arenaClientSource, /fixtureStarterPlayersForClub\(fixtureLineups, awaySquad, lineupAwayClub\)/);
  assert.match(
    arenaClientSource,
    /\/api\/football-data\/fantasy\/fixture\?fixtureId=\$\{encodeURIComponent\(providerFixtureId\)\}&persist=0/,
  );
  assert.match(
    arenaClientSource,
    /feedHomeTeamId !== lineupHomeClub\.teamId \|\| feedAwayTeamId !== lineupAwayClub\.teamId/,
  );
  assert.match(arenaClientSource, /Simulação dos 22 cards dos clubes em movimento/);
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
    /data-card-spotlight=\{isCoachSpotlightOpen \|\| selectedLiveCoachData \|\| selectedLiveSimulationCard \? "open" : "closed"\}/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-stage\[data-card-spotlight="open"\] \.arena-live-dock[\s\S]*?visibility: hidden;/,
  );
  assert.match(arenaClientSource, /-webkit-backdrop-filter: blur\(12px\) saturate\(\.76\)/);
});

test("Live always synchronizes both official coach cards with the selected fixture", () => {
  assert.match(arenaClientSource, /touchlineLiveCoachForTeam\(selectedLiveHomeClub\?\.teamId\)/);
  assert.match(arenaClientSource, /touchlineLiveCoachForTeam\(selectedLiveAwayClub\?\.teamId\)/);
  assert.match(arenaClientSource, /data-live-coach-card="home"/);
  assert.match(arenaClientSource, /data-live-coach-card="away"/);
  assert.match(arenaClientSource, /displayMode="compact"/);
  assert.match(arenaClientSource, /setSelectedLiveCoachSide\("home"\)/);
  assert.match(arenaClientSource, /setSelectedLiveCoachSide\("away"\)/);
  assert.match(arenaClientSource, /setSelectedLiveCoachSide\(null\)/);
  assert.match(arenaClientSource, /className="arena-coach-spotlight arena-live-card-spotlight arena-live-coach-spotlight"/);
  assert.match(arenaClientSource, /className="arena-live-coach-spotlight-card"[\s\S]*?forceNeonActive/);
  assert.match(arenaClientSource, /\.arena-live-coach-card-art \{[\s\S]*?width: clamp\(35px, 3\.9vw, 55px\) !important;/);
  assert.match(arenaClientSource, /@media \(max-width: 900px\) \{[\s\S]*?\.arena-live-coach-card-art \{[\s\S]*?width: clamp\(30px, 7\.4vw, 42px\) !important;/);
});

test("Live opens immediately, prioritizes saved squads and reveals complete cards atomically", () => {
  assert.match(arenaClientSource, /const defaultFixtureId = fixtures\[0\]\.id/);
  assert.match(arenaClientSource, /readStoredLiveSquad\(homeClub\)/);
  assert.match(arenaClientSource, /readStoredLiveSquad\(awayClub\)/);
  assert.match(arenaClientSource, /function buildLiveClubPreviewEleven\(/);
  assert.match(arenaClientSource, /function normalizeLiveClubSquad\(/);
  assert.match(arenaClientSource, /loadedLiveSquadFixtureRef\.current !== squadRequestId/);
  assert.match(
    arenaClientSource,
    /const squadRequestId = `\$\{squadFixtureSignature\}:\$\{liveSquadRequestSequenceRef\.current \+= 1\}`/,
  );
  assert.match(arenaClientSource, /source: "live-club-preview"/);
  assert.match(arenaClientSource, /home: immediateHome, away: immediateAway, status: "ready"/);
  assert.match(arenaClientSource, /params\.set\("preferSnapshot", "1"\)/);
  assert.match(
    premierSquadRouteSource,
    /preferSnapshot && persistedSnapshot\?\.players\.length/,
  );
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
  assert.doesNotMatch(arenaClientSource, /<StableLivePlayerCard[\s\S]*?subscribeToRanking=\{false\}/);
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
  assert.match(eliteCardSource, /zoom: optimizeForLiveCompact && !useWebKitCompactPaintScale \? scale : undefined/);
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
  assert.match(arenaClientSource, /Preparando transmissão…/);
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
  assert.match(arenaClientSource, /function isFallbackLiveFixture\(fixture: TouchlineFixture\)/);
  assert.match(arenaClientSource, /siteLanguage === "pt-BR" \? "SIMULAÇÃO" : "DEMO"/);
  assert.match(
    arenaClientSource,
    /function fixtureBoardScore\(fixture: TouchlineFixture\) \{[\s\S]*?isFallbackLiveFixture\(fixture\) \? "2 — 1" : "VS"/,
  );
  assert.match(
    arenaClientSource,
    /function fixtureBoardClock\(fixture: TouchlineFixture, locale: TouchLineLocale\) \{[\s\S]*?isFallbackLiveFixture\(fixture\)\) return "74′"/,
  );
  assert.match(
    arenaClientSource,
    /if \(fixture\.competitionId\) return PREMIER_COMPETITION_IDS\.has\(fixture\.competitionId\)/,
  );
  assert.match(arenaClientSource, /fixtureBoardScore\(selectedLiveFixture\)/);
  assert.match(arenaClientSource, /fixtureBoardClock\(selectedLiveFixture, siteLanguage\)/);
});

test("Live only warms the current 22 player and two coach card products", () => {
  assert.match(arenaClientSource, /simulation\.querySelectorAll\("\[data-live-player-id\]"\)\.length !== 22/);
  assert.match(arenaClientSource, /coaches\.querySelectorAll\("\[data-live-coach-card\]"\)\.length !== 2/);
  assert.match(arenaClientSource, /shouldRenderPlayers && standalonePanel !== "live"/);
  assert.match(arenaClientSource, /standalonePanel !== "live" \? \([\s\S]*?<div className="arena-video-stack"/);
  assert.match(arenaClientSource, /optimizeForLiveCompact/);
  assert.match(arenaClientSource, /readyLiveCardProductsSignature === liveCardProductsSignature/);
  assert.match(arenaClientSource, /setReadyLiveCardProductsSignature\(liveCardProductsSignature\)/);
  assert.match(arenaClientSource, /\.arena-live-card-spotlight > \.arena-player-spotlight-backdrop/);
  assert.match(arenaClientSource, /rgba\(0,0,0,\.985\)/);
  assert.doesNotMatch(arenaClientSource, /subscribeToRanking=\{false\}/);
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
});

test("Live keeps no-store by default, bounds requests and honors the Premier squad snapshot cache", () => {
  assert.match(arenaClientSource, /cacheOrOptions: RequestCache \| \{ cache\?: RequestCache; timeoutMs\?: number; signal\?: AbortSignal \} = "no-store"/);
  assert.match(arenaClientSource, /controller\.abort\(\)/);
  assert.match(
    arenaClientSource,
    /cache: snapshotOnly \? "default" : "no-store"/,
  );
});

test("Live aborts obsolete fixture work and deduplicates completed squad refreshes", () => {
  assert.match(arenaClientSource, /signal: requestController\.signal/);
  assert.match(arenaClientSource, /requestController\.abort\(\)/);
  assert.match(arenaClientSource, /window\.setTimeout\(\(\) => \{[\s\S]*?ARENA_LIVE_SQUAD_REQUEST_SETTLE_MS/);
  assert.match(arenaClientSource, /window\.clearTimeout\(squadRequestTimer\)/);
  assert.match(arenaClientSource, /liveSquadRefreshAtRef\.current\.get\(squadFixtureSignature\)/);
  assert.match(arenaClientSource, /Date\.now\(\) - lastProviderRefreshAt > ARENA_LIVE_SQUAD_REFRESH_DEDUP_MS/);
  assert.match(arenaClientSource, /if \(!hasCompleteStoredSquads\) \{[\s\S]*?loadClubSquad\(homeClub, true\)/);
  assert.match(arenaClientSource, /liveSquadRefreshAtRef\.current\.set\(squadFixtureSignature, Date\.now\(\)\)/);
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
  assert.match(
    arenaClientSource,
    /official-live-pitch-640\.webp\?v=\$\{ARENA_LIVE_VISUAL_ASSET_VERSION\} 640w,[\s\S]*?official-live-pitch-1600\.webp\?v=\$\{ARENA_LIVE_VISUAL_ASSET_VERSION\} 1600w/,
  );
  assert.doesNotMatch(arenaClientSource, /src="\/touchlineArena\/live\/official-live-pitch-dgim-studio-freepik\.jpg"/);
  assert.match(
    arenaClientSource,
    /\.arena-live-visualizer \{[\s\S]*?aspect-ratio: 2200 \/ 1555;/,
  );
  assert.match(
    arenaClientSource,
    /\.arena-live-pitch-photo \{[\s\S]*?object-fit: cover;[\s\S]*?object-position: 50% 50%;/,
  );
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
