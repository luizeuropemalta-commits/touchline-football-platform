import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("three approved transparent crests receive a thin zero-blur alpha contour, not a box", () => {
  const rule = readFileSync(new URL("../app/touchline-crest-visibility.css", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /import "\.\/touchline-crest-visibility\.css"/);
  for (const club of ["liverpool", "nottingham-forest", "tottenham-hotspur"]) {
    for (const prefix of ["/", "%2F"]) for (const extension of ["png", "webp"]) {
      assert.ok(rule.includes(`[src*="${prefix}${club}.${extension}"]`));
    }
  }
  assert.match(rule, /club-logos/);
  assert.equal((rule.match(/drop-shadow\(/g) ?? []).length, 4);
  assert.match(rule, /drop-shadow\(\.5px 0 0 #fff\)/);
  assert.match(rule, /drop-shadow\(0 -\.5px 0 #fff\)/);
  assert.doesNotMatch(rule, /border:|background:|box-shadow:|animation:/);
});
