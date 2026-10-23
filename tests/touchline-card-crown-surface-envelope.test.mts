import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("leader cards reserve their award before a host can clip it", () => {
  const playerCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");
  const coachPanel = source("components/touchline/ClubHubCanonicalCoachPanel.tsx");
  const rankingPage = source("app/touchline-player-card-rankings/page.tsx");

  assert.match(playerCard, /data-card-golden-ball=\{hasGoldenBall \? "true" : "false"\}/);
  assert.match(playerCard, /const hasHeadAward = hasGoldenBall \|\| hasGoldenBoot/);
  assert.match(playerCard, /margin: hasStaticRenderScale/);
  assert.ok(playerCard.includes('max(${hasHeadAward ? 1 : 0}, var(--touchline-card-reserve-head-award, 0))'));
  assert.ok(playerCard.includes('${-basePlayerLeaderGoldenBallStyle.top}px * ${goldenBallRenderScale} * ${headAwardScale}'));
  assert.ok(playerCard.includes('${-playerLeaderGoldenBallStyle.top}px * ${headAwardScale}'));
  assert.match(coachCard, /marginTop: showLeadershipCrown \? "29\.55%" : undefined/);
  assert.match(coachCard, /data-coach-ranking-leader=\{showLeadershipCrown \? "true" : "false"\}/);
  // Coach crown authority now travels in the public competition projection;
  // the zoom owns the display rather than receiving a duplicate boolean.
  assert.match(coachPanel, /competition=\{competition\}/);
  assert.match(coachPanel, /liveCompetitionUpdates=\{Boolean\(competition\) \|\| !coachContract\}/);
  assert.match(
    rankingPage,
    /\.tl-card-rankings-featured article \{[\s\S]*?\/\* The ranking crown lives in the card's reserved top envelope\. Never crop it\. \*\/[\s\S]*?overflow: visible;/,
  );
});
