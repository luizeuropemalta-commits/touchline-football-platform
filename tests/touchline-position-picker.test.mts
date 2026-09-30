import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("market click opens a position-bound overlay without scrolling away from the field", () => {
  const client = source("app/fantasy/FantasyGameweekClient.tsx");
  assert.match(client, /if \(marketPage\) \{[\s\S]*positionButtonsRef\.current\.get\(slotId\)[\s\S]*setPositionPickerOpen\(true\);\s*return;/);
  assert.match(client, /marketPage \? Boolean\(activeSlot\) && slotAccepts\(activeSlot, card\)/);
  assert.match(client, /if \(!addPlayer\(card\)\) return;[\s\S]*setPositionPickerOpen\(false\)/);
  assert.match(client, /positionButtonsRef\.current\.set\(slot\.id, element\)/);
  assert.match(client, /<TouchlinePositionPicker inline=\{!marketPage\}/);
});

test("picker shares dialog access and canonical button styles without native top-layer hiding card zoom", () => {
  const picker = source("app/fantasy/TouchlinePositionPicker.tsx");
  assert.match(picker, /useTouchlineDialog<HTMLDivElement>/);
  assert.match(picker, /navigationStyles\.link/);
  assert.match(picker, /if \(!open\) return null/);
  assert.match(picker, /createPortal\(/);
  assert.doesNotMatch(picker, /<dialog|showModal|<video/);
  const css = source("app/fantasy/position-picker.module.css");
  assert.match(css, /z-index: 1700/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /overscroll-behavior: contain/);
});

test("nested card dialog owns keyboard and can return focus inside the picker", () => {
  const dialog = source("components/touchline/a11y/TouchlineDialog.tsx");
  assert.match(dialog, /event\.target\.closest\('[^']+dialog-root[^']+'\) !== dialog/);
  assert.match(dialog, /!anotherDialogIsOpen\.contains\(returnTarget\)/);
});

test("market field keeps direct mobile position actions unscaled and visible", () => {
  const css = source("app/fantasy/fantasy.module.css");
  const marketMobile = css.slice(css.indexOf("/* The Market picker must remain reachable"));
  assert.match(marketMobile, /@media \(max-width: 900px\)/);
  assert.match(marketMobile, /\[data-fantasy-context="market"\] \.myClubPitchViewport \.myClubTacticalPitch\s*\{\s*width: 100%;\s*transform: none;/);
  assert.match(marketMobile, /\[data-fantasy-context="market"\] \.myClubPitchViewport \.myClubTacticalSlot > button\s*\{\s*display: grid;\s*place-items: center;\s*width: 44px;\s*min-height: 44px;/);
});
