import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("both official galleries use continuous tier-coloured perimeter traces without a second hover sweep", () => {
  const source = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/<TouchlineClubPerimeterTrace accent=\{touchlineCardTierPalette\(tierKey\)\.accent\} \/>/g)?.length, 2);
  const css = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.module.css", import.meta.url), "utf8");
  assert.match(css, /--touchline-perimeter-radius: 20px/);
  assert.match(css, /radial-gradient\(circle at 50% 4%/);
  assert.doesNotMatch(css, /touchlineTierEdge|\.card::after/);
  const shared = readFileSync(new URL("../components/touchline/TouchlineClubPerimeterTrace.module.css", import.meta.url), "utf8");
  assert.match(shared, /linear infinite/);
  assert.match(shared, /prefers-reduced-motion: reduce/);
  assert.match(shared, /pointer-events: none/);
});
