import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("card artwork stays natural without an extra focus rectangle or glow", () => {
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  const normal = css.match(/\.trigger:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(normal, /outline: none/);
  assert.match(normal, /filter: none/);
  assert.doesNotMatch(normal, /drop-shadow|border-radius|outline:.*solid/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{\s*\.trigger:focus-visible\s*\{[^}]*outline: 2px solid Highlight/);
});

test("keyboard focus has a quiet external marker without resizing or intercepting the card", () => {
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  const marker = css.match(/\.triggerFrame::after\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(marker, /content: ""/);
  assert.match(marker, /position: absolute/);
  assert.match(marker, /width: min\(32px, 40%\)/);
  assert.match(marker, /height: 2px/);
  assert.match(marker, /bottom: -5px/);
  assert.match(marker, /background: #efffd2/);
  assert.match(marker, /pointer-events: none/);
  assert.match(marker, /opacity: 0/);
  const trigger = css.match(/\.trigger\s*\{([^}]*)\}/)?.[1] ?? "";
  const scrollMargin = Number(trigger.match(/scroll-margin-bottom:\s*([\d.]+)px/)?.[1]);
  const externalExtent = -Number(marker.match(/bottom:\s*(-?[\d.]+)px/)?.[1]);
  assert.ok(Number.isFinite(scrollMargin) && scrollMargin > externalExtent,
    "Native keyboard scrolling must include the external focus marker plus rounding clearance");
  assert.doesNotMatch(marker, /box-shadow|filter:|animation:|transition:/);
  assert.match(css, /\.triggerFrame:has\(> \.trigger:focus-visible\)::after\s*\{\s*opacity: 1/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.triggerFrame::after\s*\{\s*display: none/);
});
