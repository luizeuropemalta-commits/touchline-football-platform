import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CARD_ART_PERIMETER_PATHS, resolvePlayerCardArtPerimeterPath } from "../lib/touchlineArena/card-art-perimeter-paths.ts";

const source = readFileSync(new URL("../components/touchline/cards/TouchlineCardPerimeterTrace.tsx", import.meta.url), "utf8");
const realRequire = createRequire(import.meta.url);
const moduleBox = { exports: {} as { TouchlineCardPerimeterTrace: React.ComponentType<{ tier?: string | null; variant?: "player" | "coach"; frameUrl?: string | null }> } };
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
runInNewContext(compiled, { exports: moduleBox.exports, module: moduleBox, require(specifier: string) {
  if (specifier === "react/jsx-runtime") return realRequire(specifier);
  if (specifier === "@/lib/touchlineArena/card-art-perimeter-paths") return { CARD_ART_PERIMETER_PATHS, resolvePlayerCardArtPerimeterPath };
  throw new Error(`Unexpected trace import: ${specifier}`);
} });
const Trace = moduleBox.exports.TouchlineCardPerimeterTrace;

const expectedRails: Record<string, number[]> = {
  "ruby-red": [21,412,95,711], "sapphire-blue": [18,412,79,726],
  "amethyst-purple": [14,417,78,730], "radiant-gold": [15,414,89,715],
  "emerald-green": [25,411,78,725], "clear-diamond": [19,412,76,748],
  "diamond-gold": [29,400,80,733],
};
function originalTrace(tier: string, variant: "player" | "coach") {
  const [left,right,coachLeft,coachRight] = expectedRails[tier];
  return variant === "player"
    ? `M123 18H307L${right} 98V593L307 680H123L${left} 593V98Z`
    : `M232 28H578L${coachRight} 153V926L578 1063H232L${coachLeft} 926V153Z`;
}

function render(props: React.ComponentProps<typeof Trace>) { return renderToStaticMarkup(React.createElement(Trace, props)); }
function assertOriginalTrace(html: string, expected: string, variant: "player" | "coach") {
  assert.ok(html, "approved art has a permanent neon");
  assert.match(html, /aria-hidden="true"/); assert.match(html, /focusable="false"/);
  assert.match(html, new RegExp(`data-touchline-card-neon-trace-variant="${variant}"`));
  const paths = [...html.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]);
  assert.equal(paths.length, 5, "base, core and all three vector halos are preserved");
  for (const path of paths) assert.equal(path, expected, "preserve the original travelling trace requested by the owner");
  assert.equal((html.match(/pathLength="100"/g) ?? []).length, 5);
  assert.equal((html.match(/data-touchline-card-neon-trace-run="true"/g) ?? []).length, 1);
  assert.match(html, variant === "coach" ? /viewBox="0 0 810 1080" preserveAspectRatio="xMidYMid meet"/ : /viewBox="0 0 430 691" preserveAspectRatio="none"/);
}

test("all147 approved artworks retain the original centred-rail neon", () => {
  const players = Object.entries(CARD_ART_PERIMETER_PATHS.player);
  assert.equal(players.length, 140);
  for (const [key] of players) {
    const tier = key.split("/").at(-1)!;
    const frameUrl = key.replace("/templates/clubs/", "/templates/zoom/clubs/") + ".webp";
    assertOriginalTrace(render({ tier, frameUrl }), originalTrace(tier, "player"), "player");
  }
  const coaches = Object.entries(CARD_ART_PERIMETER_PATHS.coach);
  assert.equal(coaches.length, 7);
  for (const [tier] of coaches) assertOriginalTrace(render({ tier, variant: "coach" }), originalTrace(tier, "coach"), "coach");
});

test("compact, zoom and encoded asset URLs resolve the same original trace; unknown assets stay empty", () => {
  const key = "/touchlineArena/cards/templates/clubs/Newcastle United/market-tiers/sapphire-blue";
  const expected = "M123 18H307L412 98V593L307 680H123L18 593V98Z";
  for (const size of ["", "zoom/", "compact/", "live-compact/"]) {
    const frameUrl = key.replace("/templates/clubs/", `/templates/${size}clubs/`).replace("Newcastle United", "Newcastle%20United") + ".webp?v=synthetic#same-art";
    assertOriginalTrace(render({ tier: "sapphire-blue", frameUrl }), expected, "player");
  }
  for (const tier of [null, undefined, "neutral", "constructor", "toString", "unknown"]) {
    assert.equal(render({ tier, variant: "coach" }), "");
    assert.equal(render({ tier, frameUrl: key + ".webp" }), "");
  }
  for (const frameUrl of [null, undefined, "/unapproved.webp", "/touchlineArena/cards/templates/clubs/Missing/market-tiers/sapphire-blue.webp", "%broken"]) {
    assert.equal(render({ tier: "sapphire-blue", frameUrl }), "");
  }
});


test("the rendered contour catalogue remains bound to the147 unchanged official source assets", () => {
  const generated = readFileSync(new URL("../lib/touchlineArena/card-art-perimeter-paths.ts", import.meta.url), "utf8");
  const assetEntries = [...generated.matchAll(/^\/\/ ([a-f0-9]{64})  (public\/touchlineArena\/cards\/templates\/zoom\/[^\r\n]+)$/gm)];
  assert.equal(assetEntries.length, 147);
  assert.equal(new Set(assetEntries.map(entry => entry[2])).size, 147);
  for (const [, expected, asset] of assetEntries) {
    const actual = createHash("sha256").update(readFileSync(new URL(`../${asset}`, import.meta.url))).digest("hex");
    assert.equal(actual, expected, `Measured contour source changed: ${asset}`);
  }
  const generatorHash = generated.match(/^\/\/ Generator SHA-256: ([a-f0-9]{64})$/m)?.[1];
  assert.ok(generatorHash);
  assert.equal(createHash("sha256").update(readFileSync(new URL("../scripts/generate-touchline-card-perimeter-paths.mjs", import.meta.url))).digest("hex"), generatorHash);
});
