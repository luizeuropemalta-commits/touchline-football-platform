import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");

test("TouchLine Tables never present demo data as an official competition ranking", () => {
  assert.doesNotMatch(page, /rankClubOwnerCards|buildDemoClubOwnerStandings|buildTouchlineRankingSnapshot/);
  assert.match(page, /const cardClubOwnerRank: never\[\] = \[\]/);
  assert.match(page, /const touchLineEnglandTable: never\[\] = \[\]/);
  assert.match(page, /const cardPlayerRank: never\[\] = \[\]/);
  assert.match(client, /function RankingPending/);
  assert.match(client, /cardClubOwnerRank\.length \?/);
  assert.match(client, /touchLineEnglandTable\.length \?/);
  assert.match(client, /cardPlayerRank\.length \?/);
  assert.match(copy, /rankingPending/);
});
