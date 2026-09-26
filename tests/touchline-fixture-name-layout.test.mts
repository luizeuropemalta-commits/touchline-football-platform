import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("fixture rail preserves complete club names and gives horizontal cards a separate date row", () => {
  const css = readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8");
  const names = css.match(/\.fixtureTeam b\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(names, /white-space:\s*normal/);
  assert.match(names, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(names, /ellipsis|overflow:\s*hidden/);
  assert.match(css, /@media \(max-width: 850px\)\s*\{\s*\.fixtureStack\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});
