import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations,
  type TouchlineFormationGeometrySlot } from "../lib/touchlineArena/formation-geometry.ts";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("FantasyGameweekClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map<string, ts.FunctionDeclaration>();
const elements: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
const expression = (node: typeof elements[number], name: string) => {
  const attribute = node.attributes.properties.find((item): item is ts.JsxAttribute =>
    ts.isJsxAttribute(item) && item.name.getText(ast) === name);
  return attribute?.initializer && ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression?.getText(ast) : attribute?.initializer?.getText(ast);
};
type Projection = (slot: TouchlineFormationGeometrySlot) => { left: string; top: string };
function realProjection(name: string): Projection {
  const node = functions.get(name); assert.ok(node, name);
  const compiled = ts.transpileModule(`(${node.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(compiled);
}
const vertical = realProjection("verticalPitchPosition");
const horizontal = realProjection("horizontalMyClubPitchPosition");
const number = (value: string) => { assert.match(value, /^\d+(?:\.\d+)?%$/); return Number.parseFloat(value); };

test("real projections keep all 121 tactical slots on the team's correct side and preserve depth", () => {
  assert.equal(Object.keys(formations).length, 11);
  let checked = 0;
  for (const geometry of Object.values(formations)) {
    const before = JSON.stringify(geometry);
    const keeper = geometry.slots.find(slot => slot.id === "GK")!;
    for (const slot of geometry.slots) {
      const h = horizontal(slot), v = vertical(slot);
      const hx = number(h.left), hy = number(h.top), vx = number(v.left), vy = number(v.top);
      assert.ok(hx >= 11 && hx <= 89 && hy >= 14 && hy <= 86, `${geometry.formationCode}/${slot.id}: horizontal bounds`);
      assert.ok(vx >= 12 && vx <= 88 && vy >= 19 && vy <= 88, `${geometry.formationCode}/${slot.id}: vertical bounds`);
      // Attack goes right horizontally and up vertically. Team-right is
      // therefore screen-bottom horizontally and screen-right vertically.
      if (slot.side === "right") { assert.ok(hy > 50, slot.id); assert.ok(vx > 50, slot.id); }
      if (slot.side === "left") { assert.ok(hy < 50, slot.id); assert.ok(vx < 50, slot.id); }
      if (slot.side === "centre") { assert.equal(hy, 50); assert.equal(vx, 50); }
      if (slot !== keeper) {
        assert.ok(hx > number(horizontal(keeper).left));
        assert.ok(vy < number(vertical(keeper).top));
      }
      for (const other of geometry.slots) if (slot.x < other.x) {
        assert.ok(hx < number(horizontal(other).left), "depth order must not reverse");
        assert.ok(vy > number(vertical(other).top), "depth order must not reverse");
      }
      checked++;
    }
    assert.equal(JSON.stringify(geometry), before, "projection must not mutate slots, IDs or persisted indices");
  }
  assert.equal(checked, 121);
});

test("published/custom geometry coordinates are projected directly, with only existing edge clamps", () => {
  const template = formations["4-3-3"].slots.find(slot => slot.id === "RW")!;
  const custom = { ...template, x: 73, y: 23 };
  assert.equal(horizontal(custom).left, "73%");
  assert.equal(horizontal(custom).top, "77%");
  assert.equal(vertical(custom).left, "77%");
  assert.equal(number(vertical(custom).top), 19 + (15 * 69) / 76);
  assert.notDeepEqual(horizontal(custom), horizontal(template));
  const edge = { ...template, x: -5, y: 105 };
  assert.equal(horizontal(edge).left, "11%"); assert.equal(horizontal(edge).top, "14%");
  assert.equal(vertical(edge).left, "12%"); assert.equal(vertical(edge).top, "88%");
});

test("formation miniature uses the same transverse orientation and honors its input slot", () => {
  const dot = elements.find(node => expression(node, "className") === "styles.formationDot");
  assert.ok(dot);
  const cx = expression(dot, "cx"), cy = expression(dot, "cy");
  assert.ok(cx && cy);
  const project = runInNewContext(`slot => ({ x: ${cx}, y: ${cy} })`) as (slot: TouchlineFormationGeometrySlot) => { x: number; y: number };
  for (const geometry of Object.values(formations)) for (const slot of geometry.slots) {
    assert.equal(project(slot).x, slot.x * 1.05);
    assert.equal(project(slot).y, (100 - slot.y) * .68);
  }
  const custom = { ...formations["4-3-3"].slots[1], x: 27.5, y: 24.5 };
  assert.equal(project(custom).x, 27.5 * 1.05);
  assert.equal(project(custom).y, 75.5 * .68);
});

test("rendered slot identity remains bound to its label, click, neon, header and purchase destination", () => {
  const wrapper = elements.find(node => expression(node, "data-arena-slot") === "slot.id");
  assert.ok(wrapper);
  assert.equal(expression(wrapper, "key"), "slot.id");
  assert.match(expression(wrapper, "style")!, /horizontalMyClubPitchPosition\(slot\)/);
  const markup = wrapper.parent.getText(ast);
  assert.match(markup, /<b>\{slot\.id\}<\/b>/);
  assert.match(markup, /onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  assert.match(markup, /guidedChoice\.slot === slot\.id/);
  assert.match(source, /setActiveSlotId\(slotId\)/);
  assert.match(source, /const marketTargetSlot = marketPage \? activeSlot : browseSlot/);
  const headings = elements.filter(node => expression(node, "data-market-target-slot") !== undefined);
  assert.equal(headings.length, 1);
  const heading = headings[0];
  assert.ok(heading);
  const targetExpression = expression(heading, "data-market-target-slot")!;
  const target = runInNewContext(`(collectionDestination, marketTargetSlot) => (${targetExpression})`) as
    (destination: { area: string; slot: number } | null, slot: { id: string } | null) => string | undefined;
  assert.equal(target(null, null), undefined);
  for (const geometry of Object.values(formations)) for (const slot of geometry.slots) {
    assert.equal(target(null, slot), slot.id);
    for (const area of ["starters", "reserves", "outside"]) {
      assert.equal(target({ area, slot: 0 }, slot), `${area}:0`);
      assert.equal(target({ area, slot: 8 }, slot), `${area}:8`);
    }
  }
  assert.match(heading.parent.getText(ast), /xiSlot\.replace\("\{slot\}", marketTargetSlot\.id\)/);
  const purchase = functions.get("addPlayer")!.getText(ast);
  assert.match(purchase, /const slotId = activeSlot\?\.id/);
  assert.match(purchase, /geometry\.slots\.findIndex\(entry => entry\.id === slot\.id\)/);
  assert.match(purchase, /collection\.purchase\(playerId, destination\)/);
});
