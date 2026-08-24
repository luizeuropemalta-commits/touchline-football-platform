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
  const crestTrace = source("components/touchline/cards/TouchlineClubCrestPerimeterTrace.tsx");
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const traceCss = globalCss.slice(
    globalCss.indexOf('[data-touchline-card-neon-trace="true"]'),
    globalCss.indexOf('.touchline-card-surface[data-card-tier="neutral"][data-card-classification="pending"]'),
  );

  assert.match(exactCard, /data-card-neon="permanent-tier-art"/);
  assert.match(exactCard, /TouchLine England League Stats/);
  assert.doesNotMatch(exactCard, /TouchLine Arena Points/);
  assert.match(exactCard, /formatTouchlineEditorialCardPrice/);
  assert.doesNotMatch(exactCard, /formatTouchlineContractedCommercialCardPrice/);
  assert.match(exactCard, /<span>\{compactSecondaryLabel\}<\/span>/);
  assert.match(exactCard, /data-card-tier=\{marketTier\?\.key \?\? "neutral"\}/);
  assert.match(exactCard, /data-card-editorial-state=\{reviewRequired \? "review_required" : editorialCard \? "published" : "unpublished"\}/);
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
  assert.match(exactCard, /<TouchlineCardPerimeterTrace\s*\/>/);
  assert.match(coachCard, /<TouchlineCardPerimeterTrace\s*\/>/);
  assert.match(exactCard, /TouchlineClubCrestPerimeterTrace/);
  assert.match(coachCard, /TouchlineClubCrestPerimeterTrace/);
  assert.match(exactCard, /data-touchline-card-crest-trace-host="true"/);
  assert.match(coachCard, /data-touchline-card-crest-trace-host="true"/);
  assert.match(exactCard, /data-touchline-card-crest="true"/);
  assert.match(coachCard, /data-touchline-card-crest="true"/);
  assert.match(crestTrace, /data-touchline-card-crest-trace="true"/);
  assert.match(crestTrace, /aria-hidden="true"/);
  assert.match(crestTrace, /focusable="false"/);
  assert.match(crestTrace, /pathLength="100"/);
  assert.match(crestTrace, /fill="none"/);
  assert.match(crestTrace, /r="46\.5"/);
  assert.doesNotMatch(crestTrace, /mask|clip-path|filter:|touch-action:\s*none/);
  assert.match(globalCss, /\[data-touchline-card-crest-trace="true"\][\s\S]*?pointer-events: none/);
  assert.match(globalCss, /\[data-touchline-card-crest-trace-run="true"\][\s\S]*?animation: touchline-card-perimeter-trace 5\.8s/);
  assert.match(globalCss, /\[data-touchline-card-crest="true"\][\s\S]*?--touchline-club-crest-color/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-touchline-card-neon-trace-run="true"\][\s\S]*?animation: none !important/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-touchline-card-neon-trace-base="true"\][\s\S]*?opacity: \.72/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-touchline-card-crest-trace-run="true"\][\s\S]*?animation: none !important/);
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
  assert.match(arenaClient, /arena-live-moving-card[\s\S]*?data-touchline-card-crest-trace-run="true"[\s\S]*?animation: none !important/);
  assert.match(arenaClient, /arena-live-coach-card[\s\S]*?data-touchline-card-crest-trace-run="true"[\s\S]*?animation: none !important/);
  assert.match(arenaClient, /data-touchline-card-crest-trace-run="true"\]\) \{[\s\S]*?will-change: auto !important/);
});

test("card controls stay inside the master safe zone and contracting stays outside the artwork", () => {
  const layout = JSON.parse(source("public/touchlineArena/card-layouts/master-shirt-back-layout.json"));
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const zoomUsages = [
    source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx"),
    source("app/touchline-clubs/[club]/page.tsx"),
    source("app/touchline-player-card-rankings/page.tsx"),
    source("app/touchline-players/[player]/page.tsx"),
    source("components/touchline/ClubHubOfficialLineup.tsx"),
  ].join("\n");

  assert.ok(layout.layout.shareAction.x >= 58);
  assert.ok(layout.layout.profileAction.x + (118 * layout.layout.profileAction.scale) <= 372);
  assert.ok(layout.layout.followAction.x >= 58);
  assert.ok(layout.layout.likeAction.x + (118 * layout.layout.likeAction.scale) <= 372);
  assert.match(zoom, /<div className=\{styles\.expandedCard\} data-card-zoom="expanded">/);
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
  assert.match(zoomUsages, /tierLabel=\{touchlineCardTierName/);
});

test("ClubOwner identity has no cover and opts into its fixed-green circular perimeter trace", () => {
  const profilePage = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const social = source("components/touchline/social/TouchlineSocial.tsx");
  const socialCss = source("components/touchline/social/TouchlineSocial.module.css");
  const trace = source("components/touchline/social/ClubOwnerPortraitPerimeterTrace.tsx");

  assert.match(profilePage, /showCover=\{false\}/);
  assert.match(profilePage, /clubOwnerPortraitTrace/);
  assert.match(social, /ClubOwnerPortraitPerimeterTrace/);
  assert.match(trace, /data-club-owner-portrait-neon-trace="true"/);
  assert.match(socialCss, /--club-owner-portrait-trace-color: #a3ff12/);
  assert.match(socialCss, /@keyframes club-owner-portrait-perimeter-trace/);
  assert.match(socialCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/);
});

test("ClubOwner keeps a clean identity layout on every device and scales its feature only on mobile", () => {
  const profilePage = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const socialCss = source("components/touchline/social/TouchlineSocial.module.css");

  assert.match(socialCss, /\.identityOnly \.socialName h1 \{[\s\S]*?white-space: nowrap/);
  assert.match(socialCss, /\.identityOnly \.avatarFooter \{[\s\S]*?translateY\(10%\)/);
  assert.match(socialCss, /@media \(max-width: 720px\)[\s\S]*?\.identityOnly \.socialName h1 \{ font-size: 37\.8px/);
  assert.match(profilePage, /@media \(max-width: 760px\)[\s\S]*?\.club-owner-best-player-card \{[\s\S]*?width: min\(217px, 70vw\)/);
  assert.match(socialCss, /@media \(max-width: 720px\)[\s\S]*?\.identityOnly \.socialIdentity\.hasFeaturedVisual \{[\s\S]*?grid-template-columns: 112px minmax\(0, 1fr\)/);
  assert.match(socialCss, /\.socialIdentity\.hasFeaturedVisual \.socialAvatar \{[\s\S]*?width: 112px;[\s\S]*?height: 112px/);
});

test("ClubHub line-up contains its wide desktop pitch and fits every player on mobile", () => {
  const clubHubPage = source("app/touchline-clubs/[club]/page.tsx");
  const squadGrid = source("components/touchline/ClubHubSquadGrid.tsx");
  const lineupComponent = source("components/touchline/ClubHubOfficialLineup.tsx");
  const lineupCss = source("components/touchline/ClubHubOfficialLineup.module.css");
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");

  assert.match(clubHubPage, /\.club-hub-shell \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(clubHubPage, /\.club-hub-shell > \* \{[\s\S]*?min-width: 0/);
  assert.match(lineupCss, /\.pitchViewport \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(lineupCss, /@media \(max-width: 720px\)[\s\S]*?\.pitch \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?--lineup-pitch-core-height: clamp\(610px, 154vw, 720px\);[\s\S]*?min-height: calc\(var\(--lineup-pitch-core-height\) \+ var\(--lineup-safe-top-inset\)\)/);
  assert.match(lineupCss, /@media \(max-width: 720px\)[\s\S]*?\.player \{[\s\S]*?width: 58px;[\s\S]*?--touchline-card-static-scale: \.1348837209/);
  assert.match(lineupCss, /@media \(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 520px\)/);
  assert.match(lineupCss, /max-height: 520px\)[\s\S]*?\.pitchViewport \{[\s\S]*?overflow: hidden/);
  assert.match(lineupCss, /max-height: 520px\)[\s\S]*?\.pitch \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?--lineup-pitch-core-height: 540px;[\s\S]*?min-height: calc\(var\(--lineup-pitch-core-height\) \+ var\(--lineup-safe-top-inset\)\)/);
  assert.match(lineupCss, /@media \(min-width: 721px\) and \(max-width: 1100px\) and \(min-height: 521px\)/);
  assert.match(squadGrid, /<TouchlineCardZoom/);
  assert.match(lineupComponent, /<TouchlineCardZoom/);
  assert.match(lineupComponent, /showSocialMetrics=\{false\}/);
  assert.match(squadGrid, /className="club-hub-card-meta"/);
  assert.doesNotMatch(clubHubPage, /t\("topClubAssets"\)/);
  assert.doesNotMatch(clubHubPage, /\.club-hub-card div \{/);
  assert.doesNotMatch(clubHubPage, /\/market-transfer\?\$\{localeQuery\}/);
  assert.match(clubHubPage, /@media \(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 520px\)[\s\S]*?\.club-hub-board \{[\s\S]*?repeat\(2/);
  assert.match(cardZoom, /createPortal\(/);
  assert.match(cardZoom, /document\.body/);
});

test("ClubOwner profile keeps one source for each summary", () => {
  const profilePage = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");

  assert.doesNotMatch(profilePage, /stats=\{ownerStats\}/);
  assert.doesNotMatch(profilePage, /className="club-owner-profile-club-control"/);
  assert.match(profilePage, /className="club-owner-profile-collection-details"/);
  assert.match(profilePage, /Posição do ClubOwner/);
});

test("Arena places the ClubOwner profile first in both menus", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const quickMenuStart = arenaClient.indexOf('className="arena-quick-links"');
  const sectionMenuStart = arenaClient.indexOf('<nav className="arena-club-sections"');

  assert.ok(quickMenuStart >= 0);
  assert.ok(sectionMenuStart >= 0);
  assert.match(arenaClient.slice(quickMenuStart, quickMenuStart + 720), /touchlineClubOwnerProfileHref\(siteLanguage\)[\s\S]*?ClubOwner/);
  assert.match(arenaClient.slice(sectionMenuStart, sectionMenuStart + 420), /touchlineClubOwnerProfileHref\(siteLanguage\)[\s\S]*?t\("profile"\)/);
  assert.match(arenaClient.slice(quickMenuStart, quickMenuStart + 900), /ClubOwner[\s\S]*?allClubsHubHref[\s\S]*?quickSubstitution/);
  assert.match(arenaClient.slice(sectionMenuStart, sectionMenuStart + 900), /t\("profile"\)[\s\S]*?allClubsHubHref[\s\S]*?t\("clubHub"\)/);
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

test("ClubOwner Best of the Week follows the latest round and preserves any winning tier", () => {
  const profilePage = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const tablesClient = source("app/touchline-tables/touchline-tables-client.tsx");

  assert.match(profilePage, /loadTouchLineActiveRanking\(\)/);
  assert.match(profilePage, /seasonTotalRating: competition\.totalRating/);
  assert.match(profilePage, /seasonTotalRating/);
  assert.doesNotMatch(profilePage, /roundPoints/);
  assert.match(profilePage, /Best of the Week/);
  assert.match(profilePage, /Maior nota acumulada entre os cards publicados/);
  assert.match(profilePage, /backgroundAccent=\{bestPlayerPalette\.accent\}/);
  assert.match(tablesClient, /squadCardToExactPlayer\(card, \{ useSuppliedTier: true \}\)/);
  assert.doesNotMatch(tablesClient, /TOUCHLINE_CARD_STARTING_TIER_KEY/);
});

test("Best of the Week receives a large readable promotion stage", () => {
  const profilePage = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const socialCss = source("components/touchline/social/TouchlineSocial.module.css");
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");

  assert.match(profilePage, /width: min\(264px, 100%\)/);
  assert.match(profilePage, /--touchline-card-static-scale: \.85/);
  assert.match(profilePage, /width: min\(1640px, calc\(100vw - 32px\)\)/);
  assert.match(profilePage, /<TouchlineCardZoom/);
  assert.match(cardZoom, /onClick=\{\(\) => setIsOpen\(false\)\}/);
  assert.match(cardZoom, /if \(\(event\.target as HTMLElement\)\.closest\("a,button"\)\) return;[\s\S]*?setIsOpen\(false\)/);
  assert.match(socialCss, /min-height: 620px/);
  assert.match(socialCss, /minmax\(370px, 430px\)/);
});

test("best-player rankings use player cards and one reversible zoom on every device", () => {
  const tablesClient = source("app/touchline-tables/touchline-tables-client.tsx");
  const tablesCss = source("app/touchline-tables/touchline-tables.module.css");
  const playerRankStart = tablesClient.indexOf('className={styles.playerList}');
  const playerRankSource = tablesClient.slice(playerRankStart, playerRankStart + 1700);

  assert.ok(playerRankStart >= 0);
  assert.match(playerRankSource, /playerRankCardButton/);
  assert.match(playerRankSource, /<TablePlayerCardZoom card=\{card\}/);
  assert.doesNotMatch(playerRankSource, /<ClubLogo/);
  assert.match(tablesClient, /import TouchlineCardZoom/);
  assert.match(tablesClient, /function TablePlayerCardZoom[\s\S]*?<TouchlineCardZoom/);
  assert.match(tablesClient, /buildTouchlinePlayerCardZoomDetails/);
  assert.match(tablesClient, /showSocialMetrics=\{expanded\}/);
  assert.doesNotMatch(tablesClient, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(tablesCss, /\.pitchRenderedCard/);
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

test("ClubOwner feed promotes the owned card and keeps compact controls outside it", () => {
  const socialSource = source("components/touchline/social/TouchlineSocial.tsx");
  const socialStyles = source("components/touchline/social/TouchlineSocial.module.css");
  const ownerSource = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");

  assert.match(socialSource, /visual\?: React\.ReactNode/);
  assert.match(socialSource, /post\.visual \|\| post\.visualValue \|\| post\.visualImageUrl/);
  assert.match(socialSource, /styles\.postCardVisual/);
  assert.match(socialStyles, /\.postVisualCore \{[^}]*width: 100%/);
  assert.match(ownerSource, /visual:\s*\(\s*<TouchlineCardZoom/);
  assert.match(ownerSource, /showProfileAction=\{false\}[\s\S]*showSocialMetrics=\{false\}/);
  assert.doesNotMatch(ownerSource, /visualImageUrl:\s*club\?\.logoUrl/);
});

test("ClubOwner showcase cards reuse zoom and keep profile navigation outside the card", () => {
  const ownerSource = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");
  const showcase = ownerSource.slice(
    ownerSource.indexOf('className="club-owner-profile-featured-cards"'),
    ownerSource.indexOf('className="club-owner-profile-collection-details"'),
  );

  assert.match(showcase, /<TouchlineCardZoom/);
  assert.match(showcase, /forceNeonActive/);
  assert.match(showcase, /<a href=\{profileHref\}>\{card\.shortName\}<\/a>/);
  assert.doesNotMatch(showcase, /showSocialMetrics(?:\s|\/|>)/);
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
  assert.match(playerSource, /const editorialCard = canonicalPlayerId/);
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
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const translations = source("lib/touchlineArena/i18n.ts");
  const marketMarks = source("components/touchline/market/TouchlineMarketMarks.tsx");

  assert.match(arenaClient, /marketUi\.squadValue/);
  assert.match(arenaClient, /TouchlineCoinMark/);
  assert.match(arenaClient, /TouchlineSelectedPlayersMark/);
  assert.match(arenaClient, /className="team-builder-gallery-card"/);
  // The card gallery is the only compact selection surface; details are opened
  // in the shared enlarged card overlay instead of a duplicate dossier.
  assert.match(arenaClient, /setMarketSpotlightPlayerId\(fieldId\)/);
  assert.match(arenaClient, /<TouchlineCardZoomDetailsPanel details=\{marketSpotlightZoomDetails\}/);
  assert.match(arenaClient, /Contrato · 1 temporada/);
  assert.doesNotMatch(arenaClient, /<ShoppingCart/);
  assert.match(translations, /marketCart: "Contratações"/);
  assert.match(translations, /checkoutCart: "Contratar selecionados"/);
  assert.match(translations, /addToCart: "Contratar atleta"/);
  assert.doesNotMatch(translations, /Carrinho ocupa/);
  assert.match(marketMarks, /Moeda TouchLine TC/);
  assert.match(marketMarks, /Três atletas selecionados/);
  assert.match(marketMarks, /#ffd75c/);
});

test("Market Transfer remains readable without horizontal clipping on compact landscape phones", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");

  assert.match(
    arenaClient,
    /@media \(orientation: landscape\) and \(min-width: 600px\) and \(max-width: 900px\) and \(max-height: 520px\)/,
  );
  assert.match(
    arenaClient,
    /grid-template-columns: clamp\(100px, 15\.2vw, 128px\) minmax\(0, 1fr\) clamp\(150px, 23\.2vw, 196px\)/,
  );
  assert.match(
    arenaClient,
    /\.arena-action-panel-market \.team-builder-player-list \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?max-height: none/,
  );
  assert.match(
    arenaClient,
    /\.arena-action-panel-market \.team-builder-player-copy strong \{[\s\S]*?text-overflow: clip;[\s\S]*?-webkit-line-clamp: 2/,
  );
  assert.match(arenaClient, /\.arena-action-panel-market \.team-builder-preview-card \{[\s\S]*?width: min\(150px, 86%\)/);
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
  const arenaClient = source("app/arena/ArenaClient.tsx");
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
  assert.match(coachCardStyles, /\.clubBadge \[data-touchline-card-crest-trace-host="true"\] \{[\s\S]*?width: var\(--coach-crest-size, 132px\)/);
  assert.match(coachCardStyles, /\.clubBadge \[data-touchline-card-crest-trace-host="true"\] > img \{[\s\S]*?width: var\(--coach-crest-size, 132px\)/);
  assert.doesNotMatch(coachCardStyles, /\.clubBadge \[data-touchline-card-crest-trace-host="true"\] \{[\s\S]*?96px/);
  assert.doesNotMatch(coachEditor, /label="Tamanho do escudo"/);
  assert.match(coachEditor, /1\. Nome \+ clube/);
  assert.match(coachEditor, /2\. Dados técnicos/);
  assert.doesNotMatch(arenaClient, /className=\{`arena-coach-technical-area/);
  assert.match(arenaClient, /className="arena-quick-sub-coach"/);
  assert.match(arenaClient, /arena-coach-spotlight/);
  assert.match(arenaClient, /<TouchlineCoachCard/);
  assert.doesNotMatch(arenaClient, /arena-club-owner-card/);
  assert.match(coachEditor, /editable/);
  assert.match(coachEditor, /Salvar como padrão/);
  assert.match(coachEditor, /TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY/);
  assert.doesNotMatch(coachEditor, /Foto opcional|type="file"|Formação/);
});

test("bench panel always opens at a complete first row and snaps card rows", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");

  assert.match(arenaClient, /benchListShellRef\.current\?\.scrollTo\(\{ top: 0/);
  assert.match(arenaClient, /scroll-snap-type: y proximity/);
  assert.match(arenaClient, /\.bench-list > button,/);
  assert.match(arenaClient, /scroll-snap-align: start/);
});

test("arena panel follows the current URL and closes stale Meu Clube content", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");

  assert.match(arenaClient, /parseTouchlineArenaPanel\(new URLSearchParams\(window\.location\.search\)\.get\("panel"\)\)/);
  assert.match(arenaClient, /window\.addEventListener\("popstate", syncArenaPanelFromUrl\)/);
  assert.match(arenaClient, /setActiveArenaPanel\(panel === "live" \? null : panel\)/);
  assert.match(arenaClient, /if \(panel !== "bench"\) setReplacementTargetId\(null\)/);
});

test("operational card selectors never nest social or profile controls inside buttons", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const exactCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const socialDisabled = arenaClient.match(/showSocialMetrics=\{false\}/g) ?? [];
  const profileDisabled = arenaClient.match(/showProfileAction=\{false\}/g) ?? [];

  assert.ok(socialDisabled.length >= 3);
  assert.ok(profileDisabled.length >= 3);
  assert.match(exactCard, /clubHubHref && !isEditable && showProfileAction/);
});

test("Arena compact cards keep one click target, one selected neon and a compact match badge", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const exactCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const fieldCardStart = arenaClient.indexOf('<span className="arena-field-card">');
  const fieldCardSource = arenaClient.slice(fieldCardStart, fieldCardStart + 900);
  const spotlightStart = arenaClient.indexOf('className="arena-player-spotlight-card"');
  const spotlightSource = arenaClient.slice(spotlightStart, spotlightStart + 700);

  assert.ok(fieldCardStart >= 0);
  assert.match(fieldCardSource, /showMatchRating/);
  assert.match(fieldCardSource, /showProfileAction=\{false\}/);
  assert.match(fieldCardSource, /showSocialMetrics=\{false\}/);
  assert.match(fieldCardSource, /forceNeonActive=\{selectedPlayerId === player\.id\}/);
  assert.match(exactCard, /forceNeonActive \|\| isNeonActive/);
  assert.match(exactCard, /data-arena-match-rating="true"[\s\S]*?top: -16,[\s\S]*?minWidth: 24,[\s\S]*?height: 16,[\s\S]*?padding: "1px 5px"/);
  assert.match(exactCard, /data-arena-match-rating="true"[\s\S]*?<strong[\s\S]*?fontSize: 9,[\s\S]*?fontVariantNumeric: "tabular-nums"/);
  assert.match(exactCard, /const compactPrimaryLabel = cardLabels\.totalRating/);
  assert.match(exactCard, /const compactPrimaryValue = totalRatingText/);
  assert.ok(spotlightStart >= 0);
  assert.match(spotlightSource, /showProfileAction[\s\S]*?forceNeonActive/);
  assert.match(arenaClient, /arena-player-spotlight-meta/);
  assert.match(arenaClient, /arena-player-spotlight-contract/);
  assert.match(arenaClient, /touchlineArenaContractHref/);
  assert.match(arenaClient, /Contrato · 1 temporada/);
  assert.match(arenaClient, /"Contratar"/);
  assert.match(arenaClient, /touchlineCardTierName/);
  assert.doesNotMatch(arenaClient, />Comprar</);
  assert.match(arenaClient, /arena-player-spotlight-backdrop[\s\S]*?setSpotlightPlayerId\(null\);[\s\S]*?setSelectedPlayerId\(null\)/);
});

test("Arena enlarges match points by twenty percent on desktop only", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  assert.match(arenaClient, /@media \(min-width: 1101px\) \{[\s\S]*?\[data-arena-match-points="true"\][\s\S]*?scale\(1\.2\)/);
});

test("coach stays centered in the Quick Sub bench and never overlays the formation", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");

  assert.doesNotMatch(arenaClient, /className=\{`arena-coach-technical-area/);
  assert.match(arenaClient, /className="arena-quick-sub-coach"/);
  assert.match(arenaClient, /\.arena-quick-sub-coach \{[\s\S]*?order: 5;[\s\S]*?min-height: 136px/);
  assert.match(arenaClient, /\.arena-quick-sub-coach > span \{[\s\S]*?height: 108px/);
  assert.match(arenaClient, /\.arena-action-panel-bench \.training-center-coach \{[\s\S]*?grid-column: 3;[\s\S]*?grid-template-columns: 18px minmax\(0, 1fr\);[\s\S]*?justify-self: end/);
  assert.match(arenaClient, /\.arena-action-panel-bench \.training-center-coach-card \{[\s\S]*?width: 18px/);
});

test("Arena coach uses compact typography and an isolated fullscreen spotlight", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");
  const coachStyles = source("components/touchline/cards/TouchlineCoachCard.module.css");

  assert.match(coachCard, /displayMode\?: "default" \| "compact"/);
  assert.match(coachCard, /data-coach-card-display=\{displayMode\}/);
  assert.match(arenaClient, /displayMode="compact"/);
  assert.match(coachStyles, /data-coach-card-display="compact"[\s\S]*?\.stat \{[\s\S]*?min-height: 0/);
  assert.match(
    arenaClient,
    /data-coach-spotlight=\{isCoachSpotlightOpen \|\| selectedLiveCoachData \? "open" : "closed"\}/,
  );
  assert.match(arenaClient, /\.arena-coach-spotlight \{[\s\S]*?position: fixed;[\s\S]*?isolation: isolate/);
  assert.match(arenaClient, /data-coach-spotlight="open"\] \.field-player-layer[\s\S]*?visibility: hidden/);
  assert.match(arenaClient, /\.arena-stage:fullscreen \.arena-coach-spotlight[\s\S]*?z-index: 2147483646/);
});

test("ClubOwner headquarters centralizes squad decisions and Arena keeps substitution simple", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");
  const clubOwner = source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx");

  assert.match(clubOwner, /className="club-owner-squad-pitch"/);
  assert.match(clubOwner, /startingXiCards\.map/);
  assert.match(clubOwner, /allBenchCards/);
  assert.match(clubOwner, /benchPositionGroups\.map/);
  assert.match(clubOwner, /Fazer substituição/);
  assert.match(arenaClient, /draggable=\{!isLocked\}/);
  assert.match(arenaClient, /text\/touchline-bench-id/);
  assert.match(arenaClient, /data-substitution-target-id=\{player\.id\}/);
  assert.match(arenaClient, /handleBenchDrop\(player/);
  assert.match(arenaClient, /Central da partida/);
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
