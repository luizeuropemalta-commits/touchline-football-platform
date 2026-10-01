import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("every TouchLine card keeps the permanent tier neon contract", () => {
  const globalCss = source("app/globals.css");
  const exactCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");
  const trace = source("components/touchline/cards/TouchlineCardPerimeterTrace.tsx");
  const traceCss = globalCss.slice(
    globalCss.indexOf('[data-touchline-card-neon-trace="true"]'),
    globalCss.indexOf('.touchline-card-surface[data-card-tier="neutral"][data-card-classification="pending"]'),
  );

  assert.match(exactCard, /data-card-neon="permanent-tier-art"/);
  assert.match(exactCard, /TouchLine England League Stats/);
  assert.doesNotMatch(exactCard, /TouchLine Arena Points/);
  assert.match(exactCard, /formatTouchlineMarketValueEur/);
  assert.doesNotMatch(exactCard, /formatTouchlineContractedCommercialCardPrice/);
  assert.match(exactCard, /<span>\{compactSecondaryLabel\}<\/span>/);
  assert.match(exactCard, /data-card-tier=\{marketTier\?\.key \?\? "neutral"\}/);
  assert.match(exactCard, /data-card-editorial-state=\{reviewRequired \? "review_required" : publicationPending \? "publication_pending" : editorialCard \? "published" : "unpublished"\}/);
  assert.doesNotMatch(exactCard, /resolveTouchlineVerifiedPlayerEconomy|resolveTouchlinePublicCardPresentation/);
  assert.doesNotMatch(exactCard, /TC Value/);
  assert.match(globalCss, /\.touchline-card-surface\[data-card-motion="true"\]/);
  assert.match(globalCss, /\.touchline-card-surface\[data-card-tier="neutral"\]\[data-card-classification="pending"\]/);
  assert.doesNotMatch(globalCss, /\.touchline-card-surface\[data-card-classification="pending"\]\s+\[data-touchline-card-frame="true"\]/);
  assert.match(globalCss, /\.touchline-card-surface\[data-card-motion="true"\]:hover/);
  assert.match(trace, /data-touchline-card-neon-trace="true"/);
  assert.match(trace, /aria-hidden="true"/);
  assert.match(trace, /focusable="false"/);
  assert.match(trace, /pathLength="100"/);
  assert.match(trace, /fill="none"/);
  assert.match(trace, /TOUCHLINE_CARD_PERIMETER_PATH/);
  assert.match(traceCss, /pointer-events: none/);
  assert.match(traceCss, /overflow: visible/);
  assert.match(traceCss, /@keyframes touchline-card-perimeter-trace/);
  assert.match(traceCss, /animation: touchline-card-perimeter-trace 8s cubic-bezier\(\.22,\.74,\.28,1\) infinite/);
  assert.match(traceCss, /18\.75%, 89% \{ stroke-dasharray: 100 0; stroke-dashoffset: -100; opacity: \.28; \}/);
  assert.match(traceCss, /94% \{ stroke-dasharray: 100 0; stroke-dashoffset: -100; opacity: 0; \}/);
  assert.doesNotMatch(traceCss, /1500ms cubic-bezier\(\.22,\.74,\.28,1\) both/);
  assert.match(traceCss, /stroke-dashoffset/);
  assert.doesNotMatch(traceCss, /mask|clip-path|filter:|background:/);
  assert.doesNotMatch(traceCss, /overflow: hidden/);
  assert.match(exactCard, /touchlineCardTierPalette\(marketTier\.key\)\.accent/);
  assert.match(exactCard, /--touchline-card-frame-color": cardTraceColor/);
  assert.match(exactCard, /--touchline-club-crest-color": resolvedClub\?\.accent \?\? cardTraceColor/);
  assert.match(coachCard, /--touchline-card-frame-color": tierPalette\.accent/);
  assert.match(coachCard, /--touchline-club-crest-color": clubAccent/);
  assert.match(exactCard, /<TouchlineCardPerimeterTrace tier=\{marketTier\?\.key \?\? "neutral"\} \/>/);
  assert.match(coachCard, /<TouchlineCardPerimeterTrace tier=\{slot\.cardTier\} variant="coach" \/>/);
  assert.doesNotMatch(exactCard, /TouchlineClubCrestPerimeterTrace|crest-trace/);
  assert.doesNotMatch(coachCard, /TouchlineClubCrestPerimeterTrace|crest-trace/);
  assert.match(exactCard, /data-touchline-card-crest-host="true"/);
  assert.match(coachCard, /data-touchline-card-crest-host="true"/);
  assert.match(exactCard, /data-touchline-card-crest="true"/);
  assert.match(coachCard, /data-touchline-card-crest="true"/);
  assert.match(globalCss, /drop-shadow\(0 2px 5px rgba\(0,0,0,\.48\)\)/);
  assert.match(globalCss, /touchline-card-surface\[data-card-motion="true"\]:hover \[data-touchline-card-crest="true"\]/);
  assert.doesNotMatch(globalCss, /drop-shadow\([^;\n]*var\(--touchline-club-crest-color\)/);
  assert.match(coachCard, /--touchline-club-crest-color": clubAccent/);
  assert.match(source("components\/touchline\/cards\/TouchlineCoachCard\.module\.css"), /\.shell:hover \.clubBadge \[data-touchline-card-crest-host="true"\] > img/);
  assert.doesNotMatch(globalCss, /data-touchline-card-crest-trace/);
  assert.match(globalCss, /\[data-touchline-card-crest-host="true"\][\s\S]*?place-items: center/);
  const crestCss = globalCss.slice(
    globalCss.indexOf('.touchline-card-surface[data-card-motion="true"] [data-touchline-card-crest="true"]'),
    globalCss.indexOf('/* Touch screens do not have desktop hover.'),
  );
  assert.doesNotMatch(crestCss, /border-radius:\s*50%|outline:|radial-gradient\(circle/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-touchline-card-neon-trace-run="true"\][\s\S]*?animation: none !important/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-touchline-card-neon-trace-base="true"\][\s\S]*?opacity: \.72/);
  assert.match(globalCss, /touch-action: manipulation/);
  assert.doesNotMatch(traceCss, /touch-action:\s*none/);
  assert.match(globalCss, /\[data-neon-active="true"\]/);
  assert.match(globalCss, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(exactCard, /data-touchline-card-frame="true"/);
  assert.match(exactCard, /src=\{zoomFrameUrl\}/);
  assert.match(exactCard, /data-card-delivery="zoom-optimized"/);
  assert.doesNotMatch(exactCard, /data-card-sleeve-guard="official-tier-frame"/);
  assert.doesNotMatch(exactCard, /onError=\{\(event\) => handleFrameError\(event\.currentTarget, versionedCardTemplateUrl\)\}/);
  assert.doesNotMatch(exactCard, /clipPath: "polygon\(20% 20%, 80% 20%/);
  assert.match(globalCss, /\[data-neon-active="true"\][^{]*\{[^}]*scale\(1\.028\)/s);
  assert.doesNotMatch(globalCss, /touchline-card-perimeter-trace 1500ms/);
  assert.match(source("components/touchline/cards/TouchlineCardZoom.tsx"), /data-card-zoom="expanded"/);
  assert.doesNotMatch(globalCss, /\.touchline-card-zoom \.touchline-card-surface\[data-card-motion="true"\]/);
  assert.match(exactCard, /touchline-card-neon-select/);
  assert.match(exactCard, /document\.addEventListener\("pointerdown", clearWhenPointerLeavesTheCard\)/);
  assert.match(exactCard, /selectedId !== neonInstanceId/);
});

test("the perimeter trace centres each official player and coach rail without changing its approved lower extent", () => {
  const trace = source("components/touchline/cards/TouchlineCardPerimeterTrace.tsx");

  for (const tier of [
    "ruby-red",
    "sapphire-blue",
    "amethyst-purple",
    "radiant-gold",
    "emerald-green",
    "clear-diamond",
    "diamond-gold",
  ]) {
    assert.match(trace, new RegExp(`"${tier}": \\[`));
  }

  assert.match(trace, /TOUCHLINE_PLAYER_PERIMETER_SIDE_CENTRES/);
  assert.match(trace, /TOUCHLINE_COACH_PERIMETER_SIDE_CENTRES/);
  assert.match(trace, /"ruby-red": \[21, 412\]/);
  assert.match(trace, /"sapphire-blue": \[18, 412\]/);
  assert.match(trace, /"amethyst-purple": \[14, 417\]/);
  assert.match(trace, /"radiant-gold": \[15, 414\]/);
  assert.match(trace, /"emerald-green": \[25, 411\]/);
  assert.match(trace, /"clear-diamond": \[19, 412\]/);
  assert.match(trace, /"diamond-gold": \[29, 400\]/);
  assert.match(trace, /"ruby-red": \[95, 711\]/);
  assert.match(trace, /"sapphire-blue": \[79, 726\]/);
  assert.match(trace, /"amethyst-purple": \[78, 730\]/);
  assert.match(trace, /"radiant-gold": \[89, 715\]/);
  assert.match(trace, /"emerald-green": \[78, 725\]/);
  assert.match(trace, /"clear-diamond": \[76, 748\]/);
  assert.match(trace, /"diamond-gold": \[80, 733\]/);
  assert.match(trace, /viewBox=\{isCoach \? "0 0 810 1080" : "0 0 430 691"\}/);
  assert.match(trace, /M123 18H307L\$\{right\} 98V593L307 680H123L\$\{left\} 593V98Z/);
  assert.match(trace, /M232 28H578L\$\{right\} 153V926L578 1063H232L\$\{left\} 926V153Z/);
});

test("card controls stay inside the master safe zone and contracting stays outside the artwork", () => {
  const layout = JSON.parse(source("public/touchlineArena/card-layouts/master-shirt-back-layout.json"));
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const zoomUsages = [
    source("app/touchline-clubs/[club]/page.tsx"),
    source("app/touchline-player-card-rankings/page.tsx"),
    source("app/touchline-players/[player]/page.tsx"),
    source("components/touchline/ClubHubOfficialLineup.tsx"),
  ].join("\n");

  assert.equal(layout.layout.shareAction, undefined, "Share must stay outside the card artwork");
  assert.deepEqual(layout.layout.followAction, { x: 92, y: 531, scale: 1 });
  assert.deepEqual(layout.layout.likeAction, { x: 220, y: 531, scale: 1 });
  assert.ok(layout.layout.profileAction.x + (118 * layout.layout.profileAction.scale) <= 372);
  assert.ok(layout.layout.followAction.x + (118 * layout.layout.followAction.scale) <= layout.layout.likeAction.x);
  assert.ok(layout.layout.likeAction.x + (118 * layout.layout.likeAction.scale) <= 402);
  assert.equal((layout.layout.followAction.x + layout.layout.likeAction.x + 118) / 2, 215);
  assert.match(zoom, /<div ref=\{expandedRef\} className=\{styles\.expandedCard\} data-card-zoom="expanded">/);
  assert.match(zoom, /<a className=\{styles\.contractAction\} href=\{contractHref\}>/);
  assert.ok(
    zoom.indexOf("styles.contractAction") > zoom.indexOf("styles.expandedCard"),
    "contract action must render after and outside the card artwork",
  );
  assert.match(zoomCss, /\.contractAction \{/);
  assert.match(zoomCss, /\.expandedMeta \{/);
  assert.doesNotMatch(zoom, /className=\{styles\.tierLabel\}/);
  assert.doesNotMatch(zoomCss, /\.tierLabel \{/);
  assert.match(zoom, /\{!details && tierLabel \? <strong>\{tierLabel\}<\/strong> : null\}/);
  assert.doesNotMatch(zoomUsages, /Comprar|Buy card/);
  assert.doesNotMatch(zoomUsages, /Sign player/);
  assert.match(zoomUsages, /contractLabel=\{locale === "pt-BR" \? "Contratar"/);
  assert.match(zoomUsages, /Contrato · 1 temporada/);
  assert.match(zoomUsages, /const tierDisplayName = tier[\s\S]*?touchlineCardTierName\(tier\.key, locale\)/);
  assert.match(zoomUsages, /tierLabel=\{tierDisplayName \?\? undefined\}/);
});

test("shared social identity preserves the ClubOwner portrait trace and reduced motion", () => {
  const social = source("components/touchline/social/TouchlineSocial.tsx");
  const socialCss = source("components/touchline/social/TouchlineSocial.module.css");
  const trace = source("components/touchline/social/ClubOwnerPortraitPerimeterTrace.tsx");

  assert.match(social, /ClubOwnerPortraitPerimeterTrace/);
  assert.match(trace, /data-club-owner-portrait-neon-trace="true"/);
  assert.match(socialCss, /--club-owner-portrait-trace-color: #a3ff12/);
  assert.match(socialCss, /@keyframes club-owner-portrait-perimeter-trace/);
  assert.match(socialCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/);
});

test("shared social identity keeps its responsive name and portrait layout", () => {
  const socialCss = source("components/touchline/social/TouchlineSocial.module.css");

  assert.match(socialCss, /\.identityOnly \.socialName h1 \{[\s\S]*?white-space: nowrap/);
  assert.match(socialCss, /\.identityOnly \.avatarFooter \{[\s\S]*?translateY\(10%\)/);
  assert.match(socialCss, /@media \(max-width: 720px\)[\s\S]*?\.identityOnly \.socialName h1 \{ font-size: 37\.8px/);
  assert.match(socialCss, /@media \(max-width: 720px\)[\s\S]*?\.identityOnly \.socialIdentity\.hasFeaturedVisual \{[\s\S]*?grid-template-columns: 112px minmax\(0, 1fr\)/);
  assert.match(socialCss, /\.socialIdentity\.hasFeaturedVisual \.socialAvatar \{[\s\S]*?width: 112px;[\s\S]*?height: 112px/);
});

test("ClubHub line-up preserves the pitch and responsive card sizing contract", () => {
  const clubHubPage = source("app/touchline-clubs/[club]/page.tsx");
  const squadGrid = source("components/touchline/ClubHubSquadGrid.tsx");
  const lineupComponent = source("components/touchline/ClubHubOfficialLineup.tsx");
  const lineupCss = source("components/touchline/ClubHubOfficialLineup.module.css");
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");

  assert.match(clubHubPage, /\.club-hub-shell \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(clubHubPage, /\.club-hub-shell > \* \{[\s\S]*?min-width: 0/);
  assert.match(lineupCss, /\.pitchViewport \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(lineupCss, /\.pitch \{[\s\S]*?width: min\(100%, 922px\);[\s\S]*?min-width: 0/);
  assert.match(lineupCss, /@media \(max-width: 720px\)[\s\S]*?\.pitch \{ width: 100%; \}/);
  assert.match(lineupCss, /@media \(max-width: 720px\)[\s\S]*?\.player \{[\s\S]*?width: clamp\(48px, 17vw, 70px\)/);
  assert.match(lineupCss, /@media \(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 520px\)/);
  assert.match(lineupCss, /max-height: 520px\)[\s\S]*?\.pitchViewport \{[\s\S]*?overflow: hidden/);
  assert.match(lineupCss, /max-height: 520px\)[\s\S]*?\.pitch \{ width: 100%; \}/);
  assert.match(lineupCss, /container-type: inline-size/);
  assert.match(lineupCss, /--touchline-attack-card-long-edge: clamp\(28px, calc\(14cqw - 34px\), 94px\)/);
  assert.doesNotMatch(lineupCss, /--touchline-card-static-scale/);
  assert.doesNotMatch(lineupComponent, /staticRenderScale=\{80 \/ 430\}/);
  assert.match(squadGrid, /<TouchlineCardZoom/);
  assert.match(lineupComponent, /<TouchlineCardZoom/);
  assert.match(lineupComponent, /showSocialMetrics=\{false\}/);
  assert.match(squadGrid, /className=\{`club-hub-card-meta \$\{styles.meta\}`\}/);
  assert.doesNotMatch(clubHubPage, /t\("topClubAssets"\)/);
  assert.doesNotMatch(clubHubPage, /\.club-hub-card div \{/);
  assert.doesNotMatch(clubHubPage, /\/market-transfer\?\$\{localeQuery\}/);
  assert.match(clubHubPage, /@media \(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 520px\)[\s\S]*?\.club-hub-board \{[\s\S]*?repeat\(2/);
  assert.match(cardZoom, /createPortal\(/);
  assert.match(cardZoom, /document\.body/);
});

test("profile surfaces use the shared compact global navigation", () => {
  const globalNavigation = source("components/touchline/TouchlineGlobalNavigation.tsx");
  const globalNavigationCss = source("components/touchline/TouchlineGlobalNavigation.module.css");
  const athleteProfile = source("app/touchline-players/[player]/page.tsx");
  const athleteProfileCss = source("app/touchline-players/[player]/player-profile.module.css");

  assert.match(globalNavigation, /resolveTouchlineGlobalNavigationItems/);
  assert.match(globalNavigation, /aria-current=\{isCurrent \? "page" : undefined\}/);
  assert.match(globalNavigation, /touchlineGlobalNavigationArenaHref/);
  assert.match(athleteProfileCss, /@media \(min-width: 761px\) and \(max-width: 880px\)[\s\S]*?\.identityHeading \{[\s\S]*?flex-direction: column/);
  assert.match(athleteProfileCss, /@media \(max-width: 760px\)[\s\S]*?\.identityHeading \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 104px/);
  assert.match(athleteProfileCss, /\.statusGrid article \{[\s\S]*?min-width: 0/);
  assert.match(athleteProfileCss, /\.statusGrid p,[\s\S]*?overflow-wrap: anywhere/);
  assert.doesNotMatch(globalNavigation, /Tabela ClubOwner|TouchLine England|Best XI da Rodada/);
  assert.match(globalNavigationCss, /min-height: 44px/);
  assert.match(athleteProfile, /TouchlineGlobalNavigation/);
  assert.doesNotMatch(athleteProfile, /TouchlineProfileQuickNav/);
});

test("ranked cards preserve their supplied winning tier", () => {
  const tablesClient = source("app/touchline-tables/touchline-tables-client.tsx");

  assert.match(tablesClient, /squadCardToExactPlayer\(card, \{ useSuppliedTier: true \}\)/);
  assert.doesNotMatch(tablesClient, /TOUCHLINE_CARD_STARTING_TIER_KEY/);
});

test("shared social promotion stage keeps readable sizing and a reversible card zoom", () => {
  const socialCss = source("components/touchline/social/TouchlineSocial.module.css");
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");

  assert.match(cardZoom, /onClick=\{\(\) => setIsOpen\(false\)\}/);
  assert.match(cardZoom, /if \(\(event\.target as HTMLElement\)\.closest\("a,button"\)\) return;[\s\S]*?setIsOpen\(false\)/);
  assert.match(socialCss, /min-height: 620px/);
  assert.match(socialCss, /minmax\(370px, 430px\)/);
});

test("the positional Best XI uses player cards and one reversible zoom on every device", () => {
  const tablesClient = source("app/touchline-tables/touchline-tables-client.tsx");
  const tablesCss = source("app/touchline-tables/touchline-tables.module.css");
  const bestElevenStart = tablesClient.indexOf("data-best-eleven-player");
  const bestElevenSource = tablesClient.slice(bestElevenStart, bestElevenStart + 1100);

  assert.ok(bestElevenStart >= 0);
  assert.match(bestElevenSource, /cardButton/);
  assert.match(bestElevenSource, /<TablePlayerCardZoom card=\{card\}/);
  assert.doesNotMatch(bestElevenSource, /<ClubLogo/);
  assert.match(tablesClient, /import TouchlineCardZoom/);
  assert.match(tablesClient, /function TablePlayerCardZoom[\s\S]*?<TouchlineCardZoom/);
  assert.match(tablesClient, /buildTouchlinePlayerCardZoomDetails/);
  assert.match(tablesClient, /showSocialMetrics=\{expanded\}/);
  assert.doesNotMatch(tablesClient, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(tablesCss, /\.pitchRenderedCard/);
  assert.doesNotMatch(tablesClient, /playerList|playerRankCardButton/);
});

test("dedicated player-card ranking reuses the shared zoom and keeps compact cards free of internal controls", () => {
  const rankingsSource = source("app/touchline-player-card-rankings/page.tsx");

  assert.match(rankingsSource, /import TouchlineCardZoom/);
  assert.match(rankingsSource, /<TouchlineCardZoom[\s\S]*?forceNeonActive/);
  assert.match(rankingsSource, /showProfileAction=\{false\}[\s\S]*?showSocialMetrics=\{false\}/);
  assert.match(rankingsSource, /imageLoading="eager"[\s\S]*?showCardActions[\s\S]*?showProfileAction/);
  assert.match(rankingsSource, /published TouchLine cards only/);
  assert.match(rankingsSource, /Tier and card price come from the card-publication process/);
  assert.doesNotMatch(rankingsSource, /resolveTouchlineVerifiedPlayerEconomy|Market value|market value pending/);
});

test("social profile header protects the ClubOwner name from the featured card on tablets", () => {
  const socialStyles = source("components/touchline/social/TouchlineSocial.module.css");

  assert.match(socialStyles, /@media \(min-width: 721px\) and \(max-width: 820px\)/);
  assert.match(socialStyles, /grid-template-columns: 145px minmax\(0, 1fr\) minmax\(270px, 300px\)/);
  assert.match(socialStyles, /\.socialIdentity\.hasFeaturedVisual \.socialName h1 \{[\s\S]*font-size: clamp\(28px, 4vw, 34px\)/);
});

test("athlete feed publishes the canonical card instead of a detached frame image", () => {
  const playerSource = source("app/touchline-players/[player]/page.tsx");
  const socialCardSection = playerSource.slice(
    playerSource.indexOf("const socialCardVisual"),
    playerSource.indexOf("const playerSocialPosts"),
  );

  assert.match(socialCardSection, /<TouchlineCardZoom/);
  assert.match(socialCardSection, /forceNeonActive/);
  assert.match(socialCardSection, /showProfileAction=\{false\}/);
  assert.match(socialCardSection, /showSocialMetrics=\{false\}/);
  assert.match(playerSource, /visual: socialCardVisual\(/);
  assert.doesNotMatch(playerSource, /visualImageUrl: tier\.frameUrl/);
  assert.match(playerSource, /const tierDisplayName = tier[\s\S]*?touchlineCardTierName\(tier\.key, locale\)/);
  assert.match(playerSource, /loadTouchlinePublishedCardPresentations/);
  assert.match(playerSource, /resolveTouchlineCanonicalPublicPlayerProfile/);
  assert.match(playerSource, /const editorialCard = canonicalResolution\?\.editorialCard\s*\?\? \(canonicalPlayerId && publishedCards \? publishedCards\.get\(canonicalPlayerId\) \?\? null : null\)/);
  assert.doesNotMatch(playerSource, /touchlinePublicCardStatusLabel/);
  assert.doesNotMatch(playerSource, /value: tier\.label/);
  assert.match(playerSource, /Sapphire Blue|tierDisplayName/);
  assert.doesNotMatch(playerSource, /Card available to contract on TouchLine/);
  assert.match(playerSource, /Official player data updated/);
});

test("official player profiles reject URL preview tiers while explicit local demos remain isolated", () => {
  const playerSource = source("app/touchline-players/[player]/page.tsx");

  assert.match(playerSource, /const \{ card, exactPlayer, club, isLocalCard \} = profile/);
  assert.match(playerSource, /const previewTier = !officialLookup\.providerPlayerId && isLocalCard && process\.env\.NODE_ENV !== "production"/);
  assert.match(playerSource, /if \(previewTier\) \{[\s\S]*?exactPlayer\.cardTier = previewTier\.key/);
  assert.match(playerSource, /rankingMode=\{previewTier \? "preview" : "live"\}/);
});

test("Market Transfer uses football selection language and official TouchLine money marks", () => {
  const translations = source("lib/touchlineArena/i18n.ts");
  const marketMarks = source("components/touchline/market/TouchlineMarketMarks.tsx");
  assert.match(translations, /marketCart: "Contratações"/);
  assert.match(translations, /checkoutCart: "Contratar selecionados"/);
  assert.match(translations, /addToCart: "Contratar atleta"/);
  assert.doesNotMatch(translations, /Carrinho ocupa/);
  assert.match(marketMarks, /Moeda TouchLine TC/);
  assert.match(marketMarks, /Três atletas selecionados/);
  assert.match(marketMarks, /#ffd75c/);
});

test("ClubHub owns one fixture-scoped line-up surface without cross-product distribution claims", () => {
  const clubHubPage = source("app/touchline-clubs/[club]/page.tsx");
  const lineupComponent = source("components/touchline/ClubHubOfficialLineup.tsx");

  assert.match(clubHubPage, /buildTouchLineClubMatchdayPresentation/);
  assert.match(clubHubPage, /ClubHubOfficialLineup/);
  assert.match(lineupComponent, /Matchday line-up/);
  assert.doesNotMatch(lineupComponent, /TouchLine Arena/);
  assert.doesNotMatch(lineupComponent, /ClubOwners/);
  assert.doesNotMatch(lineupComponent, /Player Feeds/);
  assert.match(lineupComponent, /Prévia do elenco/);
});

test("coach uses official coach art with player-card nationality and club identity", () => {
  const coachRules = source("lib/touchlineArena/coach-card.ts");
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");
  const coachCardStyles = source("components/touchline/cards/TouchlineCoachCard.module.css");
  const coachEditor = source("app/visual-qa/coach-card/page.tsx");

  assert.match(coachRules, /TOUCHLINE_COACH_CARD_APPAREL = "official-coach-photo-art"/);
  assert.match(coachRules, /TOUCHLINE_COACH_RANKING_SIZE = 20/);
  assert.match(coachRules, /cardTier: TouchlineCardTierKey/);
  assert.doesNotMatch(coachRules, /black-gem|club-owner-transparent-preview/);
  assert.match(coachRules, /cards\/coaches\/02_red_coach\.png/);
  assert.match(coachRules, /cards\/coaches\/07_golddiamond_coach\.png/);
  assert.match(coachCard, /data-coach-card-art="official-coach-tier"/);
  assert.match(coachCard, /touchlineCoachCardArtForTier/);
  assert.doesNotMatch(coachCard, /<CoachKitIdentity/);
  assert.match(coachCard, /Nacionalidade/);
  assert.match(coachCard, /Clube atual/);
  assert.match(coachCard, /coachDisplayName/);
  assert.match(coachCard, /data-coach-name-fit/);
  assert.match(coachCard, /<span>\{clubName\}<\/span>/);
  assert.match(coachCard, /editableLayerProps\("nationality", "Nacionalidade"\)/);
  assert.match(coachCard, /editableLayerProps\("clubCrest", "Escudo do clube"\)/);
  assert.match(coachCard, /styles\.clubBadge/);
  assert.match(coachEditor, /editableLayers=\{\["nameplate", "stats"\]\}/);
  assert.doesNotMatch(coachEditor, /editableLayers=\{\["clubCrest"\]\}/);
  assert.match(coachEditor, /Editor simples · arraste os dois blocos dentro do card/);
  assert.doesNotMatch(coachEditor, /Colocar no canto direito/);
  assert.doesNotMatch(coachEditor, /Horizontal do escudo/);
  assert.doesNotMatch(coachEditor, /Vertical do escudo/);
  assert.doesNotMatch(coachEditor, /TOUCHLINE_COACH_LAYER_KEYS/);
  assert.doesNotMatch(coachCard, /styles\.clubIdentity/);
  assert.doesNotMatch(coachCard, /className=\{styles\.topline\}/);
  assert.doesNotMatch(coachCard, /<footer className=\{styles\.footer\}/);
  assert.match(coachCard, /data-card-tier=\{slot\.cardTier\}/);
  assert.match(coachCard, /data-card-neon="permanent-tier-art"/);
  assert.match(coachCard, /data-neon-active=\{forceNeonActive \|\| isNeonActive \? "true" : "false"\}/);
  assert.match(coachCard, /touchline-card-neon-select/);
  assert.doesNotMatch(coachCard, /CoachPortrait|coachPhoto/);
  assert.doesNotMatch(coachCard, /touchlineArenaClubTemplateForTierPreview/);
  assert.match(coachCardStyles, /--coach-touchline: #a8ff38/);
  assert.match(coachCardStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(coachCardStyles, /\.nameplate::before/);
  assert.match(coachCardStyles, /\.nameplate \{[\s\S]*?contain: layout;/);
  assert.match(coachCardStyles, /\.nameplate\[data-coach-name-fit="long"\] strong/);
  assert.match(coachCardStyles, /\.nameplate > span \{[\s\S]*?text-overflow: clip;/);
  assert.match(coachCardStyles, /\.inner \{[\s\S]*?background: transparent;/);
  assert.match(coachCardStyles, /\.inner::before \{[\s\S]*?display: none;/);
  assert.doesNotMatch(coachCardStyles, /\.inner \{[\s\S]*?rgba\(1, 5, 7, \.82\)/);
  assert.doesNotMatch(coachCardStyles, /--touchline-card-frame-neon-filter/);
  assert.doesNotMatch(coachCardStyles, /--touchline-card-neon-active-filter/);
  assert.match(coachCardStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.shell:hover[\s\S]*?transform: none !important/);
  assert.match(coachCardStyles, /\.shell\[data-coach-card-editable="true"\] \[data-coach-layer\] \{[\s\S]*?pointer-events: auto;/);
  assert.match(coachCardStyles, /\.shell\[data-coach-card-editable="true"\] \[data-coach-layer\] \{[\s\S]*?outline: 0;/);
  assert.match(coachCardStyles, /\.clubBadge \[data-touchline-card-crest-host="true"\] \{[\s\S]*?width: var\(--coach-crest-size, 132px\)/);
  assert.match(coachCardStyles, /\.clubBadge \[data-touchline-card-crest-host="true"\] > img \{[\s\S]*?width: var\(--coach-crest-size, 132px\)/);
  assert.doesNotMatch(coachCardStyles, /\.clubBadge \[data-touchline-card-crest-host="true"\] \{[\s\S]*?96px/);
  assert.doesNotMatch(coachEditor, /label="Tamanho do escudo"/);
  assert.match(coachEditor, /1\. Nome \+ clube/);
  assert.match(coachEditor, /2\. Dados técnicos/);
  assert.match(coachEditor, /editable/);
  assert.match(coachEditor, /Salvar como padrão/);
  assert.match(coachEditor, /TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY/);
  assert.doesNotMatch(coachEditor, /Foto opcional|type="file"|Formação/);
});

test("operational card selectors never nest social or profile controls inside buttons", () => {
  const exactCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  assert.match(exactCard, /clubHubHref && !isEditable && showProfileAction/);
});

test("Arena compact cards keep one click target, one selected neon and a compact match badge", () => {
  const exactCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  assert.match(exactCard, /forceNeonActive \|\| isNeonActive/);
  assert.match(exactCard, /data-arena-match-rating="true"[\s\S]*?top: -16,[\s\S]*?minWidth: 24,[\s\S]*?height: 16,[\s\S]*?padding: "1px 5px"/);
  assert.match(exactCard, /data-arena-match-rating="true"[\s\S]*?<strong[\s\S]*?fontSize: 9,[\s\S]*?fontVariantNumeric: "tabular-nums"/);
  assert.match(exactCard, /const compactPrimaryLabel = cardLabels\.totalRating/);
  assert.match(exactCard, /const compactPrimaryValue = totalRatingText/);
});

test("Arena coach uses compact typography and an isolated fullscreen spotlight", () => {
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");
  const coachStyles = source("components/touchline/cards/TouchlineCoachCard.module.css");

  assert.match(coachCard, /displayMode\?: "default" \| "compact"/);
  assert.match(coachCard, /data-coach-card-display=\{displayMode\}/);
  assert.match(coachStyles, /data-coach-card-display="compact"[\s\S]*?\.stat \{[\s\S]*?min-height: 0/);
});

test("the Market presents one canonical starting XI", () => {
  const gameweekSnapshot = source("app/fantasy/FantasyGameweekClient.tsx");

  assert.match(gameweekSnapshot, /selection: selections\.find\(\(entry\) => entry\.slotId === slot\.id\)/);
  assert.match(gameweekSnapshot, /data-market-starting-xi="true"/);
  assert.match(gameweekSnapshot, /\{selectedCount\}\/11/);
  assert.doesNotMatch(gameweekSnapshot, /Nenhum banco Fantasy|No Fantasy bench/);
});

test("ClubHub honours use complete discrete pages rather than a continuous partial-card loop", () => {
  const trophyCarousel = source("components/touchline/ClubTrophyCarousel.tsx");
  const clubHubPage = source("app/touchline-clubs/[club]/page.tsx");

  assert.match(trophyCarousel, /function splitIntoPages/);
  assert.match(trophyCarousel, /const isCarousel = pages\.length > 1/);
  assert.match(trophyCarousel, /className=\{`club-hub-honour-row \$\{isCarousel \? "is-carousel" : "is-static"\}`\}/);
  assert.match(trophyCarousel, /setPhase\("exit"\)[\s\S]*?setPhase\("empty"\)[\s\S]*?setActivePage[\s\S]*?setPhase\("enter"\)/);
  assert.match(trophyCarousel, /\{phase !== "empty" \?/);
  assert.doesNotMatch(trophyCarousel, /track\.animate|\[0, 1, 2, 3\]|translate3d\(\$\{-setWidth\}/);
  assert.match(clubHubPage, /\.club-hub-honour-page \{[\s\S]*?grid-template-columns: repeat\(var\(--club-hub-trophy-page-columns\)/);
  assert.match(clubHubPage, /\.club-hub-honour-page\[data-transition-phase="exit"\][\s\S]*?opacity: 0/);
  const honoursStyles = clubHubPage.slice(clubHubPage.indexOf(".club-hub-honour-viewport"), clubHubPage.indexOf(".club-hub-honour-arrow"));
  assert.doesNotMatch(honoursStyles, /mask-image|club-hub-honour-track|club-hub-honour-set/);
});

test("TouchLine tables enlarged cards reuse the premium identity-and-performance zoom", () => {
  const tablesClient = source("app/touchline-tables/touchline-tables-client.tsx");
  assert.match(tablesClient, /touchlineCardTierName/);
  assert.match(tablesClient, /buildTouchlinePlayerCardZoomDetails/);
  assert.match(tablesClient, /buildTouchlineVerifiedMatchFactFields/);
  assert.match(tablesClient, /Nota total/);
  assert.match(tablesClient, /Nota da última partida/);
  assert.doesNotMatch(tablesClient, /zoomBackdrop|zoomContent|useTouchlineDialog/);
});
