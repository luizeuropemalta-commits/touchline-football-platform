import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS,
} from "../lib/touchlineArena/card-tier-component-calibration.ts";

const CARD_WIDTH = 430;
const CARD_HEIGHT = 691;
const ACTION_WIDTH = 118;
const ACTION_HEIGHT = 34;
const SHIRT_SAFE_BOTTOM = 403;
const layout = JSON.parse(readFileSync(
  new URL("../public/touchlineArena/card-layouts/master-shirt-back-layout.json", import.meta.url),
  "utf8",
)) as {
  layout: Record<"followAction" | "likeAction", { x: number; y: number; scale: number }>;
};

const actionKeys = ["followAction", "likeAction"] as const;

function bounds(key: (typeof actionKeys)[number], scale: number) {
  const field = layout.layout[key];
  return {
    left: field.x,
    top: field.y,
    right: field.x + (ACTION_WIDTH * field.scale * scale),
    bottom: field.y + (ACTION_HEIGHT * field.scale * scale),
  };
}

test("the shared card action row removes Share and recenters the two canonical social controls", () => {
  const [follow, like] = actionKeys.map((key) => bounds(key, 1));

  assert.equal(follow.top, like.top);
  assert.equal(follow.bottom, like.bottom);
  assert.ok(follow.top >= SHIRT_SAFE_BOTTOM, "Follow must never overlap the shirt composition");
  assert.ok(follow.left >= 0 && like.right <= CARD_WIDTH, "the complete row must remain inside the card canvas");
  assert.ok(follow.right <= like.left, "Follow and Like must not overlap");
  assert.equal((follow.left + like.right) / 2, CARD_WIDTH / 2, "the two actions must remain centered");
  assert.ok(like.bottom <= CARD_HEIGHT, "the action row must remain inside the card canvas");
});

test("all seven official tiers inherit the same non-overlapping action-row contract", () => {
  const tiers = Object.values(TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS);
  assert.equal(tiers.length, 7);

  for (const tier of tiers) {
    for (const presentation of ["normal", "compact", "zoom"] as const) {
      const actionScale = tier.presentations[presentation].actions;
      const [follow, like] = actionKeys.map((key) => bounds(key, actionScale));
      assert.equal(follow.top, like.top, `${tier.tierKey}/${presentation}: Follow and Like must align`);
      assert.ok(follow.top >= SHIRT_SAFE_BOTTOM, `${tier.tierKey}/${presentation}: Follow must clear the shirt`);
      assert.ok(follow.right <= like.left, `${tier.tierKey}/${presentation}: Follow/Like overlap`);
      assert.equal((follow.left + like.right) / 2, CARD_WIDTH / 2, `${tier.tierKey}/${presentation}: action row is not centered`);
      assert.ok(follow.left >= 0 && like.right <= CARD_WIDTH, `${tier.tierKey}/${presentation}: action row escapes card`);
      assert.ok(like.bottom <= CARD_HEIGHT, `${tier.tierKey}/${presentation}: action row exceeds card`);
    }
  }
});

test("public cards never fabricate social totals or render an in-card Share action", () => {
  const cardSource = readFileSync(
    new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(cardSource, /demoSocialCount/);
  assert.doesNotMatch(cardSource, /Share2/);
  assert.doesNotMatch(cardSource, /sharePlayerCard/);
  assert.match(cardSource, /canonicalSocialCount\(followerCount\)/);
  assert.match(cardSource, /canonicalSocialCount\(likeCount\)/);
  assert.match(cardSource, /baseFollowerCount === null \? "—"/);
  assert.match(cardSource, /baseLikeCount === null \? "—"/);
});
