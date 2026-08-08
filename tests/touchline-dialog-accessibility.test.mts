import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  const tables = source("app/touchline-tables/touchline-tables-client.tsx");

  assert.match(cardZoom, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(cardZoom, /initialFocusRef: closeRef/);
  assert.match(cardZoom, /returnFocusRef: triggerRef/);
  assert.match(cardZoom, /document\.documentElement\.lang === "pt-BR"/);

  assert.match(tables, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(tables, /initialFocusRef: zoomCloseRef/);
  assert.match(tables, /returnFocusRef: zoomTriggerRef/);
});
