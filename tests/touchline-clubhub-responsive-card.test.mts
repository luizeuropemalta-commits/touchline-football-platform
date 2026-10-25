import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const native = createRequire(import.meta.url);
const postcss = createRequire(native.resolve("next"))("postcss");
type Parent = { type: string; name?: string; params?: string; parent?: Parent };

// Evaluate actual declarations at each breakpoint. This is a CSS contract,
// not a substitute for rendered overflow/focus and physical Safari checks.
function declarations(file: string, selector: string, width: number) {
  const css = postcss.parse(readFileSync(new URL(`../components/touchline/${file}.module.css`, import.meta.url), "utf8"));
  const result: Record<string, string> = {};
  css.walkRules((rule: { selector: string; parent?: Parent; walkDecls: (callback: (decl: { prop: string; value: string }) => void) => void }) => {
    if (!rule.selector.split(",").some(value => value.trim() === selector)) return;
    let parent = rule.parent;
    while (parent) {
      if (parent.type === "atrule" && parent.name === "media") {
        const max = parent.params?.match(/max-width:\s*([\d.]+)px/);
        if (max && width > Number(max[1])) return;
      }
      // These surfaces must not replace rows with a container-query cascade.
      assert.notEqual(parent.name, "container");
      parent = parent.parent;
    }
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

test("outside-match roster keeps progressive controls reachable beyond the first twelve cards", () => {
  const css = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.module.css", import.meta.url), "utf8");
  const roster = readFileSync(new URL("../components/touchline/ClubHubOutsideMatchRoster.tsx", import.meta.url), "utf8");
  assert.match(roster, /initialCardCount=\{12\}/);
  assert.doesNotMatch(css, /\.cards :global\(\.club-hub-progressive-controls\)\s*\{[^}]*display:\s*none/);
});

test("outside-match roster retains six readable columns with contained horizontal scrolling", () => {
  for (const width of [320, 390, 680, 720, 844, 1100, 1440]) {
    const grid = declarations("ClubHubOutsideMatchRoster", ".cards :global(.club-hub-card-grid)", width);
    assert.equal(grid["grid-template-columns"], "repeat(6, minmax(154px, 1fr))");
    assert.equal(grid["overflow-x"], "auto");
    assert.equal(grid["overscroll-behavior-x"], "contain");
    assert.equal(declarations("ClubHubOutsideMatchRoster", ".cards :global(.club-hub-card-meta small)", width)["font-size"], "11px");
  }
});

test("technical area keeps coach beside all nine bench slots without reducing card artwork", () => {
  for (const width of [320, 390, 680, 720, 800, 844, 1440]) {
    const content = declarations("ClubHubMatchdayTechnicalArea", ".content", width);
    assert.equal(content["grid-template-columns"], "minmax(164px, .72fr) minmax(0, 2.45fr)");
    const cards = declarations("ClubHubMatchdayTechnicalArea", ".cards", width);
    assert.equal(cards["grid-template-columns"], "repeat(9, minmax(80px, 1fr))");
    assert.equal(cards["overflow-x"], "auto");
    assert.equal(cards["overscroll-behavior-x"], "contain");
    assert.notEqual(declarations("ClubHubMatchdayTechnicalArea", ".header", width)["flex-direction"], "column");
  }
});

test("compact standalone squad retains four readable columns, desktop keeps existing auto-fill", () => {
  for (const width of [320, 390, 680, 720, 844, 1440]) {
    const grid = declarations("ClubHubSquadGrid", ".grid", width);
    assert.equal(grid["grid-template-columns"], width <= 720 ? "repeat(4, minmax(218px, 1fr))" : "repeat(auto-fill, minmax(218px, 1fr))");
    assert.equal(grid["overflow-x"], "auto");
    assert.equal(declarations("ClubHubSquadGrid", ".meta a", width)["min-height"], "44px");
    assert.equal(declarations("ClubHubSquadGrid", ".controls button", width)["min-height"], "44px");
    assert.equal(declarations("ClubHubSquadGrid", ".controls button", width)["flex-shrink"], "0");
    assert.notEqual(declarations("ClubHubSquadGrid", ".controls", width)["flex-direction"], "column");
    assert.equal(declarations("ClubHubSquadGrid", ".artwork", width).width, "min(100%, 180px)");
  }
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
