import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  installTouchlineOrientationGate,
  TOUCHLINE_PORTRAIT_QUERY,
} from "../lib/touchlineArena/orientation-gate.ts";

function harness(initialPortrait: boolean, initialInert = false, fullscreen = false) {
  const documentTarget = {
    activeElement: null as unknown,
    documentElement: { dataset: {} as Record<string, string> },
    fullscreenElement: fullscreen ? {} : null as unknown,
    fullscreenExits: 0,
    async exitFullscreen() { this.fullscreenExits++; this.fullscreenElement = null; },
  };
  class Element extends EventTarget {
    inert = false;
    isConnected = true;
    attributes = new Map<string, string>();
    focusCalls: Array<FocusOptions | undefined> = [];
    focus(options?: FocusOptions) { this.focusCalls.push(options); documentTarget.activeElement = this; }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
  }
  class Media extends EventTarget {
    matches = initialPortrait;
    rotate(portrait: boolean) { this.matches = portrait; this.dispatchEvent(new Event("change")); }
  }
  const content = new Element();
  content.inert = initialInert;
  const gate = new Element();
  const skipLink = new Element();
  const originalFocus = new Element();
  const media = new Media();
  originalFocus.focus();
  const stop = installTouchlineOrientationGate({
    content: content as unknown as HTMLElement,
    gate: gate as unknown as HTMLElement,
    skipLink: skipLink as unknown as HTMLElement,
    media: media as unknown as MediaQueryList,
    documentTarget: documentTarget as unknown as Document,
  });
  return { content, gate, skipLink, media, documentTarget, originalFocus, stop };
}

test("phone portrait is inert and focus moves to the undismissable rotate notice", () => {
  const h = harness(true);
  assert.equal(h.content.inert, true);
  assert.equal(h.skipLink.inert, true);
  assert.equal(h.content.getAttribute("aria-hidden"), "true");
  assert.equal(h.documentTarget.activeElement, h.gate);
  assert.equal(h.documentTarget.documentElement.dataset.touchlineOrientation, "portrait-blocked");
  const tab = new Event("keydown", { cancelable: true });
  Object.assign(tab, { key: "Tab" });
  h.gate.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(h.documentTarget.activeElement, h.gate);
  h.stop();
});

test("landscape restores accessibility and original focus without scrolling or remounting", () => {
  const h = harness(true);
  const contentIdentity = h.content;
  h.media.rotate(false);
  assert.equal(h.content, contentIdentity);
  assert.equal(h.content.inert, false);
  assert.equal(h.skipLink.inert, false);
  assert.equal(h.content.getAttribute("aria-hidden"), null);
  assert.equal(h.documentTarget.documentElement.dataset.touchlineOrientation, "landscape");
  assert.equal(h.documentTarget.activeElement, h.originalFocus);
  assert.deepEqual(h.originalFocus.focusCalls.at(-1), { preventScroll: true });
  h.stop();
});

test("repeated rotations and unchanged media events preserve focus and release every time", () => {
  const h = harness(false);
  for (let count = 0; count < 3; count++) {
    h.media.rotate(true);
    h.media.rotate(true);
    assert.equal(h.content.inert, true);
    h.media.rotate(false);
    assert.equal(h.documentTarget.activeElement, h.originalFocus);
    assert.equal(h.content.inert, false);
  }
  h.stop();
});

test("cleanup removes listeners and restores original accessibility instead of overriding another lock", () => {
  const h = harness(true, true);
  h.stop();
  assert.equal(h.content.inert, true);
  assert.equal(h.skipLink.inert, false);
  assert.equal(h.content.getAttribute("aria-hidden"), null);
  assert.equal(h.documentTarget.documentElement.dataset.touchlineOrientation, undefined);
  h.media.rotate(false);
  assert.equal(h.documentTarget.documentElement.dataset.touchlineOrientation, undefined);
  const tab = new Event("keydown", { cancelable: true });
  Object.assign(tab, { key: "Tab" });
  h.gate.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
});

test("disconnected previous targets are not refocused after rotation", () => {
  const h = harness(true);
  h.originalFocus.isConnected = false;
  h.media.rotate(false);
  assert.equal(h.originalFocus.focusCalls.length, 1);
  assert.equal(h.content.inert, false);
  h.stop();
});

test("CSS protects first paint and body portals with the same phone-only query", () => {
  const css = readFileSync(new URL("../components/touchline/TouchlineLandscapeBoundary.module.css", import.meta.url), "utf8");
  const global = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.equal(TOUCHLINE_PORTRAIT_QUERY, "(max-width: 767px) and (orientation: portrait)");
  assert.ok(css.includes(`@media ${TOUCHLINE_PORTRAIT_QUERY}`));
  assert.ok(global.includes(`@media ${TOUCHLINE_PORTRAIT_QUERY}`));
  assert.match(css, /visibility:\s*hidden !important/);
  assert.match(css, /opacity:\s*0 !important/);
  assert.match(global, /body > :not\(\[data-touchline-orientation-root\]\):not\(\[data-touchline-orientation-gate\]\) \{ display: none !important;/);
  assert.doesNotMatch(css, /animation:|transform:\s*scale/);
});

test("portrait exits native fullscreen so the rotate notice cannot be hidden by the top layer", async () => {
  const h = harness(false, false, true);
  h.media.rotate(true);
  await Promise.resolve();
  assert.equal(h.documentTarget.fullscreenElement, null);
  assert.equal(h.documentTarget.fullscreenExits, 1);
  assert.equal(h.documentTarget.activeElement, h.gate);
  h.media.rotate(false);
  assert.equal(h.documentTarget.activeElement, h.originalFocus);
  h.stop();
});

test("a pending fullscreen exit must not steal focus after returning to landscape", async () => {
  const h = harness(false, false, true);
  let finish: (() => void) | undefined;
  h.documentTarget.exitFullscreen = () => new Promise<void>((resolve) => { finish = resolve; });
  h.media.rotate(true);
  h.media.rotate(false);
  finish?.();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.documentTarget.activeElement, h.originalFocus);
  h.stop();
});

test("orientation notice is outside the modal-inert app root and dialogs never lock it", () => {
  const boundary = readFileSync(new URL("../components/touchline/TouchlineLandscapeBoundary.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../components/touchline/a11y/TouchlineDialog.tsx", import.meta.url), "utf8");
  assert.match(boundary, /<\/div>\s*<div\s+data-touchline-orientation-gate/);
  assert.match(dialog, /element\.hasAttribute\("data-touchline-orientation-gate"\)/);
});
