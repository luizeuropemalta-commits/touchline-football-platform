import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");

test("TouchLine Tables never present demo data as an official competition ranking", () => {
  assert.doesNotMatch(page, /rankClubOwnerCards|buildDemoClubOwnerStandings|buildTouchlineRankingSnapshot/);
  assert.match(page, /loadTouchLineActiveRanking\(\)/);
  assert.match(page, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(page, /const touchLineEnglandTable: never\[\] = \[\]/);
  assert.match(client, /function RankingPending/);
  assert.match(client, /touchLineEnglandTable\.length \?/);
  assert.match(copy, /rankingPending/);
});

test("TouchLine Tables shows one positional Best XI, coaches and the sporting ClubOwner Table", () => {
  assert.match(client, /data-best-eleven-player/);
  assert.match(client, /data-best-eleven-position/);
  assert.match(client, /data-top-coach-card/);
  assert.match(client, /id="coach-rankings"/);
  assert.match(client, /coachRanking\.rows\.slice\(0, 7\)/);
  assert.match(client, /compareTouchLineRankedCards/);
  assert.match(client, /filter\(\(card\) => card\.seasonTotalRating != null\)/);
  assert.match(client, /sort\(compareTouchLineRankedCards\)/);
  assert.match(client, /\.slice\(0, 3\)/);
  assert.match(client, /Top 3 Cards da Temporada/);
  assert.match(client, /Melhores treinadores/);
  assert.match(client, /id="club-owner-table"/);
  assert.doesNotMatch(client, /cardClubOwnerRank|playerList|playerRankSection/);
  assert.doesNotMatch(copy, /Highest squad card value|Maiores valores de cards do elenco/);
});

test("TouchLine Tables distinguishes every published card from the current eligible ranking snapshot", () => {
  assert.match(page, /countTouchlinePublishedPlayerCards\(\)/);
  assert.match(client, /copy\.publishedCards/);
  assert.match(client, /totalPublishedCards \?\? "—"/);
  assert.match(client, /copy\.rankedCards/);
  assert.match(client, /totalRankedCards/);
  assert.doesNotMatch(client, /copy\.clubOwners/);
});
