import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("the shared card zoom reserves a leader-crown safe zone without changing crown art", () => {
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const playerCard = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  const coachCard = source("components/touchline/cards/TouchlineCoachCard.tsx");

  assert.match(zoomCss, /--touchline-card-zoom-crown-safe-top: clamp\(98px, 16vw, 128px\)/);
  assert.match(zoomCss, /\.cardColumn \{[\s\S]*?padding-top: var\(--touchline-card-zoom-crown-safe-top\)/);
  assert.match(zoomCss, /\.cardColumn \{[\s\S]*?overflow: visible/);
  assert.match(zoomCss, /\.trigger \{[\s\S]*?display: flow-root[\s\S]*?overflow: visible/);
  assert.match(zoomCss, /\.expandedCard > \[data-card-leadership-crown="true"\],[\s\S]*?margin-top: 0 !important/);
  assert.match(zoomCss, /100dvh - 72px - var\(--touchline-card-zoom-crown-safe-top\)/);
  assert.match(zoomCss, /--touchline-card-zoom-crown-safe-top: clamp\(82px, 21vw, 98px\)/);
  assert.match(zoomCss, /--touchline-card-zoom-crown-safe-top: clamp\(68px, 13vw, 94px\)/);
  assert.match(zoomCss, /100dvh - 64px - var\(--touchline-card-zoom-crown-safe-top\)/);
  assert.match(playerCard, /src=\{TOUCHLINE_PLAYER_LEADER_CROWN_ASSET\}/);
  assert.match(coachCard, /src=\{TOUCHLINE_PLAYER_LEADER_CROWN_ASSET\}/);
});

test("player and coach profiles reserve the same uncropped leader-crown envelope", () => {
  const playerProfile = source("app/touchline-players/[player]/player-profile.module.css");
  const coachProfile = source("app/touchline-coaches/[coach]/page.tsx");

  assert.match(playerProfile, /\.identityBand \{[\s\S]*?overflow: visible/);
  assert.match(playerProfile, /\.cardFrame \{[\s\S]*?padding-top: clamp\(98px, 16vw, 128px\)/);
  assert.match(playerProfile, /\.cardFrame > \[data-card-leadership-crown="true"\] \{[\s\S]*?margin-top: 0 !important/);
  assert.match(playerProfile, /width: 310px;[\s\S]*?padding-top: clamp\(82px, 21vw, 98px\)/);
  assert.match(coachProfile, /\.coach-profile-card \{ width:min\(100%,410px\); justify-self:center; padding-top:128px; box-sizing:border-box; overflow:visible; \}/);
  assert.match(coachProfile, /\.coach-profile-card > \[data-coach-ranking-leader="true"\] \{ margin-top:0 !important; \}/);
  assert.match(coachProfile, /width:min\(100%,330px\); padding-top:98px/);
});
