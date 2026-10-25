import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const coachCss = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCard.module.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("FantasyGameweekClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function rules(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^{}]*)\\}`, "g")), match => match[1]);
}
function rule(selector: string) {
  const result = rules(selector);
  assert.ok(result.length, `missing rule: ${selector}`);
  return result.join(";");
}
function elementWithAttribute(name: string) {
  let found: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === name)) found = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `missing JSX element: ${name}`);
  return found;
}
function nearestElement(node: ts.Node) {
  let parent = node.parent;
  while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
  return parent;
}

test("Arena controls occupy a measured sibling row, not the regulation pitch", () => {
  const toolbar = elementWithAttribute("data-arena-toolbar");
  let pitch: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "TouchlinePitchSurface"
      && node.openingElement.getText(tree).includes("styles.myClubTacticalPitch")) pitch = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(pitch);
  assert.equal(nearestElement(toolbar)?.pos, nearestElement(pitch)?.pos, "toolbar and field share a containing element");
  assert.ok(toolbar.end < pitch.pos, "header precedes field in document flow");
  for (const attribute of ["data-arena-formation", "data-arena-hud-right", "data-arena-coach"]) {
    assert.ok(toolbar.getText(tree).includes(attribute));
    assert.ok(!pitch.getText(tree).includes(attribute));
  }
  assert.match(pitch.getText(tree), /selectedCards\.map/);
});

test("coach and HUD use normal grid flow with no fixed-height headroom", () => {
  assert.match(rule(".arenaToolbar"), /display:\s*grid/);
  assert.match(rule(".arenaCoach"), /position:\s*relative/);
  assert.doesNotMatch(rule(".arenaCoach"), /translate|top:\s*-/);
  assert.match(rule(".arenaFormationControl, .arenaHudRight"), /position:\s*relative/);
  assert.doesNotMatch(rule(".arenaFormationControl, .arenaHudRight"), /bottom:/);
  for (const viewport of [".arenaOverlay .myClubPitchViewport", '.myClubCommand.arenaOverlay[data-fantasy-context="market"] .myClubPitchViewport']) {
    assert.match(rule(viewport), /padding-top:\s*0/);
    assert.doesNotMatch(rule(viewport), /padding-top:\s*(?:60|94)px/);
  }
});

test("coach crown clearance scales with the actual card rather than a device height", () => {
  const aspect = coachCss.match(/\.shell\s*\{[^}]*aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/);
  const crown = coachCss.match(/\.leadershipCrown\s*\{[^}]*top:\s*-([\d.]+)%/);
  const padding = rule(".arenaCoach > div").match(/padding-block-start:\s*([\d.]+)%/);
  assert.ok(aspect && crown && padding);
  const heightRatio = Number(aspect[2]) / Number(aspect[1]);
  for (const width of [32, 48, 73, 96, 144]) {
    const crownExtent = width * heightRatio * Number(crown[1]) / 100;
    const reserved = width * Number(padding[1]) / 100;
    assert.ok(reserved + 0.001 >= crownExtent, `${width}px coach crown fits reserved header space`);
  }
});

test("expanded formation selection is bounded by its safe-area parent", () => {
  const selection = rule(".arenaFormationControl .formationSelectionPanel");
  assert.match(selection, /position:\s*static/);
  assert.match(selection, /width:\s*100%/);
  assert.match(selection, /max-width:\s*100%/);
  assert.doesNotMatch(selection, /\b\d+(?:d?vw)\b|left:|right:/);
  assert.match(rule(".arenaFormationControl:has(.formationPicker[open])"), /grid-column:\s*1\s*\/\s*-1/);
  const overlay = rule('.myClubCommand.arenaOverlay[data-fantasy-context="market"]');
  assert.match(overlay, /safe-area-inset-left/);
  assert.match(overlay, /safe-area-inset-right/);
  assert.match(overlay, /overflow:\s*auto/);
});

test("normal desktop ClubOwner cannot retain the obsolete two-column Live rail", () => {
  const parent = '.myClubCommand[data-fantasy-context="market"]:not(.arenaOverlay)';
  assert.equal(rules(`${parent} .arenaBody`).length, 0);
  assert.equal(rules(`${parent} .arenaLiveRail`).length, 0);
  assert.match(rule('.myClubCommand[data-fantasy-context="market"] .arenaBody'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("narrow Arena close control preserves a 44px touch target in both axes", () => {
  const shared = rules(".arenaHudRight > .viewToggle")[0];
  assert.ok(shared, "common close-control rule exists independently of narrow override");
  assert.match(shared, /min-width:\s*44px/);
  assert.match(shared, /min-height:\s*44px/);
  const narrow = css.match(/@media\s*\(max-width:\s*900px\)\s*\{\s*\.arenaFormationControl\s*\{[^}]*\}\s*\.arenaHudRight > \.viewToggle\s*\{([^}]*)\}/);
  assert.ok(narrow, "narrow close-control rule exists");
  assert.match(narrow[1], /min-width:\s*44px/);
  assert.match(narrow[1], /min-height:\s*44px/);
  assert.doesNotMatch(narrow[1], /min-height:\s*32px/);
});
