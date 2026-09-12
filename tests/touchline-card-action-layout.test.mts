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
  layout: Record<"shareAction" | "followAction" | "likeAction", { x: number; y: number; scale: number }>;
};

const actionKeys = ["shareAction", "followAction", "likeAction"] as const;

function bounds(key: (typeof actionKeys)[number], scale: number) {
  const field = layout.layout[key];
  return {
    left: field.x,
    top: field.y,
    right: field.x + (ACTION_WIDTH * field.scale * scale),
    bottom: field.y + (ACTION_HEIGHT * field.scale * scale),
  };
}

test("the shared card action row keeps Share below the shirt and aligns all social controls", () => {
  const [share, follow, like] = actionKeys.map((key) => bounds(key, 1));

  assert.equal(share.top, follow.top);
  assert.equal(follow.top, like.top);
  assert.equal(share.bottom, follow.bottom);
  assert.equal(follow.bottom, like.bottom);
  assert.ok(share.top >= SHIRT_SAFE_BOTTOM, "Share must never overlap the shirt composition");
  assert.ok(share.left >= 0 && like.right <= CARD_WIDTH, "the complete row must remain inside the card canvas");
  assert.ok(share.right <= follow.left, "Share and Follow must not overlap");
  assert.ok(follow.right <= like.left, "Follow and Like must not overlap");
  assert.ok(like.bottom <= CARD_HEIGHT, "the action row must remain inside the card canvas");
});

test("all seven official tiers inherit the same non-overlapping action-row contract", () => {
  const tiers = Object.values(TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS);
  assert.equal(tiers.length, 7);

  for (const tier of tiers) {
    for (const presentation of ["normal", "compact", "zoom"] as const) {
      const actionScale = tier.presentations[presentation].actions;
      const [share, follow, like] = actionKeys.map((key) => bounds(key, actionScale));
      assert.equal(share.top, follow.top, `${tier.tierKey}/${presentation}: Share and Follow must align`);
      assert.equal(follow.top, like.top, `${tier.tierKey}/${presentation}: Follow and Like must align`);
      assert.ok(share.top >= SHIRT_SAFE_BOTTOM, `${tier.tierKey}/${presentation}: Share must clear the shirt`);
      assert.ok(share.right <= follow.left, `${tier.tierKey}/${presentation}: Share/Follow overlap`);
      assert.ok(follow.right <= like.left, `${tier.tierKey}/${presentation}: Follow/Like overlap`);
      assert.ok(share.left >= 0 && like.right <= CARD_WIDTH, `${tier.tierKey}/${presentation}: action row escapes card`);
      assert.ok(like.bottom <= CARD_HEIGHT, `${tier.tierKey}/${presentation}: action row exceeds card`);
    }
  }
});
