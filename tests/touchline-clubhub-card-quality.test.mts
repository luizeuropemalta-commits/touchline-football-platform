import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const tiers = ["diamond-gold", "clear-diamond", "emerald-green", "radiant-gold", "amethyst-purple", "sapphire-blue", "ruby-red"];

// Render the real gallery and real ExactCard. Replace only the gallery's data
// selection and browser/network integrations; no frame rendering is mocked.
function renderGallery() {
  const cache = new Map<string, unknown>();
  const replacements: Record<string, unknown> = {
    "next/link": { __esModule: true, default: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement("a", props, children) },
    "next/navigation": { usePathname: () => "/touchline-clubs/manchester-city" },
    "@/components/touchline/cards/TouchlineCoachCardZoom": { __esModule: true, default: () => null },
    "@/lib/touchlineArena/card-ranking-client": { useTouchlineActiveRanking: () => null },
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => null },
    "@/lib/touchlineArena/golden-boot-client": { useTouchlineGoldenBootPlayers: () => [] },
    "@/lib/touchlineArena/clubhub-tier-showcase": {
      selectTouchlinePlayerTierRepresentatives: (cards: Array<{ editorialCard: { tierKey: string } }>) => cards.map(card => ({ tierKey: card.editorialCard.tierKey, card })),
      selectTouchlineCoachTierRepresentativesFromRanking: () => [],
    },
  };
  function load(specifier: string, parent: string): unknown {
    if (Object.hasOwn(replacements, specifier)) return replacements[specifier];
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return nativeRequire(specifier);
    const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
    if (base.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
    assert.ok(file, `module not found: ${base}`);
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
    if (file.endsWith(".ts")) return nativeRequire(file);
    if (cache.has(file)) return cache.get(file);
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, require: (name: string) => load(name, file), URL, URLSearchParams, Intl, console, process: { env: {} } });
    return exports;
  }
  const Gallery = (load("@/components/touchline/TouchlineCoachCategoryShowcase", path.join(root, "test.ts")) as { default: React.ComponentType<Record<string, unknown>> }).default;
  const playerCards = tiers.map((tierKey, index) => ({
    id: `fixture-${index}`, canonicalPlayerId: `00000000-0000-4000-8000-00000000000${index}`,
    name: `Gallery Player ${index}`, shortName: `Player ${index}`, role: "forward", position: "ST",
    clubName: "Manchester City", shirtNumber: index + 1, countryCode3: "ENG", touchlinePoints: 0,
    marketValue: "€1000000", marketValueSource: "verified-cache", marketValueState: "verified",
    editorialCard: { tierKey, cardPrice: { amountMinor: 1500, currency: "GBP" }, marketValueEur: 1000000, lastReviewedAt: "2026-10-23T00:00:00Z" },
  }));
  return renderToStaticMarkup(React.createElement(Gallery, { locale: "en-GB", playerCards, coachRanking: {} }));
}

test("all seven real gallery cards use full-size templates instead of enlarged live thumbnails", () => {
  const html = renderGallery();
  const frames = Array.from(html.matchAll(/<img\b[^>]*data-touchline-card-frame="true"[^>]*>/g), match => match[0]);
  assert.equal(frames.length, tiers.length);
  for (const [index, frame] of frames.entries()) {
    assert.match(frame, /data-card-delivery="zoom-optimized"/);
    assert.match(frame, /src="\/touchlineArena\/cards\/templates\/zoom\/clubs\//);
    assert.ok(frame.includes(`/market-tiers/${tiers[index]}.webp`), `original tier retained: ${tiers[index]}`);
    assert.doesNotMatch(frame, /live-compact/);
  }
  for (const [index, tier] of tiers.entries()) {
    assert.ok(html.includes(`data-tier="${tier}"`));
    assert.ok(html.includes(`Gallery Player ${index}`));
  }
});

test("selected full-size assets retain source dimensions for every tier", async () => {
  for (const tier of tiers) {
    const relative = `clubs/Manchester City/market-tiers/${tier}`;
    const original = await sharp(path.join(root, "public/touchlineArena/cards/templates", `${relative}.png`)).metadata();
    const full = await sharp(path.join(root, "public/touchlineArena/cards/templates/zoom", `${relative}.webp`)).metadata();
    const thumbnail = await sharp(path.join(root, "public/touchlineArena/cards/templates/live-compact", `${relative}.webp`)).metadata();
    assert.deepEqual([full.width, full.height], [original.width, original.height], tier);
    assert.deepEqual([full.width, full.height], [430, 691], tier);
    assert.deepEqual([thumbnail.width, thumbnail.height], [119, 192], tier);
  }
});
