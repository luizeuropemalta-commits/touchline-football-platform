import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { CLUB_POSITION_LEADER_GROUPS } from "../lib/touchlineArena/club-position-leaders.ts";

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
const leaders = readFileSync(new URL("../components/touchline/ClubHubPositionLeaders.tsx", import.meta.url), "utf8");
const leaderProjection = readFileSync(new URL("../lib/touchlineArena/club-position-leaders.ts", import.meta.url), "utf8");

test("compact fixtures occupy the former stadium slot after navigation", () => {
  const navigation = page.indexOf("<ClubHubSectionNavigation");
  const strip = page.indexOf("<ClubHubPersistedLiveRail");
  assert.ok(navigation > 0 && strip > navigation);
  assert.match(page.slice(navigation, strip), /<ClubHubSectionNavigation[^>]*\/>\s*<Suspense fallback=/);
  assert.doesNotMatch(page.slice(navigation, strip), /<ClubHubFixtureStrip/);
  assert.match(page.slice(strip, strip + 140), /draftLocalesEnabled=\{draftLocalesEnabled\} locale=\{locale\}/);
  assert.equal((page.match(/<ClubHubFixtureStrip/g) ?? []).length, 1);
  assert.match(page, /<ClubHubFixtureStrip[^\n]+\n\s*initialFixtures=\{snapshot\?\.fixtures \?\? null\}/);
});

test("the Squad navigation anchor exists even for an empty or unavailable roster", () => {
  assert.match(outsideRoster, /<section[^>]*id="club-squad"/);
});

test("section highlighting discovers streamed sections and cleans up listeners", () => {
  const effectStart = sectionNavigation.indexOf("  useEffect(() => {", sectionNavigation.indexOf("  useEffect(() => {") + 1);
  const effectEnd = sectionNavigation.indexOf("\n  }, []);", effectStart);
  assert.ok(effectStart > 0 && effectEnd > effectStart);
  const effect = sectionNavigation.slice(effectStart + "  useEffect(() => {".length, effectEnd);
  for (const initiallyHasTable of [false, true]) {
    const sections = new Map<string, { id: string; getBoundingClientRect: () => { top: number } }>();
    const add = (id: string, top: number) => sections.set(id, { id, getBoundingClientRect: () => ({ top }) });
    if (initiallyHasTable) add("club-table", 0);
    let active: string | null = null;
    let pending: (() => void) | null = null;
    let observerCallback: (() => void) | null = null;
    let disconnected = false;
    const listeners = new Map<string, () => void>();
    const cleanup = runInNewContext(stripTypeScriptTypes(`(() => {${effect}})()`), {
      SECTION_TARGETS: ["club-table", "touchline-club-lineup", "club-squad"],
      navigationRef: { current: null },
      setActiveTarget: (value: string | null) => { active = value; },
      document: { getElementById: (id: string) => sections.get(id), querySelector: () => ({}), documentElement: { scrollHeight: 1200 } },
      MutationObserver: class {
        constructor(callback: () => void) { observerCallback = callback; }
        observe() {}
        disconnect() { disconnected = true; }
      },
      window: { scrollY: 800, innerHeight: 600, location: { hash: "" },
        requestAnimationFrame: (callback: () => void) => { pending = callback; return 1; },
        cancelAnimationFrame: () => { pending = null; },
        addEventListener: (event: string, callback: () => void) => listeners.set(event, callback),
        removeEventListener: (event: string) => listeners.delete(event),
      },
    }) as (() => void) | undefined;
    add("club-table", -800);
    add("touchline-club-lineup", -300);
    add("club-squad", 0);
    assert.ok(listeners.has("scroll"), "install listeners before Suspense resolves");
    assert.ok(observerCallback, "streamed content must trigger a fresh geometry read");
    (observerCallback as () => void)();
    (pending as (() => void) | null)?.();
    assert.equal(active, "club-squad");
    sections.delete("club-squad");
    listeners.get("scroll")?.();
    (pending as (() => void) | null)?.();
    assert.equal(active, "touchline-club-lineup");
    cleanup?.();
    assert.equal(listeners.size, 0);
    assert.equal(disconnected, true);
  }
});

function indexOfRequired(source: string, token: string) {
  const index = source.indexOf(token);
  assert.ok(index >= 0, `expected ${token}`);
  return index;
}

test("ClubHub places identity and honours before the field and fixture rail", () => {
  const heroStart = indexOfRequired(page, '<header className="club-hub-hero" data-touchline-decoration-motion="club-cover">');
  const officialLeagueStart = page.indexOf("<ClubHubMatchdayPanels", heroStart);
  const lineupStart = page.indexOf("<ClubHubMatchdayPanels", heroStart);
  const technicalStart = page.indexOf("<ClubHubTechnicalSections", lineupStart);
  const outsideRosterStart = page.indexOf("<ClubHubOutsideMatchRoster");
  const lineupHelperStart = indexOfRequired(page, "async function ClubHubLineupSection");
  const lineupHelperEnd = indexOfRequired(page, "async function ClubHubTechnicalSections");
  const hero = page.slice(heroStart, lineupStart);
  const lineupSection = page.slice(lineupHelperStart, lineupHelperEnd);

  assert.ok(officialLeagueStart >= 0 && lineupStart >= 0 && technicalStart >= 0 && outsideRosterStart >= 0);
  assert.match(hero, /<ClubTrophyCarousel/);
  assert.doesNotMatch(hero, /<ClubHubHeroNextMatch/);
  assert.doesNotMatch(hero, /ClubHubLiveFixtureScore/);
  assert.match(lineupSection, /matchup=\{lineupMatchup\}/);
  assert.match(lineupSection, /fixtureId: lineupFixture\.providerId/);
  assert.ok(heroStart < officialLeagueStart);
  assert.ok(heroStart < lineupStart);
  assert.equal(lineupStart, officialLeagueStart, "XI and next game share one streamed boundary");
  assert.ok(lineupStart < technicalStart);
  assert.ok(lineupStart < technicalStart);
  assert.doesNotMatch(hero, /Official club value|Valor oficial do clube|marketValuePending|formatCompactEuro/);
  assert.doesNotMatch(hero, /touchlineCards|touchlinePoints|squadSource|club-hub-metrics/);
  assert.doesNotMatch(hero, /clubowner/);
});

test("ClubHub hero keeps honours and places stadium below the name without a next-fixture duplicate", () => {
  const heroStart = indexOfRequired(page, '<header className="club-hub-hero" data-touchline-decoration-motion="club-cover">');
  const heroEnd = indexOfRequired(page, '<ClubHubSectionNavigation');
  const hero = page.slice(heroStart, heroEnd);

  assert.doesNotMatch(hero, /<ClubHubHeroNextMatch/);
  assert.match(hero, /<ClubTrophyCarousel/);
  assert.doesNotMatch(hero, /ClubHubHomeStadiumPanel/);
  assert.match(hero, /ClubHubHomeStadiumIdentity/);
  assert.ok(hero.indexOf("<h1>") < hero.indexOf("<ClubHubHomeStadiumIdentity"));
  assert.equal((page.match(/<ClubHubHomeStadiumIdentity /g) ?? []).length, 1);
  assert.match(page, /function ClubHubHomeStadiumIdentity/);
  assert.match(page, /<ClubHubHomeStadiumIdentity draftLocalesEnabled=\{draftLocalesEnabled\} locale=\{locale\} stadium=\{homeStadium\}/);
  assert.match(page, /club-hub-home-stadium-identity/);
  assert.doesNotMatch(page, /profile\.capacity|profile\.openedYear|primarySource/);
});

test("trophy carousel keeps canonical-size cards and only reserves controls after overflow", () => {
  assert.match(trophyCarousel, /const arrowReservation = 76/);
  assert.match(trophyCarousel, /if \(itemCount <= capacity\) return itemCount/);
  assert.doesNotMatch(trophyCarousel, /const pageCount/);
});

test("ClubHub gives the reusable club hero premium motion without sacrificing navigation or reduced motion", () => {
  assert.match(page, /\.club-hub-hero-image \{[\s\S]*?animation: club-hub-stadium-breathe/);
  assert.match(page, /<svg className="club-hub-neon-frame"[\s\S]*?<rect className="club-hub-neon-trace"/);
  assert.match(page, /\.club-hub-neon-trace \{[\s\S]*?stroke: #a3ff12;[\s\S]*?stroke-dasharray: 5 95;[\s\S]*?animation: club-hub-border-sweep/);
  assert.match(page, /\.club-hub-logo-stack::before \{[\s\S]*?club-hub-crest-aura/);
  assert.doesNotMatch(page, /\.club-hub-honour:hover/);
  assert.doesNotMatch(page, /\.club-hub-honour::after/);
  assert.doesNotMatch(trophyCarousel, /<small title=\{honour\.label\}>/);
  assert.match(page, /<ClubHubSectionNavigation draftLocalesEnabled=\{draftLocalesEnabled\} locale=\{locale\}/);
  assert.match(sectionNavigation, /TouchlineGlobalNavigation\.module\.css/);
  assert.match(sectionNavigation, /icon: TableProperties[\s\S]*?icon: CalendarDays[\s\S]*?icon: UsersRound/);
  assert.match(sectionNavigation, /target: "club-table"/);
  assert.doesNotMatch(sectionNavigation, /target: "club-feed"/);
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
  assert.match(page, /index="01"/);
  assert.match(sectionNavigationStyles, /\.navigation \{[\s\S]*?position: relative[\s\S]*?width: max-content;[\s\S]*?margin: 0 auto/);
  assert.doesNotMatch(sectionNavigationStyles, /\.navigation \{[\s\S]*?position: sticky/);
  assert.match(sectionNavigationStyles, /\.backToTop \{[\s\S]*?position: fixed/);
  assert.match(sectionNavigationStyles, /\.backToTop\[data-visible="true"\]/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none !important/);
});

test("ClubHub partitions the displayed XI, official bench, and a compact linked outside-match roster", () => {
  assert.match(page, /const outsideMatchdayCards = \[\.\.\.matchdayPresentation\.remainingSquad\.cards\]/);
  assert.match(page, /selectionState=\{presentation\.matchdayPresentation\.remainingSquad\.state\}/);
  assert.match(outsideRoster, /selectionState = "unconfirmed"/);
  assert.doesNotMatch(outsideRoster, /"Elenco fora da partida"/);
  assert.match(page, /<ClubHubOutsideMatchRoster[\s\S]*?cards=\{outsideMatchdayCards\}/);
  assert.match(outsideRoster, /<ClubHubSquadGrid[\s\S]*?cards=\{\[\.\.\.cards\]\}/);
  assert.match(outsideRoster, /Premium compact roster/);
  assert.match(outsideRoster, /initialCardCount=\{12\}/);
  assert.match(outsideRoster, /cardRenderScale=\{124 \/ 430\}/);
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
  assert.match(page, /loadTouchlineOfficialLeagueTable\(\{ includeLiveProjectionSource: true \}\)/);
  assert.match(page, /<TouchlineOfficialLeagueTable[\s\S]*?variant="clubHubRail"/);
  assert.doesNotMatch(page, /ClubHubCardsSection/);
});

test("the first chapter commits XI and next fixture together, above the table", () => {
  const navigationStart = indexOfRequired(page, "<ClubHubSectionNavigation");
  const panelsStart = page.indexOf("<ClubHubMatchdayPanels", navigationStart);
  const lineupStart = panelsStart;
  assert.ok(navigationStart < panelsStart);
  const group = page.slice(page.indexOf("async function ClubHubMatchdayPanels"), page.indexOf("async function ClubHubTechnicalSections"));
  assert.match(group, /\{lineup\}[\s\S]*?data-clubhub-right-rail="true"[\s\S]*?\{next\}[\s\S]*?<ClubHubOfficialTablePanel/);
  assert.equal((page.match(/ClubHubOfficialLeagueSection\(\{/g) ?? []).length, 2);
  assert.match(page, /data-clubhub-official-league="true"/);
  assert.doesNotMatch(page, /TouchlineClubSocialFeed|readTouchlineClubSocialFeed/);
  assert.match(page, /className=\{officialLeagueStyles\.panel\}[\s\S]*?<ClubHubNextFixtureCard[\s\S]*?<TouchlineOfficialLeagueTable/);
  assert.match(page, /venueName=\{fixture\.venue\?\.name \?\? \(TOUCHLINE_STADIUM_CATALOG\.find\(\(stadium\) => stadium\.homeTeamProviderId === fixture\.homeTeam\?\.providerId\)\?\.name \?\? null\)\}/);
  assert.match(page, /venueImageUrl=\{fixture\.venue\?\.interiorImageUrl \?\? fixture\.venue\?\.imageUrl \?\? TOUCHLINE_STADIUM_CATALOG\.find\(\(stadium\) => stadium\.homeTeamProviderId === fixture\.homeTeam\?\.providerId\)\?\.interiorImageUrl \?\? null\}/);
  assert.match(page, /toTouchlineLiveFixture\(previewFixture\)/);
  assert.match(page, /id="club-table"[\s\S]*?variant="clubHubRail"/);
  assert.doesNotMatch(page.slice(navigationStart, lineupStart), /League pulse|Pulso da liga|Official 20-club standings|Classificação oficial dos 20 clubes/);
  assert.match(officialLeagueStyles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(officialLeagueStyles, /@media \(max-width: 1120px\)[\s\S]*?grid-template-columns: 1fr/);
  assert.match(leagueTable, /variant: "directory" \| "profile" \| "clubHubRail"/);
  assert.match(leagueTableStyles, /\.clubHubRail \.tableWrap\s*\{[\s\S]*?overflow-y: auto/);
  assert.match(leagueTableStyles, /\.clubHubRail \.tableWrap table\s*\{[\s\S]*?min-width: 0/);
  assert.match(leagueTableStyles, /\.clubHubRail \.tableWrap\s*\{[\s\S]*?overscroll-behavior: contain/);
});

test("the functional ClubHub places canonical positional leaders beside the matchday pitch", () => {
  assert.doesNotMatch(page, /ClubHubPremiumOverviewSection/);
  assert.match(page, /TOUCHLINE_STADIUM_CATALOG\.find/);
  assert.match(page, /loadTouchLineActiveRanking\(\)/);
  assert.match(page, /const homeClub = findTouchLineClub\(fixture\?\.homeTeam\?\.providerId\)/);
  assert.match(page, /const awayClub = findTouchLineClub\(fixture\?\.awayTeam\?\.providerId\)/);
  assert.match(page, /<ClubHubNextFixtureCard/);
  assert.match(page, /previewHref=\{null\}/);
  assert.match(page, /<ClubHubCanonicalCoachPanel[\s\S]*?presentation="technical"/);
  assert.match(page, /leaderCards=\{<ClubHubPositionLeaders cards=\{presentation\.clubCards\} seed=\{activeRanking\} enabled=\{dataSource === "direct"\}/);
  assert.match(leaders, /projectClubPositionLeaders\(cards, ranking\)/);
  assert.match(leaders, /<TouchlineGameweekCard\b[^>]*\bcard=\{leader\.card\}/);
  assert.match(leaders, /displayWidth=\{112\}/);
  assert.match(leaderProjection, /CLUB_POSITION_LEADER_GROUPS\.map/);
  assert.match(leaderProjection, /positionGroup: facts\.positionGroup/);
  assert.deepEqual(CLUB_POSITION_LEADER_GROUPS.map(group => group.key), ["centre-back", "full-back", "midfielder", "attacker"]);
  assert.doesNotMatch(`${page}\n${leaders}\n${leaderProjection}`, /fallbackLeaderCard/);
  assert.match(page, /normalizeTouchlineMatchCentreTimeZone/);
  assert.doesNotMatch(page, /qa-canonical-snapshot|NOT A FOOTBALL CLAIM|LOCAL DRAFT/);
});

test("ClubHub inherits the single professional localized global rights footer", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../components/touchline/TouchlineSiteFooter.tsx", import.meta.url), "utf8");
  const footerStyles = readFileSync(new URL("../components/touchline/TouchlineSiteFooter.module.css", import.meta.url), "utf8");
  // The local duplicate is superseded; the document shell owns the footer.
  assert.doesNotMatch(page, /<footer\b|<TouchlineSiteFooter\b|\{copy\.rights\}/);
  assert.equal((layout.match(/<TouchlineSiteFooter\b/g) ?? []).length, 1);
  assert.match(layout, /!isIsolatedPreview \? <TouchlineSiteFooter locale=\{locale\} draftLocalesEnabled=\{allowDraftPresentation\}/);
  const contentEnd = layout.indexOf("</TouchlinePageContent>");
  assert.ok(contentEnd > 0 && layout.indexOf("<TouchlineSiteFooter") > contentEnd);
  assert.equal((footer.match(/<footer\b/g) ?? []).length, 1);
  assert.match(footer, /<footer className=\{styles\.footer\} lang=\{language\}/);
  assert.match(footer, /"en-GB": "All rights reserved\."/);
  assert.match(footer, /"pt-BR": "Todos os direitos reservados\."/);
  assert.match(footer, /© \{new Date\(\)\.getFullYear\(\)\} TouchLine\. \{rights\[language\]\}/);
  assert.match(footerStyles, /\.footer\s*\{/);
});
