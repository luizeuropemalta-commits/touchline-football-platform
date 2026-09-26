import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("outside-match roster keeps progressive controls reachable beyond the first twelve cards", () => {
  const css = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.module.css", import.meta.url), "utf8");
  const roster = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.tsx", import.meta.url), "utf8");
  assert.match(roster, /initialCardCount=\{12\}/);
  assert.doesNotMatch(css, /\.cards :global\(\.club-hub-progressive-controls\)\s*\{[^}]*display:\s*none/);
});

test("outside-match roster uses four columns at compact landscape widths and two on smaller screens", () => {
  const css = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.module.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 1100px\)\s*\{\s*\.cards :global\(\.club-hub-card-grid\)\s*\{ grid-template-columns: repeat\(4,/);
  assert.match(css.slice(css.indexOf("@media (max-width: 680px)")), /grid-template-columns: repeat\(2,/);
});

test("ClubHub grid cards measure their shell instead of locking artwork to a static canvas scale", () => {
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  const embeddedCard = grid.slice(grid.indexOf('className={`club-hub-rendered-card'), grid.indexOf("</TouchlineCardZoom>"));
  assert.doesNotMatch(embeddedCard, /staticRenderScale=/);
  assert.match(embeddedCard, /initialRenderScale=\{cardRenderScale\}/);
  const css = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.module.css", import.meta.url), "utf8");
  assert.match(grid, /styles\.grid/);
  assert.match(css, /\.grid\s*\{\s*display: grid/);
  const style = css.match(/\.artwork\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.doesNotMatch(style, /--touchline-card-static-scale/);
  assert.match(style, /min\(100%, 180px\)/);
});
