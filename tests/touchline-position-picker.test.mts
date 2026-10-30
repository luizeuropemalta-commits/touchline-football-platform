import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("market selection uses the approved embedded position-bound section and returns to the field", () => {
  const client = source("app/fantasy/FantasyGameweekClient.tsx");
  const ast = ts.createSourceFile("FantasyGameweekClient.tsx", client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(ast), node.initializer.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const open = initializers.get("openTacticalSelector");
  assert.ok(open);
  assert.match(open, /if \(marketPage && !selections\.some\(entry => entry\.slotId === slotId\)\s*&& !\(guidedChoice\?\.area === "starters" && guidedChoice\.slot === slotId\)\) return;/);
  assert.match(open, /visualIntentEpoch\.current\+\+;\s*setArenaOpen\(false\);\s*setActiveSlotId\(slotId\);/);
  assert.match(open, /scrollToLineupSection\("my-club-player-selection"\);\s*\}$/);
  assert.match(client, /marketPage \? Boolean\(activeSlot\) && marketSlotAccepts\(activeSlot, card\)/);
  const select = initializers.get("selectMyClubPlayer");
  assert.ok(select);
  assert.match(select, /const intent = visualIntentEpoch\.current;\s*if \(!await addPlayer\(card\)\) return;\s*if \(intent !== visualIntentEpoch\.current\) return;\s*setBrowsePosition\(null\);\s*setSquadView\("tactical"\);\s*scrollToLineupSection\("my-club-xi-pitch"\)/);
  assert.match(client, /onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  assert.match(client, /id="my-club-player-selection" tabIndex=\{-1\} data-open="true" data-inline-selection="true"/);
  assert.match(client, /section\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(client, /<TouchlinePositionPicker|setPositionPickerOpen/);
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
  assert.match(dialog, /function hasInertAncestor\(element: HTMLElement\)/);
  assert.match(dialog, /const isCoveredByAnotherDialog = \(\) =>/);
  assert.match(dialog, /hasInertAncestor\(dialog\)/);
  assert.match(dialog, /\[data-touchline-dialog-root="true"\]\[aria-modal="true"\]/);
  assert.match(dialog, /isCoveredByAnotherDialog\(\)/);
  // Open-dialog repair is separate from close restoration: returning into the
  // surviving picker is allowed, but an unrelated modal's background is not.
  assert.match(dialog, /const returnTarget = explicitReturnTarget \?\? previousFocusRef\.current/);
  assert.match(dialog, /for \(const target of \[returnTarget, fallbackReturnTarget\]\)/);
  assert.match(dialog, /if \(!target \|\| hasInertAncestor\(target\)\) continue;\s*if \(anotherDialogIsOpen && !anotherDialogIsOpen\.contains\(target\)\) continue;\s*if \(focusElement\(target\)\) return;/);
});

test("market field keeps direct mobile position actions unscaled and visible", () => {
  const css = source("app/fantasy/fantasy.module.css");
  const marketMobile = css.slice(css.indexOf("/* The Market picker must remain reachable"));
  assert.match(marketMobile, /@media \(max-width: 900px\)/);
  assert.match(marketMobile, /\[data-fantasy-context="market"\] \.myClubPitchViewport \.myClubTacticalPitch\s*\{\s*width: 100%;\s*transform: none;/);
  assert.match(marketMobile, /\.emptyPosition \{[^}]*display: grid;[^}]*width: 44px; height: 44px;/);
  assert.match(marketMobile, /\.emptyPosition:focus-visible \{[^}]*outline: 2px solid/);
  assert.match(marketMobile, /\.myClubMarket\[data-inline-selection="true"\] \.myClubMarketResults article button:not\(\[data-market-plan-unlock\]\) \{ min-height: 44px;/);
  assert.match(marketMobile, /\.myClubPitchViewport \.myClubTacticalSlot > \.pitchRemove \{[^}]*width: 44px; height: 44px; min-height: 44px;/);
});
