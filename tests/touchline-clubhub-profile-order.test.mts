import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const technical = readFileSync(new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url), "utf8");
const outsideRoster = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.tsx", import.meta.url), "utf8");
const lineup = readFileSync(new URL("../lib/touchlineArena/club-lineup.ts", import.meta.url), "utf8");

function indexOfRequired(source: string, token: string) {
  const index = source.indexOf(token);
  assert.ok(index >= 0, `expected ${token}`);
  return index;
}

test("ClubHub places identity and honours before the matchday surface, where the match-up now lives", () => {
  const heroStart = indexOfRequired(page, '<header className="club-hub-hero">');
  const lineupStart = page.indexOf("<ClubHubLineupSection", heroStart);
  const technicalStart = page.indexOf("<ClubHubTechnicalSections", lineupStart);
  const tableStart = page.indexOf("<ClubHubLeagueTableSection", technicalStart);
  const touchlineCardsStart = page.indexOf("<ClubHubCardsSection", tableStart);
  const lineupHelperStart = indexOfRequired(page, "async function ClubHubLineupSection");
  const lineupHelperEnd = indexOfRequired(page, "async function ClubHubTechnicalSections");
  const hero = page.slice(heroStart, lineupStart);
  const lineupSection = page.slice(lineupHelperStart, lineupHelperEnd);

  assert.ok(lineupStart >= 0 && technicalStart >= 0 && tableStart >= 0 && touchlineCardsStart >= 0);
  assert.match(hero, /<ClubTrophyCarousel/);
  assert.doesNotMatch(hero, /club-hub-next-match|ClubHubLiveFixtureScore/);
  assert.match(lineupSection, /matchup=\{\{/);
  assert.match(lineupSection, /fixtureId: matchSnapshot\.previewFixtureId/);
  assert.ok(heroStart < lineupStart);
  assert.ok(lineupStart < technicalStart);
  assert.ok(technicalStart < tableStart);
  assert.ok(tableStart < touchlineCardsStart);
  assert.doesNotMatch(hero, /Official club value|Valor oficial do clube|marketValuePending|formatCompactEuro/);
  assert.doesNotMatch(hero, /touchlineCards|touchlinePoints|squadSource|club-hub-metrics/);
  assert.doesNotMatch(hero, /market-transfer/);
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
});

test("the official league table remains server-owned and separate from TouchLine-card content", () => {
  assert.match(page, /loadTouchlineOfficialLeagueTable\(\)/);
  assert.match(page, /<TouchlineOfficialLeagueTable[\s\S]*?variant="profile"/);
  assert.match(page, /className="club-hub-touchline"/);
});
