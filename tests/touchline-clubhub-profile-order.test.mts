import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const leagueTable = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.tsx", import.meta.url), "utf8");
const leagueTableStyles = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.module.css", import.meta.url), "utf8");
const sectionNavigation = readFileSync(new URL("../components/touchline/club-hub/ClubHubSectionNavigation.tsx", import.meta.url), "utf8");
const sectionNavigationStyles = readFileSync(new URL("../components/touchline/club-hub/ClubHubSectionNavigation.module.css", import.meta.url), "utf8");
const officialLeagueStyles = readFileSync(new URL("../components/touchline/club-hub/ClubHubOfficialLeague.module.css", import.meta.url), "utf8");
const globalNavigationStyles = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.module.css", import.meta.url), "utf8");
const trophyCarousel = readFileSync(new URL("../components/touchline/ClubTrophyCarousel.tsx", import.meta.url), "utf8");
const technical = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url), "utf8");
const technicalStyles = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.module.css", import.meta.url), "utf8");
const outsideRoster = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.tsx", import.meta.url), "utf8");
const outsideRosterStyles = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.module.css", import.meta.url), "utf8");
const lineup = readFileSync(new URL("../lib/touchlineArena/club-lineup.ts", import.meta.url), "utf8");

function indexOfRequired(source: string, token: string) {
  const index = source.indexOf(token);
  assert.ok(index >= 0, `expected ${token}`);
  return index;
}

test("ClubHub places identity and honours before the official league area and matchday surface", () => {
  const heroStart = indexOfRequired(page, '<header className="club-hub-hero">');
  const officialLeagueStart = page.indexOf("<ClubHubOfficialLeagueSection", heroStart);
  const overviewStart = page.indexOf("<ClubHubPremiumOverviewSection", officialLeagueStart);
  const lineupStart = page.indexOf("<ClubHubLineupSection", heroStart);
  const technicalStart = page.indexOf("<ClubHubTechnicalSections", lineupStart);
  const touchlineCardsStart = page.indexOf("<ClubHubCardsSection", officialLeagueStart);
  const lineupHelperStart = indexOfRequired(page, "async function ClubHubLineupSection");
  const lineupHelperEnd = indexOfRequired(page, "async function ClubHubTechnicalSections");
  const hero = page.slice(heroStart, lineupStart);
  const lineupSection = page.slice(lineupHelperStart, lineupHelperEnd);

  assert.ok(officialLeagueStart >= 0 && overviewStart >= 0 && lineupStart >= 0 && technicalStart >= 0 && touchlineCardsStart >= 0);
  assert.match(hero, /<ClubTrophyCarousel/);
  assert.doesNotMatch(hero, /club-hub-next-match|ClubHubLiveFixtureScore/);
  assert.match(lineupSection, /matchup=\{\{/);
  assert.match(lineupSection, /fixtureId: matchSnapshot\.previewFixtureId/);
  assert.ok(heroStart < officialLeagueStart);
  assert.ok(officialLeagueStart < overviewStart);
  assert.ok(heroStart < lineupStart);
  assert.ok(officialLeagueStart < lineupStart);
  assert.ok(lineupStart < technicalStart);
  assert.ok(technicalStart < touchlineCardsStart);
  assert.doesNotMatch(hero, /Official club value|Valor oficial do clube|marketValuePending|formatCompactEuro/);
  assert.doesNotMatch(hero, /touchlineCards|touchlinePoints|squadSource|club-hub-metrics/);
  assert.doesNotMatch(hero, /market-transfer/);
});

test("ClubHub gives the reusable club hero premium motion without sacrificing navigation or reduced motion", () => {
  assert.match(page, /\.club-hub-hero-image \{[\s\S]*?animation: club-hub-stadium-breathe/);
  assert.match(page, /<svg className="club-hub-neon-frame"[\s\S]*?<rect className="club-hub-neon-trace"/);
  assert.match(page, /\.club-hub-neon-trace \{[\s\S]*?stroke: #a3ff12;[\s\S]*?stroke-dasharray: 5 95;[\s\S]*?animation: club-hub-border-sweep/);
  assert.match(page, /\.club-hub-logo-stack::before \{[\s\S]*?club-hub-crest-aura/);
  assert.doesNotMatch(page, /\.club-hub-honour:hover/);
  assert.doesNotMatch(page, /\.club-hub-honour::after/);
  assert.doesNotMatch(trophyCarousel, /<small title=\{honour\.label\}>/);
  assert.match(page, /<ClubHubSectionNavigation locale=\{locale\}/);
  assert.match(sectionNavigation, /TouchlineGlobalNavigation\.module\.css/);
  assert.match(sectionNavigation, /icon: Trophy[\s\S]*?icon: Newspaper[\s\S]*?icon: CalendarDays[\s\S]*?icon: UsersRound/);
  assert.match(sectionNavigation, /IntersectionObserver/);
  assert.match(sectionNavigation, /activeTarget/);
  assert.match(sectionNavigation, /aria-current=\{activeTarget === target \? "location" : undefined\}/);
  assert.match(sectionNavigation, /className=\{sharedLinkClassName\}/);
  assert.doesNotMatch(sectionNavigationStyles, /\.sectionLink\[data-active="true"\]/);
  assert.doesNotMatch(sectionNavigationStyles, /\.sectionLink\s*\{/);
  assert.match(globalNavigationStyles, /\.link\[aria-current="location"\]/);
  assert.match(sectionNavigation, /data-visible=\{showBackToTop\}/);
  assert.match(sectionNavigation, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" as ScrollBehavior \}\)/);
  assert.match(page, /id="club-hub-top" className="club-hub-top-anchor"/);
  assert.match(page, /index="01"[\s\S]*?index="02"/);
  assert.match(sectionNavigationStyles, /\.navigation \{[\s\S]*?position: relative[\s\S]*?width: max-content;[\s\S]*?margin: 0 auto/);
  assert.doesNotMatch(sectionNavigationStyles, /\.navigation \{[\s\S]*?position: sticky/);
  assert.match(sectionNavigationStyles, /\.backToTop \{[\s\S]*?position: fixed/);
  assert.match(sectionNavigationStyles, /\.backToTop\[data-visible="true"\]/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none !important/);
});

test("ClubHub partitions the displayed XI, official bench, and plain outside-match roster", () => {
  assert.match(page, /const displayedMatchdayPlayerIds = new Set\(matchdayPresentation\.displayedPlayerIds\.map\(String\)\)/);
  assert.match(page, /const outsideMatchdayCards = clubCards\.filter\(\(card\) => !displayedMatchdayPlayerIds\.has\(String\(card\.id\)\)\)/);
  assert.match(page, /<ClubHubOutsideMatchRoster[\s\S]*?cards=\{outsideMatchdayCards\}/);
  assert.match(page, /<ClubHubSquadGrid[\s\S]*?cards=\{outsideMatchdayCards\}/);
  assert.match(outsideRoster, /Plain public roster/);
  assert.doesNotMatch(outsideRoster, /marketValue|cardTier|cardPrice|touchlinePoints|ranking|href=|fetch\(/i);
});

test("technical area keeps a nine-card preview distinct from the official bench and embeds the coach card", () => {
  assert.match(lineup, /officialBench\.length > 0/);
  assert.match(lineup, /confirmedBenchCards\.length === officialBench\.length/);
  assert.match(lineup, /new Set\(benchIds\)\.size === benchIds\.length/);
  assert.match(lineup, /benchIds\.every\(\(id\) => !starterIds\.includes\(id\)\)/);
  assert.match(lineup, /state: hasConfirmedTechnicalTeamSheet \? "confirmed" : "awaiting_official_team_sheet"/);
  assert.match(lineup, /previewBench/);
  assert.match(lineup, /\.slice\(0, 9\)/);
  assert.match(technical, /technical\.state === "confirmed"/);
  assert.match(technical, /technical\.previewBench/);
  assert.match(technical, /TouchlineEliteExactCard/);
  assert.match(technical, /coachCard/);
  assert.match(page, /presentation="technical"/);
  assert.doesNotMatch(technical, /TOUCHLINE_LIVE_COACHES|buildMatchdayBench|create(?:Admin)?Client|supabase|fetch\(/i);
  assert.match(technicalStyles, /rgba\(163, 255, 18/);
  assert.doesNotMatch(technicalStyles, /#61dcff|#83e6ff|#93ddff/);
  assert.match(outsideRosterStyles, /rgba\(163, 255, 18/);
  assert.doesNotMatch(outsideRosterStyles, /#93ddff|#aee8ff|#c8f2ff/);
});

test("the official league table remains server-owned and separate from TouchLine-card content", () => {
  assert.match(page, /loadTouchlineOfficialLeagueTable\(\)/);
  assert.match(page, /<TouchlineOfficialLeagueTable[\s\S]*?variant="clubHubRail"/);
  assert.match(page, /className="club-hub-touchline"/);
});

test("the official league area is the first chapter below navigation with a 70/30 feed and non-scrolling 20-club rail", () => {
  const navigationStart = indexOfRequired(page, "<ClubHubSectionNavigation");
  const officialLeagueStart = page.indexOf("<ClubHubOfficialLeagueSection", navigationStart);
  const overviewStart = page.indexOf("<ClubHubPremiumOverviewSection", navigationStart);

  assert.ok(navigationStart < officialLeagueStart && officialLeagueStart < overviewStart);
  assert.match(page, /data-clubhub-official-league="true"/);
  assert.match(page, /className=\{officialLeagueStyles\.feed\} id="club-feed"/);
  assert.match(page, /className=\{officialLeagueStyles\.rail\}[\s\S]*?<ClubHubNextFixtureCard[\s\S]*?<TouchlineOfficialLeagueTable/);
  assert.match(page, /id="club-table"[\s\S]*?variant="clubHubRail"/);
  assert.doesNotMatch(page.slice(navigationStart, overviewStart), /League pulse|Pulso da liga|Official 20-club standings|Classificação oficial dos 20 clubes/);
  assert.match(officialLeagueStyles, /grid-template-columns: minmax\(0, 7fr\) minmax\(340px, 3fr\)/);
  assert.match(officialLeagueStyles, /@media \(max-width: 1120px\)[\s\S]*?grid-template-columns: 1fr/);
  assert.match(leagueTable, /variant: "directory" \| "profile" \| "clubHubRail"/);
  assert.match(leagueTableStyles, /\.clubHubRail \.tableWrap\s*\{[\s\S]*?overflow: visible/);
  assert.match(leagueTableStyles, /\.clubHubRail \.tableWrap table\s*\{[\s\S]*?min-width: 0/);
  assert.doesNotMatch(leagueTableStyles, /\.clubHubRail \.tableWrap\s*\{[\s\S]*?overflow-y: auto/);
});

test("the functional ClubHub uses the approved premium overview with canonical data only", () => {
  assert.match(page, /ClubHubPremiumOverviewSection/);
  assert.match(page, /TOUCHLINE_STADIUM_CATALOG\.find/);
  assert.match(page, /loadTouchLineActiveRanking\(\)/);
  assert.match(page, /const homeClub = findTouchLineClub\(fixture\?\.homeTeam\?\.providerId\)/);
  assert.match(page, /const awayClub = findTouchLineClub\(fixture\?\.awayTeam\?\.providerId\)/);
  assert.match(page, /<ClubHubNextFixtureCard/);
  assert.match(page, /previewHref=\{null\}/);
  assert.match(page, /<ClubHubCanonicalCoachPanel[\s\S]*?presentation="technical"/);
  assert.match(page, /<TouchlineGameweekCard card=\{clubLeader\.card\}/);
  assert.match(page, /normalizeTouchlineMatchCentreTimeZone/);
  assert.doesNotMatch(page, /qa-canonical-snapshot|NOT A FOOTBALL CLAIM|LOCAL DRAFT/);
});
