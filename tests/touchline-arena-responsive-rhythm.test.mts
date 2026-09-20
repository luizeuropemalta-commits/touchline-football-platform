import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("phone, tablet and wide-screen HUD have explicit independent geometry and contained language menus", () => {
  const css = read("app/arena/arena-responsive.module.css");
  assert.match(css, /max-width: 1100px\) and \(max-height: 500px/);
  assert.match(css, /--touchline-control-size: 36px/);
  assert.match(css, /min-height: 501px/);
  assert.match(css, /--touchline-control-size: 40px/);
  assert.match(css, /--touchline-control-size: 56px/);
  const menu = css.slice(css.indexOf(".stage :global(.language-menu)"), css.indexOf(".stage :global(.hud-button)"));
  assert.match(menu, /left: 0/);
  assert.match(menu, /right: auto/);
  assert.match(menu, /100dvh - var\(--arena-toolbar-bottom\) - var\(--touchline-control-size\)/);
  assert.match(menu, /language-option-copy strong/);
  const collapsed = css.slice(css.indexOf(".stage :global(.arena-quick-dock.is-collapsed)"), css.indexOf(".stage :global(.arena-quick-dock.is-collapsed .arena-quick-toggle > span)"));
  assert.match(collapsed, /width: calc\(var\(--touchline-control-size\) \+ 6px\)/);
  assert.match(collapsed, /min-height: var\(--touchline-control-size\)/);
});

test("Arena HUD uses one viewport rhythm without resizing the document or changing the pitch", () => {
  const globals = read("app/globals.css");
  const css = read("app/arena/arena-responsive.module.css");
  const arena = read("app/arena/ArenaClient.tsx");
  assert.match(globals, /--touchline-ui-unit: clamp\(\.75rem, min\(1\.25vw, 2\.1dvh\), 1\.5rem\)/);
  assert.match(globals, /--touchline-control-size: max\(2\.75rem,/);
  assert.match(arena, /bg-black \$\{responsiveStyles\.stage\}/);
  assert.doesNotMatch(arena, /!standalonePanel \? ` \$\{responsiveStyles\.stage\}`/);
  assert.doesNotMatch(css, /\bzoom\s*:|transform\s*:|field-player|arena-video|body\s*\{/);
  for (const selector of ["language-current-name", "arena-intro-actions", "arena-empty-roster-recovery", "club-symbol-carousel"]) {
    assert.ok(css.includes(`:global(.${selector}`), `${selector} must share responsive sizing`);
  }
});

test("legacy quick-sub, HUD and coach controls keep the same minimum target in standalone views", () => {
  const css = read("app/arena/arena-responsive.module.css");
  const controls = css.slice(css.indexOf(".stage :global(.hud-button)"), css.indexOf(".stage :global(.arena-intro-actions)"));
  for (const selector of ["hud-button", "arena-quick-sub-rail-head > button", "arena-quick-sub-confirm", "arena-quick-sub-readiness > button", "arena-quick-sub-confirmation-dialog > header > button", "arena-owner-coach-contract-actions a", "arena-owner-coach-contract-actions button", "arena-owner-coach-confirm button"]) {
    assert.ok(controls.includes(`:global(.${selector})`));
  }
  assert.match(controls, /min-width: var\(--touchline-control-size\)/);
  assert.match(controls, /min-height: var\(--touchline-control-size\)/);
  assert.match(controls, /padding-right: calc\(var\(--touchline-control-size\) \+ 8px\)/);
});

test("setup callout reserves a toolbar lane and preserves reachable controls on short screens", () => {
  const css = read("app/arena/arena-responsive.module.css");
  assert.match(css, /--arena-toolbar-bottom: calc\(var\(--arena-ui-edge\) \+ var\(--touchline-control-size\) \+ 12px\)/);
  assert.match(css, /top: max\(var\(--arena-toolbar-bottom\)/);
  assert.match(css, /max-height: calc\(100dvh - var\(--arena-toolbar-bottom\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /@media \(min-width: 1800px\)/);
});
