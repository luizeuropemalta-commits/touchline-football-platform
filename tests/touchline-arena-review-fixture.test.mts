import assert from "node:assert/strict";
import test from "node:test";
import { Script, runInNewContext } from "node:vm";
import { existsSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { ARENA_REVIEW_ASSET_PATHS, createArenaMobileReviewHtml } from "../scripts/qa/arena-mobile-review-fixture.mjs";
import { TOUCHLINE_CALIBRATED_FORMATION_CODES, resolveTouchlineFormationGeometry } from "../lib/touchlineArena/formation-geometry.ts";
import { touchlineFantasyPitchCardWidth } from "../lib/touchlineFantasy/market-browser.ts";

test("isolated Arena fixture bundles real artwork components and labels its integration limits", () => {
  const html = createArenaMobileReviewHtml({ baseUrl: "http://127.0.0.1:3348/", locale: "pt-BR" });
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /data-review-fixture/);
  assert.ok(html.includes("data-review-notice"));
  assert.match(html, /realCollection:\s*false/);
  assert.match(html, /coachReleaseAction\s*=\s*null/);
  assert.match(html, /Isolated Arena cannot expose contract actions/);
  for (const file of ["FantasyGameweekClient", "TouchlinePitchSurface", "TouchlineGameweekCard", "TouchlineCoachCard", "fantasy.module.css"]) {
    // The toolbar is extracted from FantasyGameweekClient rather than bundled
    // with its real network/mutation hooks. All other entries are real modules.
    if (file !== "FantasyGameweekClient") assert.ok(html.includes(file), file);
  }
  assert.match(html, /data-arena-toolbar/);
  assert.match(html, /data-arena-coach/);
  assert.match(html, /geometry\.slots\.map/);
  assert.match(html, /showLeadershipCrown:\s*true/);
  assert.match(html, /layoutOverride:\s*layout/);
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Script(script), "browser script parses");
  const noMount = script.replace(/require\(['"]react-dom\/client['"]\)\.createRoot\(document\.getElementById\(['"]root['"]\)\)\.render\(React\.createElement\(App, null\)\);/, "window.__reviewElement=React.createElement(App,null);");
  assert.notEqual(noMount, script, "test skips DOM mounting, not component-module initialization");
  const window: Record<string, unknown> = {};
  runInNewContext(noMount, { window, console, URL, URLSearchParams, Intl, setTimeout, clearTimeout }, { timeout: 5000 });
  assert.equal((window.__arenaFixture as { realCollection: boolean }).realCollection, false);
  assert.ok(window.__reviewElement, "entry graph initialized without loading the real page");
});

test("every source in the real SSR review render is an existing allowlisted local asset", () => {
  const html = createArenaMobileReviewHtml();
  let script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  script = script.replace("function require(id){if(cache[id])", 'function require(id){if(id==="react")return __react;if(id==="react/jsx-runtime")return __jsx;if(cache[id])');
  script = script.replace(/require\(['"]react-dom\/client['"]\)\.createRoot\(document\.getElementById\(['"]root['"]\)\)\.render\(React\.createElement\(App, null\)\);/, "window.__reviewElement=React.createElement(App,null);");
  const window: Record<string, unknown> = {};
  runInNewContext(script, { window, __react: React, __jsx: jsxRuntime, console, URL, URLSearchParams, Intl, setTimeout, clearTimeout }, { timeout: 5000 });
  const rendered = renderToStaticMarkup(window.__reviewElement as React.ReactElement);
  assert.doesNotMatch(rendered, /(?:Liberar|Release) (?:treinador|coach)|data-coach-release|Confirmar libera[çc][ãa]o/i);
  assert.equal(Array.from(rendered.matchAll(/data-arena-slot=/g)).length, 11);
  const assets = Array.from(rendered.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g), match => match[1].replaceAll("&amp;", "&"));
  assert.ok(assets.length >= 11, "real card images rendered");
  for (const src of assets) {
    if (src.startsWith("data:")) continue;
    const url = new URL(src, "http://127.0.0.1:3348/");
    const path = decodeURIComponent(url.pathname);
    assert.equal(url.origin, "http://127.0.0.1:3348", "no remote asset");
    assert.ok((ARENA_REVIEW_ASSET_PATHS as readonly string[]).includes(path), `asset absent from manifest: ${path}`);
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), `missing asset: ${path}`);
    if (path.includes("/clubs/")) assert.ok(path.includes("/Arsenal FC/"), "fixture has one consistent club instead of fallback artwork");
  }
  assert.ok(assets.some(src => new URL(src, "http://127.0.0.1:3348/").searchParams.has("v")), "versioned URLs are preserved for server testing");
});

test("all eleven formations keep visible cards within the measured phone and desktop field", () => {
  for (const code of TOUCHLINE_CALIBRATED_FORMATION_CODES) {
    const { slots } = resolveTouchlineFormationGeometry(code);
    assert.equal(slots.length, 11);
    for (const width of [692, 720, 1188]) {
      const height = width * 68 / 105;
      const cardWidth = touchlineFantasyPitchCardWidth(slots, width, height, { labelHeight: 18, gap: 6 });
      assert.ok(cardWidth >= 44 && cardWidth <= 96, `${code}: ${cardWidth}px at ${width}px field`);
      const cardHeight = cardWidth * 691 / 430 + 18;
      const boxes = slots.map(slot => ({ x: Math.min(89, Math.max(11, slot.x)) * width / 100, y: Math.min(86, Math.max(14, 100 - slot.y)) * height / 100 }));
      for (const [index, box] of boxes.entries()) {
        assert.ok(box.x >= cardWidth / 2 && box.x + cardWidth / 2 <= width);
        assert.ok(box.y >= cardHeight / 2 && box.y + cardHeight / 2 <= height);
        for (const other of boxes.slice(index + 1)) assert.ok(Math.abs(box.x - other.x) >= cardWidth + 5 || Math.abs(box.y - other.y) >= cardHeight + 5, `${code}: geometric card collision`);
      }
    }
  }
});

test("fixture rejects remote asset origins and normalizes unsupported locales", () => {
  assert.throws(() => createArenaMobileReviewHtml({ baseUrl: "https://example.com/" }), /loopback-only/);
  const html = createArenaMobileReviewHtml({ locale: "unknown" });
  assert.match(html, /<html lang="en-GB">/);
  assert.match(html, /<base href="http:\/\/127\.0\.0\.1:3348\/">/);
});
