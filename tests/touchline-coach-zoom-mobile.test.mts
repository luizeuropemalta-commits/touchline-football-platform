import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("coach zoom preserves the canonical card-relative crest sizing on a phone", () => {
  const zoom = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCardZoom.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  assert.match(zoom, /expandedContent=\{\s*<TouchlineCoachCard/);
  // The positioned clubBadge is only 10% of the inner card. A 100% cap
  // here would shrink the canonical cqw artwork to that anchor's width.
  assert.doesNotMatch(css, /\.expandedCard[^{}]*\[data-touchline-card-crest-host="true"\][^{}]*\{/);
  const cardCss = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCard.module.css", import.meta.url), "utf8");
  for (const selector of ['.clubBadge [data-touchline-card-crest-host="true"]', '.clubBadge [data-touchline-card-crest-host="true"] > img']) {
    const rule = cardCss.slice(cardCss.indexOf(selector + " {"));
    assert.ok(rule.startsWith(selector + " {"), "canonical crest rule required");
    const declarations = rule.slice(0, rule.indexOf("}"));
    assert.match(declarations, /width: var\(--coach-crest-size, 132px\);/);
    assert.match(declarations, /height: var\(--coach-crest-size, 132px\);/);
    assert.match(declarations, /max-width: none;/);
  }
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.panelWithDetails \{[^}]*width: min\(390px, calc\(100vw - 28px\)\)/);
});
