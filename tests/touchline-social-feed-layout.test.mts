import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("an unpaired feed post uses the available desktop width without stretching its copy vertically", () => {
  const css = readFileSync(new URL("../components/touchline/social/TouchlineSocial.module.css", import.meta.url), "utf8");
  const desktop = css.match(/@media \(min-width: 981px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(desktop, /\.post:last-child:nth-child\(even\) \{ grid-column: 1 \/ -1; \}/);
  assert.match(desktop, /\.post:last-child:nth-child\(even\) \.postBody \{ display: grid;/);
  assert.match(desktop, /\.post:last-child:nth-child\(even\) \.postCopy \{ min-height: 0;/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /\.postBody, \.post\[data-featured="true"\] \.postBody \{ display: flex; min-height: 0; flex-direction: column;/);
});

test("feed fact labels wrap rather than hiding identity and tier text behind ellipses", () => {
  const css = readFileSync(new URL("../components/touchline/social/TouchlineSocial.module.css", import.meta.url), "utf8");
  const rule = css.match(/\.postMetrics strong, \.postMetrics span \{([^}]+)\}/)?.[1] ?? "";
  assert.match(rule, /white-space: normal/);
  assert.match(rule, /overflow-wrap: anywhere/);
  assert.doesNotMatch(rule, /text-overflow: ellipsis|overflow: hidden/);
});
