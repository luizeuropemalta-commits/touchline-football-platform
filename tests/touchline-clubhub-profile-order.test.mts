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

test("ClubHub places real club identity, honours and next match before matchday and TouchLine sections", () => {
  const heroStart = indexOfRequired(page, '<header className="club-hub-hero">');
  const lineupStart = indexOfRequired(page, "<ClubHubOfficialLineup");
  const technicalStart = indexOfRequired(page, "<ClubHubMatchdayTechnicalArea");
  const outsideStart = indexOfRequired(page, "<ClubHubOutsideMatchRoster");
  const tableStart = indexOfRequired(page, "<TouchlineOfficialLeagueTable");
  const touchlineCardsStart = indexOfRequired(page, "<ClubHubSquadGrid");
  const hero = page.slice(heroStart, lineupStart);

  assert.ok(indexOfRequired(hero, "<ClubTrophyCarousel") < indexOfRequired(hero, 'className="club-hub-next-match"'));
  assert.ok(heroStart < lineupStart);
  assert.ok(lineupStart < technicalStart);
  assert.ok(technicalStart < outsideStart);
  assert.ok(outsideStart < tableStart);
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

test("technical area only reveals a coach and nine substitutes from a complete matchday sheet", () => {
  assert.match(lineup, /officialBench\.length === 9/);
  assert.match(lineup, /new Set\(benchIds\)\.size === benchIds\.length/);
  assert.match(lineup, /benchIds\.every\(\(id\) => !starterIds\.includes\(id\)\)/);
  assert.match(lineup, /state: hasConfirmedTechnicalTeamSheet \? "confirmed" : "awaiting_official_team_sheet"/);
  assert.match(technical, /MATCHDAY_BENCH_SIZE = 9/);
  assert.match(technical, /technical\.state === "confirmed"/);
  assert.match(technical, /Awaiting official matchday sheet/);
  assert.doesNotMatch(technical, /TOUCHLINE_LIVE_COACHES|buildMatchdayBench|create(?:Admin)?Client|supabase|fetch\(|sportmonks|marketValue|contract/i);
});

test("the official league table remains server-owned and separate from TouchLine-card content", () => {
  assert.match(page, /loadTouchlineOfficialLeagueTable\(\)/);
  assert.match(page, /<TouchlineOfficialLeagueTable[\s\S]*?variant="profile"/);
  assert.match(page, /className="club-hub-touchline"/);
});
