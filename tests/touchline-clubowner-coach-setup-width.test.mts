import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");

test("inline coach setup spans the market grid instead of squeezing ten clubs into one column", () => {
  const rule = css.match(/\.myClubMarket\s*>\s*\.myClubSetup\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, "the direct coach setup needs its own grid placement");
  assert.match(rule, /grid-column:\s*1\s*\/\s*-1\s*;/);
  assert.match(rule, /min-width:\s*0\s*;/);
});
