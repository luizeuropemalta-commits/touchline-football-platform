import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("expanded cards lock the document and keep one modal scroll surface", () => {
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");

  assert.match(zoom, /root\.style\.overflow = "hidden"/);
  assert.match(zoom, /body\.style\.overflow = "hidden"/);
  assert.match(zoom, /touchlineModalScrollLock = "true"/);
  assert.match(zoom, /root\.style\.overflow = previousRootOverflow/);
  assert.match(zoom, /body\.style\.overflow = previousBodyOverflow/);
  assert.match(zoomCss, /\.backdrop \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(zoomCss, /\.panelWithDetails \{[\s\S]*?overflow: visible;/);
});

test("the global scrollbar uses the neutral TouchLine green and graphite standard", () => {
  const globalCss = source("app/globals.css");

  assert.match(globalCss, /scrollbar-color: rgba\(144, 205, 52, \.72\) #030a08;/);
  assert.match(globalCss, /::-webkit-scrollbar-track \{ background: #030a08; \}/);
  assert.match(globalCss, /#8bc93d/);
  assert.match(globalCss, /#4f851e/);
  assert.doesNotMatch(globalCss, /#17364a|#0f5360|#1d536c|#19a1ad/);
});

test("the zoom close control stays neutral instead of inheriting a card tier color", () => {
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const closeRule = zoomCss.slice(zoomCss.indexOf(".close {"), zoomCss.indexOf(".contractAction {"));

  assert.match(closeRule, /border: 1px solid rgba\(158, 255, 45, \.62\);/);
  assert.match(closeRule, /color: #eaffba;/);
  assert.doesNotMatch(closeRule, /touchline-card-zoom-accent/);
});
