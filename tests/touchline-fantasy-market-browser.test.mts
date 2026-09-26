import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_CALIBRATED_FORMATION_CODES, resolveTouchlineFormationGeometry } from "../lib/touchlineArena/formation-geometry.ts";
import { TOUCHLINE_FANTASY_BROWSE_POSITIONS, resolveTouchlineFantasyBrowseSlot, touchlineFantasyPitchCardWidth } from "../lib/touchlineFantasy/market-browser.ts";

test("browsing exposes every classified football position, without the retired contract quotas", () => {
  assert.deepEqual(TOUCHLINE_FANTASY_BROWSE_POSITIONS.map((entry) => entry.code), ["GK", "RB", "CB", "LB", "CDM", "MID", "ATT", "ST"]);
  assert.equal(new Set(TOUCHLINE_FANTASY_BROWSE_POSITIONS.map((entry) => entry.bucket)).size, 8);
});

test("position review preserves a compatible chosen slot and never moves the XI", () => {
  const geometry = resolveTouchlineFormationGeometry("4-3-3");
  const selections = [{ playerId: "existing-defender", slotId: "RCB" }];
  const before = JSON.stringify(selections);
  assert.equal(resolveTouchlineFantasyBrowseSlot({ geometry, bucket: "centre-back", activeSlotId: "RCB", selections })?.id, "RCB");
  assert.equal(resolveTouchlineFantasyBrowseSlot({ geometry, bucket: "centre-back", activeSlotId: "GK", selections })?.id, "LCB");
  assert.equal(JSON.stringify(selections), before);
  assert.equal(resolveTouchlineFantasyBrowseSlot({ geometry: null, bucket: "goalkeeper", activeSlotId: null, selections }), null);
});

test("all formations fit card and label envelopes without collisions from phone landscape through TV", () => {
  for (const code of TOUCHLINE_CALIBRATED_FORMATION_CODES) {
    const slots = resolveTouchlineFormationGeometry(code).slots;
    // Portrait phones render a 250% board at .4 scale; these are layout pixels.
    for (const width of [500, 568, 640, 760, 850, 900, 1100, 1440, 1680, 2200]) {
      const height = width * 68 / 105;
      const cardWidth = touchlineFantasyPitchCardWidth(slots, width, height);
      assert.ok(cardWidth > 0 && cardWidth <= 96);
      const boxWidth = Math.max(cardWidth, 44);
      const boxHeight = cardWidth * 691 / 430 + 42;
      const boxes = slots.map((slot) => ({
        x: Math.min(89, Math.max(11, slot.x)) / 100 * width,
        y: Math.min(86, Math.max(14, slot.y)) / 100 * height,
      }));
      for (const [index, a] of boxes.entries()) {
        assert.ok(a.x >= boxWidth / 2 && a.x + boxWidth / 2 <= width, `${code} ${width}: horizontal bounds`);
        assert.ok(a.y >= boxHeight / 2 && a.y + boxHeight / 2 <= height, `${code} ${width}: vertical bounds`);
        for (const b of boxes.slice(index + 1)) {
          assert.ok(Math.abs(a.x - b.x) >= boxWidth + 8 || Math.abs(a.y - b.y) >= boxHeight + 8, `${code} ${width}: card/label collision`);
        }
      }
    }
  }
});
