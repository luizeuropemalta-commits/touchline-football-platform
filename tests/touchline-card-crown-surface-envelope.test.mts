import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("leader cards reserve their crown before a host can clip it", () => {
  const playerCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");
  const coachPanel = source("components/touchline/ClubHubCanonicalCoachPanel.tsx");
  const rankingPage = source("app/touchline-player-card-rankings/page.tsx");

  assert.match(playerCard, /data-card-leadership-crown=\{isCanonicalPlayerLeader \? "true" : "false"\}/);
  assert.match(playerCard, /leadershipCrownEnvelope/);
  assert.match(playerCard, /margin: isCanonicalPlayerLeader\s*\? hasStaticRenderScale/);
  assert.ok(playerCard.includes('`calc(${-basePlayerLeaderCrownStyle.top}px * ${crownRenderScale}) auto 0`'));
  assert.ok(playerCard.includes('`${leadershipCrownEnvelope}px auto 0`'));
  assert.match(coachCard, /marginTop: showLeadershipCrown \? "29\.55%" : undefined/);
  assert.match(coachCard, /data-coach-ranking-leader=\{showLeadershipCrown \? "true" : "false"\}/);
  assert.match(coachPanel, /showLeadershipCrown=\{coachRankingRow\?\.rank === 1\}/);
  assert.match(
    rankingPage,
    /\.tl-card-rankings-featured article \{[\s\S]*?\/\* The ranking crown lives in the card's reserved top envelope\. Never crop it\. \*\/[\s\S]*?overflow: visible;/,
  );
});
