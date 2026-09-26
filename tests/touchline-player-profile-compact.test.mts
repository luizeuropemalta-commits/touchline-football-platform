import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/touchline-players/[player]/player-profile.module.css", "utf8");

test("full player profile fits readable identity beside a compact portrait without a fixed hero floor", () => {
  const hero = css.match(/\.identityBand \{([^}]+)\}/)?.[1] ?? "";
  assert.match(hero, /grid-template-columns: minmax\(250px, 300px\) minmax\(0, 1fr\)/);
  assert.match(hero, /align-items: start/);
  assert.match(hero, /min-height: 0/);
  assert.match(hero, /gap: clamp\(20px, 2.5vw, 32px\)/);
  assert.doesNotMatch(css, /min-height: 680px/);
  assert.match(css, /width: clamp\(96px, 9vw, 128px\)/);
});

test("full player profile retains calibrated crown reserve only where the crown exists", () => {
  assert.match(css, /\.cardFrame \{[^}]*width: 300px;[^}]*--touchline-card-static-scale: \.6976744186;/);
  assert.match(css, /\.cardFrame:not\(:has\(> \[data-card-leadership-crown="true"\]\)\) \{\s*padding-top: 0;/);
  assert.match(css, /padding-top: clamp\(98px, 16vw, 128px\)/);
  assert.match(css, /\.cardFrame > \[data-card-leadership-crown="true"\] \{\s*margin-top: 0 !important;/);
});
