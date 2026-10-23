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
  assert.match(dialog, /const fallbackReturnTarget = returnFocusFallbackRef\?\.current \?\? null/);
  assert.match(dialog, /const returnTarget = explicitReturnTarget \?\? previousFocusRef\.current/);
  assert.match(dialog, /for \(const target of \[returnTarget, fallbackReturnTarget\]\)/);
  assert.match(dialog, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?returnTarget/);
  assert.doesNotMatch(dialog, /const shouldRestore/);
});

test("card and tables use the shared accessible dialog behaviour", () => {
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const tables = source("app/rankings/touchline-tables-client.tsx");

  assert.match(cardZoom, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(cardZoom, /initialFocusRef: closeRef/);
  const tree = ts.createSourceFile("TouchlineCardZoom.tsx", cardZoom, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: ts.CallExpression[] = [], initializers = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useTouchlineDialog") calls.push(node);
    if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(tree), node.initializer.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(calls.length, 1, "all presentation modes use one shared dialog hook");
  assert.ok(ts.isObjectLiteralExpression(calls[0].arguments[0]));
  const optionsExpression = calls[0].arguments[0].getText(tree);
  const requestedOpen = initializers.get("requestedOpen"), isOpen = initializers.get("isOpen");
  assert.ok(requestedOpen);assert.ok(isOpen);
  const triggerRef = { current: { name: "local trigger" } }, externalRef = { current: { name: "selected list trigger" } };
  const closeRef = { current: { name: "close button" } }, fallbackRef = { current: { name: "persistent heading" } };
  for (const presentationMode of ["combined", "trigger-only", "dialog-only"]) for (const open of [undefined, false, true]) for (const internalIsOpen of [false, true]) {
    const requested = runInNewContext(`(${requestedOpen})`, { open, internalIsOpen }) as boolean;
    const active = runInNewContext(`(${isOpen})`, { presentationMode, requestedOpen: requested }) as boolean;
    assert.equal(requested, open ?? internalIsOpen, "controlled state overrides the legacy internal default");
    assert.equal(active, presentationMode !== "trigger-only" && (open ?? internalIsOpen), "trigger-only never owns a focus lock");
    for (const returnFocusRef of [undefined, null, externalRef]) {
      const dismissals: boolean[] = [];
      const options = runInNewContext(`(${optionsExpression})`, { isOpen: active, ariaLabel: "Canonical card", closeRef, triggerRef, returnFocusRef, returnFocusFallbackRef: fallbackRef, setIsOpen: (next: boolean) => dismissals.push(next) }) as {
        open: boolean; label: string; initialFocusRef: unknown; returnFocusRef: unknown; returnFocusFallbackRef: unknown; onDismiss: () => void;
      };
      assert.equal(options.open, active);assert.equal(options.label, "Canonical card");assert.equal(options.initialFocusRef, closeRef);
      assert.equal(options.returnFocusRef, returnFocusRef ?? triggerRef, "default callers retain their local trigger; controlled hosts use the invoking trigger");
      assert.equal(options.returnFocusFallbackRef, fallbackRef);
      options.onDismiss();assert.deepEqual(dismissals, [false]);
    }
  }
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

/** Runs the real focus-recovery effect against a deliberately small DOM model. */
function focusRecoveryFixture() {
  class TestElement {
    isConnected = true;
    inert = false;
    visible = true;
    parentElement: TestElement | null = null;
    children: TestElement[] = [];
    controls: TestElement[] = [];
    attributes = new Map<string, string>();
    listeners = new Map<string, ((event: { target: TestElement }) => void)[]>();
    style = { overflow: "" };
    dataset: Record<string, string | undefined> = {};
    focusCalls = 0;
    readonly name: string;
    private readonly document: { activeElement: TestElement | null };
    constructor(name: string, document: { activeElement: TestElement | null }) { this.name = name; this.document = document; }
    append(child: TestElement) { child.parentElement = this; this.children.push(child); }
    contains(node: TestElement) {
      for (let cursor: TestElement | null = node; cursor; cursor = cursor.parentElement) if (cursor === this) return true;
      return false;
    }
    getClientRects() { return this.visible ? [{}] : []; }
    hasAttribute(name: string) { return this.attributes.has(name); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    querySelectorAll() { return this.controls; }
    addEventListener(name: string, listener: (event: { target: TestElement }) => void) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
    }
    removeEventListener(name: string, listener: (event: { target: TestElement }) => void) {
      this.listeners.set(name, (this.listeners.get(name) ?? []).filter(candidate => candidate !== listener));
    }
    emitFocus(target: TestElement) { for (const listener of this.listeners.get("focusin") ?? []) listener({ target }); }
    focus() { this.focusCalls += 1; this.document.activeElement = this; }
  }

  const document: {
    activeElement: TestElement | null;
    body: TestElement;
    documentElement: TestElement;
    querySelector: () => null;
    querySelectorAll: () => TestElement[];
  } = {} as never;
  const root = new TestElement("root", document);
  const body = new TestElement("body", document);
  const dialog = new TestElement("dialog", document);
  const close = new TestElement("close", document);
  const toggle = new TestElement("removed-toggle", document);
  const ordinary = new TestElement("ordinary-update", document);
  const nestedDialog = new TestElement("nested-dialog", document);
  const nestedButton = new TestElement("nested-button", document);
  document.activeElement = body;
  document.body = body;
  document.documentElement = root;
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  root.append(body); body.append(dialog); dialog.append(close); dialog.append(toggle); body.append(nestedDialog); nestedDialog.append(nestedButton);
  dialog.controls = [close, toggle];

  const effects: Array<() => void | (() => void)> = [];
  const observers: Array<{ callback: (records: Array<{ removedNodes: TestElement[] }>) => void; disconnected: boolean }> = [];
  class TestMutationObserver {
    disconnected = false;
    readonly callback: (records: Array<{ removedNodes: TestElement[] }>) => void;
    constructor(callback: (records: Array<{ removedNodes: TestElement[] }>) => void) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const exports: { useTouchlineDialog?: (options: unknown) => {
    dialogRef: { current: TestElement | null };
  } } = {};
  runInNewContext(compiledDialog, {
    exports,
    document,
    Element: TestElement,
    HTMLElement: TestElement,
    MutationObserver: TestMutationObserver,
    window: { requestAnimationFrame(callback: () => void) { callback(); return 1; }, cancelAnimationFrame() {} },
    require(name: string) {
      assert.equal(name, "react");
      return {
        useRef: <T,>(value: T) => ({ current: value }),
        useCallback: <T,>(callback: T) => callback,
        useMemo: <T,>(factory: () => T) => factory(),
        useEffect: (effect: () => void | (() => void)) => { effects.push(effect); },
      };
    },
  });
  const hook = exports.useTouchlineDialog!({ open: true, label: "Stable stage", onDismiss() {}, initialFocusRef: { current: close } });
  hook.dialogRef.current = dialog;
  const cleanups = effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  return { document, body, dialog, close, toggle, ordinary, nestedDialog, nestedButton, observer: observers[0]!, cleanups };
}

test("live removal of the focused detail repairs focus inside the same dialog without stealing nested focus", () => {
  const h = focusRecoveryFixture();
  assert.equal(h.document.activeElement, h.close, "initial dialog focus remains the close control");

  // A normal DOM change does not reset focus; only removal of the remembered
  // focused node while the browser falls back to body is repaired.
  h.dialog.emitFocus(h.toggle); h.document.activeElement = h.toggle;
  h.observer.callback([{ removedNodes: [h.ordinary] }]);
  assert.equal(h.document.activeElement, h.toggle);

  h.toggle.isConnected = false;
  h.dialog.emitFocus(h.toggle); h.document.activeElement = h.body;
  h.observer.callback([{ removedNodes: [h.toggle] }]);
  assert.equal(h.document.activeElement, h.close, "Escape remains reachable after the selected detail unmounts");

  // An open nested dialog owns focus. Removing the parent's former target must
  // not drag focus away from that dialog.
  h.toggle.isConnected = true; h.dialog.emitFocus(h.toggle); h.toggle.isConnected = false; h.document.activeElement = h.nestedButton;
  h.observer.callback([{ removedNodes: [h.toggle] }]);
  assert.equal(h.document.activeElement, h.nestedButton);

  // A deeper in-tree dialog may still be waiting for its own focus RAF. Its
  // presence itself makes the older dialog ineligible to repair body focus.
  h.dialog.append(h.nestedDialog); h.document.querySelectorAll = () => [h.dialog, h.nestedDialog];
  h.toggle.isConnected = true; h.dialog.emitFocus(h.toggle); h.toggle.isConnected = false; h.document.activeElement = h.body;
  h.observer.callback([{ removedNodes: [h.toggle] }]);
  assert.equal(h.document.activeElement, h.body);

  for (const cleanup of h.cleanups) cleanup();
  assert.equal(h.observer.disconnected, true, "StrictMode/unmount cleanup disconnects the observer");
});
