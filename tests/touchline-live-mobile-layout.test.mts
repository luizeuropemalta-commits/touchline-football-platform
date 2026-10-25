import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const native = createRequire(import.meta.url);
const postcss = createRequire(native.resolve("next"))("postcss");
const css = postcss.parse(readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8"));
type ParentRule = { type: string; name?: string; params?: string; parent?: ParentRule };

// A declaration-cascade contract, not a browser-layout substitute. Evaluate
// the actual media rules for the standalone selectors relevant to this fix.
function mediaMatches(query: string, width: number, height: number): boolean {
  return query.split(",").some(part => {
    if (/prefers-reduced-motion/.test(part)) return false;
    const minWidth = part.match(/min-width\s*:\s*([\d.]+)px/);
    const maxWidth = part.match(/max-width\s*:\s*([\d.]+)px/);
    const maxHeight = part.match(/max-height\s*:\s*([\d.]+)px/);
    const orientation = part.match(/orientation\s*:\s*(landscape|portrait)/);
    return (!minWidth || width >= Number(minWidth[1]))
      && (!maxWidth || width <= Number(maxWidth[1]))
      && (!maxHeight || height <= Number(maxHeight[1]))
      && (!orientation || (width > height ? "landscape" : "portrait") === orientation[1]);
  });
}
function declarations(selector: string, width: number, height: number) {
  const result: Record<string, string> = {};
  css.walkRules((rule: { selector: string; parent?: ParentRule; walkDecls: (callback: (decl: { prop: string; value: string }) => void) => void }) => {
    if (!rule.selector.split(",").some(value => value.trim() === selector)) return;
    let parent = rule.parent;
    while (parent) {
      if (parent.type === "atrule" && parent.name === "media" && !mediaMatches(parent.params ?? "", width, height)) return;
      parent = parent.parent;
    }
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

test("844px iPhone landscape uses a compact left rail while portrait retains its mobile layout", () => {
  for (const width of [740, 844, 850, 851, 1024, 1250]) {
    const layout = declarations(".layout", width, 390);
    assert.equal(layout["grid-template-columns"], "minmax(220px,27%) minmax(0,1fr)");
    assert.match(layout["padding-inline"], /safe-area-inset-left/);
    assert.match(layout["padding-inline"], /safe-area-inset-right/);
    const rail = declarations(".fixtureRail", width, 390);
    assert.equal(rail.display, "grid");
    assert.equal(rail.order, "0");
    assert.equal(rail["max-height"], "calc(100dvh - 28px)");
    assert.equal(declarations(".fixtureScroller", width, 390)["overflow-y"], "auto");
    assert.equal(declarations(".fixtureList", width, 390)["grid-auto-flow"], "row");
    assert.equal(declarations(".fixtureStack", width, 390)["grid-template-columns"], "minmax(0,1fr)");
  }
  assert.equal(declarations(".layout", 390, 844)["grid-template-columns"], "1fr");
  assert.equal(declarations(".fixtureList", 390, 844)["grid-auto-flow"], "column");
  assert.equal(declarations(".layout", 1440, 900)["grid-template-columns"], "minmax(340px, 390px) minmax(0, 1fr)");
});

test("timeline and long names stay in shrinkable wrapped tracks rather than neighbouring data", () => {
  const timeline = declarations(".timelinePanel > ol > li", 844, 390);
  assert.equal(timeline["grid-template-columns"], "34px minmax(0,1fr)");
  assert.equal(declarations(".timelinePanel li > span:not(.eventPoints)", 844, 390)["min-width"], "0");
  for (const selector of [".timelinePanel li > span > b", ".playerIdentity strong", ".pointsSummary li strong", ".cardHighlights li strong"]) {
    const value = declarations(selector, 844, 390);
    assert.equal(value["white-space"], "normal", selector);
    assert.equal(value["overflow-wrap"], "anywhere", selector);
  }
  const highlights = declarations(".cardHighlights ol", 844, 390);
  assert.equal(highlights["grid-template-columns"], "repeat(auto-fit,minmax(min(100%,140px),1fr))");
  assert.equal(declarations(".pointsSummary li > b", 844, 390).flex, "0 0 auto", "ratings retain their own fixed-size flex item");
});

test("timeline keeps each event's club in the narrow layout instead of hiding its source identity", () => {
  for (const width of [320, 390, 650, 651, 844, 1280]) {
    const club = declarations(".timelinePanel li > em", width, 390);
    assert.notEqual(club.display, "none", `${width}px club must remain displayed`);
    assert.notEqual(club.visibility, "hidden", `${width}px club must remain visible`);
    assert.equal(club["grid-column"], "2", `${width}px club stays below its player, not across the time column`);
    assert.equal(club["min-width"], "0");
    assert.equal(club["white-space"], "normal");
    assert.equal(club["overflow-wrap"], "anywhere");
    assert.equal(declarations(".timelinePanel > ol > li", width, 390)["grid-template-columns"], "34px minmax(0,1fr)");
  }
  // Inspect the real JSX rather than reproducing the event row in a fixture.
  // This proves the unconditionally rendered identity binding, not pixels.
  const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("TouchlineMatchCentre.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const clubs: ts.JsxElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "em"
      && node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(tree) === "teamName(verifiedDetail, event.teamId)")) clubs.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(clubs.length, 1);
  const row = clubs[0].parent;
  assert.ok(ts.isJsxElement(row));
  assert.equal(row.openingElement.tagName.getText(tree), "li", "club is a direct row child, not conditional hidden markup");
  assert.ok(row.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(tree) === "key"
    && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression?.getText(tree) === "event.id"));
});

test("team sheet has exactly the four tracks actually rendered by MatchTeamSheet", () => {
  const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("TouchlineMatchCentre.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let row: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "renderRows") {
      const findRow = (child: ts.Node) => {
        if (ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === "li") row = child;
        ts.forEachChild(child, findRow);
      };
      ts.forEachChild(node, findRow);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(row);
  assert.equal(row.children.filter(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === "span").length, 4);
  assert.equal(declarations(".teamSheet li", 844, 390)["grid-template-columns"], "28px minmax(0,1fr) 34px 44px");
  assert.equal(declarations(".teamSheet li > span", 844, 390)["min-width"], "0");
});
