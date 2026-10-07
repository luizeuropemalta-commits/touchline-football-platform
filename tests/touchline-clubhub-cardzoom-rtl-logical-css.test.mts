import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");

function declarationBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector}`);
  return match[1]!;
}

test("CardZoom uses logical inline/block edges for both close controls while keeping LTR end placement", () => {
  const detailsClose = declarationBlock(".panelWithDetails .close");
  assert.match(detailsClose, /inset-block-start: 4px;/);
  assert.match(detailsClose, /inset-inline-end: 0;/);
  assert.doesNotMatch(detailsClose, /\btop:|\bright:/);

  const close = declarationBlock(".close");
  assert.match(close, /inset-block-start: -12px;/);
  assert.match(close, /inset-inline-end: -12px;/);
  assert.doesNotMatch(close, /\btop:|\bright:/);
});

test("CardZoom aligns semantic text and inline spacing logically without changing grid geometry", () => {
  assert.match(declarationBlock(".expandedMeta span"), /text-align: end;/);
  assert.match(declarationBlock(".contractAction span"), /text-align: start;/);
  assert.match(declarationBlock(".identityDetails"), /text-align: end;/);
  assert.match(declarationBlock(".performanceDetails"), /text-align: start;/);
  assert.match(declarationBlock(".identityDetails::after"), /margin-inline-start: auto;/);
  assert.match(declarationBlock(".detailIcon"), /margin-inline-end: 7px;/);
  assert.match(declarationBlock(".fullPerformanceToggle"), /text-align: start;/);
  assert.match(css, /\.panelWithDetails \.identityDetails \{ text-align: start; \}/);
  assert.match(css, /\.panelWithDetails \.identityDetails::after \{ margin-inline-start: 0; \}/);
  assert.match(css, /\.panelWithDetails \.identityDetails \.detailsHeader \{ padding-inline-end: 52px; \}/);
  assert.match(css, /\.identityDetails \{ text-align: start; \}/);
  assert.match(css, /\.identityDetails::after \{ margin-inline-start: 0; \}/);
  const landscape = css.match(/@media \(orientation: landscape\) and \(max-height: 520px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(landscape, /\.panelWithDetails \.identityDetails \{ text-align: start; \}/);
  assert.match(landscape, /\.panelWithDetails \.identityDetails::after \{ margin-inline-start: 0; \}/);
  assert.match(landscape, /\.panelWithDetails \.identityDetails \.detailsHeader \{ padding-inline-end: 52px; \}/);
  assert.doesNotMatch(landscape, /text-align: left|margin-left: 0|padding-right: 52px/);
});

test("CardZoom preserves authored card/pitch geometry while limiting the logical conversion to semantic UI", () => {
  assert.match(css, /\.triggerFrame::after[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\);/);
  assert.match(css, /\.panelWithDetails[\s\S]*?grid-template-areas: "identity card performance";/);
  assert.match(css, /\.panelWithDetails[\s\S]*?grid-template-areas: "card" "identity" "performance";/);
});
