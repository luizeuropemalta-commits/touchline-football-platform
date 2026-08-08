import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("shared TouchLine pitches expose a labelled semantic group", () => {
  const pitch = source("components/touchline/pitch/TouchlinePitchSurface.tsx");
  assert.match(pitch, /role="group"/);
  assert.match(pitch, /aria-label=\{ariaLabel\}/);
});

test("keyboard focus remains visible for every standard editable control", () => {
  const globalCss = source("app/globals.css");
  assert.match(globalCss, /:is\(a, button, input, textarea, select, \[tabindex\]\):focus-visible/);
  assert.match(globalCss, /outline-offset: 3px/);
});

test("card zoom moves keyboard focus into its modal and restores it on close", () => {
  const cardZoom = source("components/touchline/cards/TouchlineCardZoom.tsx");
  const dialog = source("components/touchline/a11y/TouchlineDialog.tsx");
  assert.match(cardZoom, /const triggerRef = useRef<HTMLDivElement>/);
  assert.match(cardZoom, /const closeRef = useRef<HTMLButtonElement>/);
  assert.match(cardZoom, /useTouchlineDialog<HTMLDivElement>\(/);
  assert.match(cardZoom, /initialFocusRef: closeRef/);
  assert.match(cardZoom, /returnFocusRef: triggerRef/);
  assert.match(cardZoom, /ref=\{triggerRef\}/);
  assert.match(cardZoom, /ref=\{closeRef\}/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /FOCUSABLE_SELECTOR/);
  assert.match(dialog, /lockSiblingBackground/);
});
