import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_PLAYER_LEADER_CROWN_ASSET,
  TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION,
  touchlinePlayerLeaderCrownStyle,
} from "../lib/touchlineArena/player-leader-crown-presentation.ts";

const cardSource = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);

test("player leader crown is a non-interactive overlay with a calibrated frame gap", () => {
  const desktop = touchlinePlayerLeaderCrownStyle(1);
  const mobile = touchlinePlayerLeaderCrownStyle(0.4);

  assert.equal(TOUCHLINE_PLAYER_LEADER_CROWN_ASSET, "/touchlineArena/cards/leadership/touchline-player-leader-crown.png");
  assert.equal(desktop.width, TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.width);
  assert.equal(
    desktop.top,
    -((desktop.width * TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.opaqueBottomRatio) + TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.frameClearance),
  );
  assert.ok(Math.abs(mobile.width - (desktop.width * 0.4)) < 0.0001);
  assert.ok(Math.abs(mobile.top - (desktop.top * 0.4)) < 0.0001);
  assert.ok(
    desktop.top + (desktop.width * TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.opaqueBottomRatio) < 0,
    "desktop crown's visible alpha edge must clear the card frame",
  );
  assert.ok(
    mobile.top + (mobile.width * TOUCHLINE_PLAYER_LEADER_CROWN_CALIBRATION.opaqueBottomRatio) < 0,
    "mobile crown's visible alpha edge must clear the card frame",
  );
});

test("only the canonical player leadership decision may render the approved crown", () => {
  assert.match(cardSource, /touchlinePlayerCrownEligibility\(\{\s*state:\s*activeRanking,\s*playerId:\s*player\.canonicalPlayerId/s);
  assert.match(cardSource, /data-touchline-player-leader-crown="true"/);
  assert.match(cardSource, /data-card-leadership-crown=\{isCanonicalPlayerLeader \? "true" : "false"\}/);
  assert.match(cardSource, /const leadershipCrownEnvelope = isCanonicalPlayerLeader[\s\S]*?Math\.max\(0, -playerLeaderCrownStyle\.top\)/);
  assert.match(cardSource, /margin: isCanonicalPlayerLeader \? `\$\{leadershipCrownEnvelope\}px auto 0` : "0 auto"/);
  assert.match(cardSource, /pointerEvents:\s*"none"/);
  assert.match(cardSource, /top:\s*playerLeaderCrownStyle\.top/);
  assert.match(cardSource, /src=\{TOUCHLINE_PLAYER_LEADER_CROWN_ASSET\}/);
  assert.doesNotMatch(cardSource, /providerPlayerId:\s*player\.sportmonksPlayerId[\s\S]{0,120}touchlinePlayerCrownEligibility/s);
});
