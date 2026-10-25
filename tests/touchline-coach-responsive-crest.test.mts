import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT, normalizeTouchlineCoachCardLayout } from "../lib/touchlineArena/coach-card-layout.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const native = createRequire(import.meta.url);
const coach = { id: "fixture-coach", providerId: "fixture-coach", provider: "sportmonks" as const, name: "Fixture Coach", displayName: "Fixture Coach", teamId: "fixture", source: { provider: "sportmonks" as const, providerId: "fixture-coach", raw: { fixture: true } } };
const slot = createTouchlineArenaCoachSlot(coach, 1);
function fixture() {
  const cache = new Map<string, unknown>();
  function load(id: string, parent: string): unknown {
    if (id === "./TouchlineCardLeadershipProvider") return { useTouchlineCardLeadershipAuthority: () => null };
    if (!id.startsWith(".") && !id.startsWith("@/")) return native(id);
    const base = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(parent), id);
    if (base.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    assert.ok(file);
    if (file.endsWith(".ts")) return native(file);
    if (cache.has(file)) return cache.get(file);
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, require: (name: string) => load(name, file), URL, URLSearchParams, Intl });
    return exports;
  }
  const Card = (load("@/components/touchline/cards/TouchlineCoachCard", path.join(root, "test.ts")) as { default: React.ComponentType<Record<string, unknown>> }).default;
  return (props: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(Card, {
    coach, slot, clubName: "Arsenal FC", clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png", countryCode3: "ENG",
    layoutOverride: TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT, ...props,
  }));
}

test("real public coach crest scales with its card and preserves the 300px authored size", () => {
  const html = fixture()();
  const value = html.match(/--coach-crest-size:([\d.]+)cqw/)?.[1];
  assert.ok(value, "public card must not emit an unscaled px crest");
  const reference = Math.round(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT.crestSize * 3);
  for (const width of [40, 48, 73, 96, 166, 300, 390]) {
    const crestWidth = Number(value) * width / 100;
    assert.ok(crestWidth < width, `${width}px card contains its crest`);
    assert.ok(Math.abs(crestWidth - reference * width / 300) < .001);
  }
  assert.ok(html.includes('data-touchline-card-crest="true"'));
  assert.ok(html.includes('alt="Arsenal FC"'));
  assert.ok(html.includes("/live-160/arsenal.webp?v="));
});

test("custom editor sizing and placement remain unchanged while public sizes stay proportional", () => {
  const render = fixture();
  const layout = normalizeTouchlineCoachCardLayout({ ...TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT, crestSize: 44, layers: { ...TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT.layers, clubCrest: { x: 17, y: 22, w: 12 } } });
  const editor = render({ editable: true, layoutOverride: layout });
  const publicCard = render({ layoutOverride: layout });
  assert.ok(editor.includes("--coach-crest-size:132px"));
  assert.ok(publicCard.includes("--coach-crest-size:44cqw"));
  for (const html of [editor, publicCard]) {
    assert.ok(html.includes("--coach-club-crest-x:17%"));
    assert.ok(html.includes("--coach-club-crest-y:22%"));
    assert.ok(html.includes("--coach-club-crest-w:12%"));
  }
});

test("compact and zoom remain bounded by their existing presentation rules", () => {
  const compact = fixture()({ displayMode: "compact" });
  assert.ok(compact.includes('data-coach-card-display="compact"'));
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCard.module.css", import.meta.url), "utf8");
  assert.match(css, /\.shell\s*\{\s*container-type:\s*inline-size/);
  assert.match(css, /\.shell\[data-coach-card-display="compact"\] \.clubBadge \[data-touchline-card-crest-host="true"\] \{[^}]*width:\s*clamp\(9px,\s*16cqw,\s*28px\)/);
  const zoom = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  assert.match(zoom, /width:\s*min\(100%,\s*var\(--coach-crest-size,\s*132px\)\)/);
});
