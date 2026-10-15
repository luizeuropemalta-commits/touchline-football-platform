import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_ASSET,
  TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION,
  touchlinePlayerLeaderGoldenBallStyle,
} from "../lib/touchlineArena/player-leader-golden-ball-presentation.ts";

const cardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);

test("static-render Golden Balls follow the same responsive CSS scale as their card canvas", () => {
  assert.match(cardSource, /const goldenBallRenderScale = `var\(--touchline-card-static-scale, \$\{scale\}\)`/);
  assert.match(cardSource, /top: hasStaticRenderScale\s*\? `calc\(\$\{basePlayerLeaderGoldenBallStyle\.top\}px \* \$\{goldenBallRenderScale\} \* \$\{headAwardScale\}\)`/);
  assert.match(cardSource, /width: hasStaticRenderScale\s*\? `calc\(\$\{basePlayerLeaderGoldenBallStyle\.width\}px \* \$\{goldenBallRenderScale\} \* \$\{headAwardScale\}\)`/);
});

test("player leader Golden Ball is a non-interactive overlay with a calibrated frame gap", () => {
  const desktop = touchlinePlayerLeaderGoldenBallStyle(1);
  const mobile = touchlinePlayerLeaderGoldenBallStyle(0.4);

  assert.equal(TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_ASSET, "/touchlineArena/awards/touchline-golden-ball-trophy-v2.png");
  assert.equal(desktop.width, TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.width);
  assert.equal(
    desktop.top,
    -((desktop.width * TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.heightRatio) + TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.frameClearance),
  );
  assert.ok(Math.abs(mobile.width - (desktop.width * 0.4)) < 0.0001);
  assert.ok(Math.abs(mobile.top - (desktop.top * 0.4)) < 0.0001);
  assert.ok(
    desktop.top + (desktop.width * TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.heightRatio) < 0,
    "desktop Golden Ball must clear the card frame",
  );
  assert.ok(
    mobile.top + (mobile.width * TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_CALIBRATION.heightRatio) < 0,
    "mobile Golden Ball must clear the card frame",
  );
});

test("only the canonical player leadership decision may render the Golden Ball", () => {
  assert.match(cardSource, /touchlinePlayerCrownEligibility\(\{\s*state:\s*activeRanking,\s*playerId:\s*player\.canonicalPlayerId/s);
  assert.match(cardSource, /data-touchline-player-golden-ball="true"/);
  assert.match(cardSource, /data-card-golden-ball=\{hasGoldenBall \? "true" : "false"\}/);
  assert.match(cardSource, /const hasHeadAward = hasGoldenBall \|\| hasGoldenBoot/);
  assert.match(cardSource, /const leadershipAwardEnvelope = hasHeadAward[\s\S]*?Math\.max\(0, -playerLeaderGoldenBallStyle\.top\)/);
  assert.match(cardSource, /margin: hasHeadAward\s*\? hasStaticRenderScale/);
  assert.ok(cardSource.includes('`calc(${-basePlayerLeaderGoldenBallStyle.top}px * ${goldenBallRenderScale} * ${headAwardScale}) auto 0`'));
  assert.ok(cardSource.includes('`calc(${leadershipAwardEnvelope}px * ${headAwardScale}) auto 0`'));
  assert.match(cardSource, /pointerEvents:\s*"none"/);
  assert.match(cardSource, /:\s*`calc\(\$\{playerLeaderGoldenBallStyle\.top\}px \* \$\{headAwardScale\}\)`/);
  assert.match(cardSource, /src=\{TOUCHLINE_PLAYER_LEADER_GOLDEN_BALL_ASSET\}/);
  assert.doesNotMatch(cardSource, /providerPlayerId:\s*player\.sportmonksPlayerId[\s\S]{0,120}touchlinePlayerCrownEligibility/s);
});
