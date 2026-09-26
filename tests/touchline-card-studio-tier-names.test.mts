import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the seven-tier studio uses the same names as public player and coach cards", () => {
  const source = readFileSync(new URL("../app/visual-qa/touchline-card-studio/page.tsx", import.meta.url), "utf8");
  assert.ok(!/label: "(?:Ruby Red|Sapphire Blue|Amethyst Purple|Emerald Green|Diamond Gold)"/.test(source), "studio labels must not retain the superseded English dictionary");
  assert.ok(source.includes('touchlineCardTierName(preview.tierKey, "en-GB")'), "resolve preview labels from the canonical tier dictionary");
});
