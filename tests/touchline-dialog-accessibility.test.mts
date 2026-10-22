import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("shared TouchLine dialog primitive keeps focus, Escape and background isolation together", () => {
  const dialog = source("components/touchline/a11y/TouchlineDialog.tsx");

  assert.match(dialog, /export function useTouchlineDialog/);
  assert.match(dialog, /role: "dialog"/);
  assert.match(dialog, /"aria-modal": true/);
  assert.match(dialog, /FOCUSABLE_SELECTOR/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /lockSiblingBackground/);
  assert.match(dialog, /sibling\.inert = true/);
  assert.match(dialog, /const explicitReturnTarget = returnFocusRef\?\.current \?\? null/);
  assert.match(dialog, /const returnTarget = explicitReturnTarget \?\? previousFocusRef\.current/);
  assert.match(dialog, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?returnTarget/);
  assert.doesNotMatch(dialog, /const shouldRestore/);
});

test("card and tables use the shared accessible dialog behaviour", () => {
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const tables = source("app/rankings/touchline-tables-client.tsx");

  assert.match(cardZoom, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(cardZoom, /initialFocusRef: closeRef/);
  assert.match(cardZoom, /returnFocusRef: triggerRef/);
  assert.match(cardZoom, /document\.documentElement\.lang === "pt-BR"/);

  assert.match(tables, /import TouchlineCardZoom/);
  assert.match(tables, /function TablePlayerCardZoom[\s\S]*?<TouchlineCardZoom/);
  assert.doesNotMatch(tables, /useTouchlineDialog<HTMLDivElement>/);
});

const compiledDialog = ts.transpileModule(source("components/touchline/a11y/TouchlineDialog.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Execute the real keyboard handler; DOM layout and React effects are not simulated. */
function keyboardFixture(empty = false) {
  const document: { activeElement: TestElement | null } = { activeElement: null };
  class TestElement {
    isConnected = true;
    visible = true;
    root: TestElement | null = null;
    controls: TestElement[] = [];
    attributes = new Map<string, string>();
    focusCalls: FocusOptions[] = [];
    readonly name: string;
    constructor(name: string) { this.name = name; }
    getClientRects() { return this.visible ? [{}] : []; }
    hasAttribute(name: string) { return this.attributes.has(name); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    focus(options: FocusOptions = {}) { this.focusCalls.push(JSON.parse(JSON.stringify(options))); document.activeElement = this; }
    closest() { return this.root; }
    querySelectorAll() { return this.controls; }
  }
  const dialog = new TestElement("dialog"), heading = new TestElement("heading");
  const first = new TestElement("first"), middle = new TestElement("middle"), last = new TestElement("last");
  const outside = new TestElement("outside"), nestedDialog = new TestElement("nested-dialog"), nestedButton = new TestElement("nested-button");
  for (const element of [dialog, heading, first, middle, last]) element.root = dialog;
  heading.attributes.set("tabindex", "-1");
  nestedButton.root = nestedDialog;
  dialog.controls = [first, middle, last];
  if (empty) for (const control of dialog.controls) control.attributes.set("disabled", "");
  document.activeElement = heading;
  let dismissals = 0;
  type Event = { target: TestElement; key: string; shiftKey: boolean; preventDefault: () => void; stopPropagation: () => void };
  const exports: { useTouchlineDialog?: (options: unknown) => {
    dialogRef: { current: TestElement | null };
    dialogProps: { onKeyDownCapture: (event: Event) => void };
  } } = {};
  runInNewContext(compiledDialog, { exports, document, Element: TestElement, HTMLElement: TestElement,
    require(name: string) {
      assert.equal(name, "react");
      return {
        useRef: <T,>(value: T) => ({ current: value }),
        useCallback: <T,>(callback: T) => callback,
        useMemo: <T,>(factory: () => T) => factory(),
        useEffect: () => undefined,
      };
    },
  });
  const hook = exports.useTouchlineDialog!({ open: true, label: "Review contract", onDismiss: () => { dismissals++; } });
  hook.dialogRef.current = dialog;
  return { dialog, heading, first, middle, last, outside, nestedButton,
    get dismissals() { return dismissals; },
    key(active: TestElement, key = "Tab", shiftKey = false, target = active) {
      document.activeElement = active;
      let prevented = 0, stopped = 0;
      hook.dialogProps.onKeyDownCapture({ target, key, shiftKey,
        preventDefault: () => { prevented++; }, stopPropagation: () => { stopped++; } });
      return { prevented, stopped, focused: document.activeElement };
    },
  };
}

test("dialog heading and root focus anchors enter the first or last tab stop", () => {
  const h = keyboardFixture();
  for (const anchor of [h.heading, h.dialog]) {
    assert.deepEqual(h.key(anchor), { prevented: 1, stopped: 0, focused: h.first });
    assert.deepEqual(h.key(anchor, "Tab", true), { prevented: 1, stopped: 0, focused: h.last });
  }
});

test("dialog buttons keep native interior navigation and wrap only at the boundaries", () => {
  const h = keyboardFixture();
  assert.equal(h.key(h.first).prevented, 0);
  assert.equal(h.key(h.middle).prevented, 0);
  assert.equal(h.key(h.middle, "Tab", true).prevented, 0);
  assert.equal(h.key(h.last, "Tab", true).prevented, 0);
  assert.deepEqual(h.key(h.first, "Tab", true), { prevented: 1, stopped: 0, focused: h.last });
  assert.deepEqual(h.key(h.last), { prevented: 1, stopped: 0, focused: h.first });
});

test("captured keyboard traversal allows offscreen actions to scroll into view", () => {
  const h = keyboardFixture();
  h.key(h.heading);
  assert.deepEqual(h.first.focusCalls.at(-1), { preventScroll: false });
  h.key(h.heading, "Tab", true);
  assert.deepEqual(h.last.focusCalls.at(-1), { preventScroll: false });
  h.key(h.first, "Tab", true);
  assert.deepEqual(h.last.focusCalls.at(-1), { preventScroll: false });
  h.key(h.last);
  assert.deepEqual(h.first.focusCalls.at(-1), { preventScroll: false });
  const empty = keyboardFixture(true);
  empty.key(empty.heading);
  assert.deepEqual(empty.dialog.focusCalls.at(-1), { preventScroll: true }, "non-navigation fallback preserves existing scroll");
});

test("dialog recovers outside focus and retains focus when every action is disabled", () => {
  const h = keyboardFixture();
  assert.equal(h.key(h.outside, "Tab", false, h.dialog).focused, h.first);
  assert.equal(h.key(h.outside, "Tab", true, h.dialog).focused, h.last);
  const empty = keyboardFixture(true);
  for (const backwards of [false, true]) {
    assert.deepEqual(empty.key(empty.heading, "Tab", backwards), { prevented: 1, stopped: 0, focused: empty.dialog });
  }
});

test("nested dialog owns its Tab and Escape while the current dialog still handles Escape", () => {
  const h = keyboardFixture();
  for (const [key, backwards] of [["Tab", false], ["Tab", true], ["Escape", false]] as const) {
    assert.deepEqual(h.key(h.nestedButton, key, backwards), { prevented: 0, stopped: 0, focused: h.nestedButton });
    assert.equal(h.dismissals, 0);
  }
  assert.deepEqual(h.key(h.heading, "Escape"), { prevented: 1, stopped: 1, focused: h.heading });
  assert.equal(h.dismissals, 1);
});
