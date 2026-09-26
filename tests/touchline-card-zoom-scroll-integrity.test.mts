import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("short landscape details mask underlying page artwork without changing the card column", () => {
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  const landscape = css.slice(css.indexOf("@media (orientation: landscape) and (max-height: 520px)"));
  const details = landscape.match(/\.panelWithDetails \.details\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(details, /background: rgb\(2, 8, 9\);/);
  assert.doesNotMatch(details, /overflow:\s*hidden|transform:|display:\s*none/);
  assert.match(css.slice(0, css.indexOf("@media (orientation: landscape)")), /\.details\s*\{[^}]*background: transparent;/);
});

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("touch users retain a visible close control while scrolling expanded details", () => {
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const close = zoomCss.match(/\.panelWithDetails \.close \{([^}]+)\}/)?.[1] ?? "";
  assert.match(close, /position: sticky/);
  assert.match(close, /top: 4px/);
  assert.match(close, /grid-column: 1 \/ -1/);
  assert.match(close, /grid-row: 1/);
  assert.match(close, /justify-self: end/);
});

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

  assert.match(globalCss, /scrollbar-color: #608b32 #030a08 !important;/);
  assert.match(globalCss, /::-webkit-scrollbar-track \{ background: #030a08 !important; \}/);
  assert.match(globalCss, /::-webkit-scrollbar \{ width: 5px !important; height: 5px !important;/);
  assert.match(globalCss, /\*:is\(:hover, :focus-within, :active\)\s*\{\s*scrollbar-color: #b8ff46 #030a08 !important;/);
  assert.doesNotMatch(globalCss, /#17364a|#0f5360|#1d536c|#19a1ad/);
});

test("the zoom close control stays neutral instead of inheriting a card tier color", () => {
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const closeRule = zoomCss.slice(zoomCss.indexOf(".close {"), zoomCss.indexOf(".contractAction {"));

  assert.match(closeRule, /border: 1px solid rgba\(158, 255, 45, \.62\);/);
  assert.match(closeRule, /color: #eaffba;/);
  assert.doesNotMatch(closeRule, /touchline-card-zoom-accent/);
});

test("card zoom ignores a drag gesture while preserving keyboard activation", () => {
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");

  assert.match(zoom, /pointerOriginRef/);
  assert.match(zoom, /Math\.hypot\([\s\S]*?\) >= 8/);
  assert.match(zoom, /if \(pointerMovedRef\.current\) \{[\s\S]*?return;/);
  assert.match(zoom, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(zoomCss, /touch-action: pan-x pan-y;/);
});

test("short landscape zoom keeps named card regions and scales the artwork to its measured column", () => {
  const zoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const zoomCss = source("components/touchline/cards/TouchlineCardZoom.module.css");
  const landscape = zoomCss.slice(zoomCss.indexOf("@media (orientation: landscape) and (max-height: 520px)"));

  assert.match(landscape, /grid-template-areas: "card identity" "card performance"/);
  assert.doesNotMatch(landscape, /grid-column: auto|grid-row: auto|--touchline-card-static-scale: \.5/);
  assert.match(landscape, /--touchline-card-zoom-width: min\(245px, calc\(\(100dvh - 64px\) \* \.51\)\)/);
  assert.match(zoom, /new ResizeObserver/);
  assert.match(zoom, /entry\.contentRect\.width/);
  assert.match(zoom, /"--touchline-card-static-scale", String\(Math\.min\(1, width \/ 430\)\)/);
  assert.match(zoom, /return \(\) => observer\.disconnect\(\)/);
});
