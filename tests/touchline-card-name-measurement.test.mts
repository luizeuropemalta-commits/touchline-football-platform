import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("TouchlineEliteExactCard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations: string[] = [];
const effects: ts.ArrowFunction[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "fitShirtBackNameSize") declarations.push(node.getText(file));
  if (ts.isVariableDeclaration(node) && ["SHIRT_NAME_READABILITY_MULTIPLIER", "MIN_SHIRT_NAME_HORIZONTAL_SCALE"].includes(node.name.getText(file))) {
    declarations.push(`const ${node.getText(file)};`);
  }
  if (ts.isCallExpression(node) && node.expression.getText(file) === "useLayoutEffect"
    && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].getText(file).includes("shirtNameMaskRef.current")) {
    effects.push(node.arguments[0]);
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.equal(effects.length, 1);
assert.equal(declarations.length, 3);
const script = ts.transpileModule(`${declarations.join("\n")}\nexports.install = ${effects[0].getText(file)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

type Fit = { size: number; horizontalScale: number };
// Run the production effect with controlled browser measurements. Native font
// rendering and the visual card remain separate browser checks.
function fixture({ contextAvailable = true, maskPresent = true, documentPresent = true } = {}) {
  const mask = { clientWidth: 220 };
  const metrics = { canvases: 0, contexts: 0, measurements: 0, updates: 0, commits: 0, disconnected: 0 };
  let state: Fit = { size: 0, horizontalScale: 0 };
  let textWidth = 200;
  let resize = () => {};
  let resolveFonts!: () => void;
  const ready = new Promise<void>((resolve) => { resolveFonts = resolve; });
  const context = {
    font: "",
    measureText(text: string) {
      metrics.measurements++;
      assert.equal(text, "RONALDO");
      assert.equal(this.font, `950 ${31 * 1.2}px "Bebas Neue", "Anton", Impact, Inter, sans-serif`);
      return { width: textWidth };
    },
  };
  const exports = {} as { install: () => (() => void) | undefined };
  runInNewContext(script, {
    exports,
    ...(documentPresent ? { document: {
      fonts: { ready },
      createElement(tag: string) {
        assert.equal(tag, "canvas"); metrics.canvases++;
        return { getContext(kind: string) {
          assert.equal(kind, "2d"); metrics.contexts++;
          return contextAvailable ? context : null;
        } };
      },
    } } : {}),
    shirtNameMaskRef: { current: maskPresent ? mask : null },
    shirtPlayerName: "Ronaldo", shirtClubScale: 1, shirtNamePadding: { left: 10, right: 10 },
    setShirtPlayerNameFit(update: Fit | ((previous: Fit) => Fit)) {
      metrics.updates++;
      const next = typeof update === "function" ? update(state) : update;
      if (next !== state) metrics.commits++;
      state = next;
    },
    ResizeObserver: class {
      constructor(callback: () => void) { resize = callback; }
      observe(target: unknown) { assert.equal(target, mask); }
      disconnect() { metrics.disconnected++; }
    },
  });
  const cleanup = exports.install();
  return { cleanup, mask, context, metrics, state: () => state, resize: () => resize(),
    setTextWidth(width: number) { textWidth = width; },
    async fontsReady() { resolveFonts(); await ready; },
  };
}

test("shirt name reuses one canvas and preserves state identity for unchanged resize and font measurements", async () => {
  const h = fixture();
  const initial = h.state();
  assert.equal(initial.size, 37.2);
  assert.equal(initial.horizontalScale, 0.97);
  h.resize();
  await h.fontsReady();
  assert.equal(h.metrics.measurements, 3);
  assert.equal(h.metrics.canvases, 1);
  assert.equal(h.metrics.contexts, 1);
  assert.equal(h.metrics.commits, 1);
  assert.equal(h.state(), initial);
  h.cleanup?.();
});

test("shirt name still refits changing geometry and loaded font metrics with the precise font", async () => {
  const h = fixture();
  h.mask.clientWidth = 100;
  h.context.font = "browser context font reset";
  h.resize();
  assert.equal(h.state().size, 18.5);
  assert.equal(h.state().horizontalScale, 0.78);
  const resized = h.state();
  h.setTextWidth(100);
  await h.fontsReady();
  assert.equal(h.state().size, 37.01);
  assert.equal(h.state().horizontalScale, 0.78);
  assert.notEqual(h.state(), resized);
  assert.equal(h.metrics.commits, 3);
  assert.equal(h.metrics.canvases, 1);
  h.cleanup?.();
});

test("shirt name cleanup ignores late font readiness and queued observer delivery", async () => {
  const h = fixture();
  const initial = h.state();
  h.cleanup?.();
  h.mask.clientWidth = 1;
  h.resize();
  await h.fontsReady();
  assert.equal(h.metrics.disconnected, 1);
  assert.equal(h.metrics.measurements, 1);
  assert.equal(h.metrics.updates, 1);
  assert.equal(h.state(), initial);
});

test("unavailable canvas context preserves the existing fallback without repeated state commits", async () => {
  const h = fixture({ contextAvailable: false });
  const initial = h.state();
  assert.equal(initial.size, 31 * 1.2);
  assert.equal(initial.horizontalScale, 1);
  h.resize();
  await h.fontsReady();
  assert.equal(h.state(), initial);
  assert.equal(h.metrics.commits, 1);
  assert.equal(h.metrics.contexts, 1);
  assert.equal(h.metrics.measurements, 0);
  h.cleanup?.();
});

test("missing mask or document allocates no measurement resources", () => {
  for (const options of [{ maskPresent: false }, { documentPresent: false }]) {
    const h = fixture(options);
    assert.equal(h.cleanup, undefined);
    assert.equal(h.metrics.canvases, 0);
    assert.equal(h.metrics.updates, 0);
  }
});
