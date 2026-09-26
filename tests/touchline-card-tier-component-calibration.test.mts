import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATION_REVISION,
  TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS,
  resolveTouchlineCardTierComponentCalibration,
  touchlineCardTierComponentScale,
} from "../lib/touchlineArena/card-tier-component-calibration.ts";
import { TOUCHLINE_CARD_TIER_KEYS } from "../lib/touchlineArena/card-rules.ts";

test("visual calibration reserves the same canvas width as its fixed artwork scale", () => {
  const source = readFileSync(new URL("../app/visual-qa/card-tier-component-calibration/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const renderScale = zoom \? 0\.4 : 0\.28/);
  assert.match(source, /width: 430 \* renderScale/);
  assert.match(source, /staticRenderScale=\{renderScale\}/);
});

test("seven-tier component calibration has one deterministic contract per approved tier", () => {
  assert.equal(TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATION_REVISION, "touchline-card-tier-component-calibration-v1");
  assert.deepEqual(Object.keys(TOUCHLINE_CARD_TIER_COMPONENT_CALIBRATIONS), [...TOUCHLINE_CARD_TIER_KEYS]);

  for (const tierKey of TOUCHLINE_CARD_TIER_KEYS) {
    const calibration = resolveTouchlineCardTierComponentCalibration(tierKey);
    assert.ok(calibration);
    assert.equal(calibration.tierKey, tierKey);
    assert.equal(calibration.layoutRevision, "touchline-premier-shirt-back-card-layout-v6");
    assert.match(calibration.palette.accent, /^#/);
    assert.match(calibration.palette.secondary, /^#/);
  }
});

test("normal, compact and zoom preserve approved component geometry until visual QA records a measured exception", () => {
  const components = ["name", "number", "crest", "points", "actions", "logo"] as const;
  const presentations = ["normal", "compact", "zoom"] as const;

  for (const tierKey of TOUCHLINE_CARD_TIER_KEYS) {
    const calibration = resolveTouchlineCardTierComponentCalibration(tierKey);
    for (const presentation of presentations) {
      for (const component of components) {
        assert.equal(touchlineCardTierComponentScale(calibration, presentation, component), 1);
      }
    }
  }
});

test("an absent tier cannot invent a frame or a calibration", () => {
  assert.equal(resolveTouchlineCardTierComponentCalibration(null), null);
  assert.equal(touchlineCardTierComponentScale(null, "normal", "crest"), 1);
});
