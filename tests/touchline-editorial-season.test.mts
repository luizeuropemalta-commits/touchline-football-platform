import assert from "node:assert/strict";
import test from "node:test";
import { canonicalEditorialSeason } from "../lib/touchlineArena/editorial-season.ts";

test("editorial season aliases preserve only the same consecutive year pair", () => {
  for (const value of ["2026-27", "2026/27", "2026-2027", "2026/2027"]) {
    assert.equal(canonicalEditorialSeason(value), "2026-27");
  }
  assert.equal(canonicalEditorialSeason("1999/00"), "1999-00");
  assert.equal(canonicalEditorialSeason("1999-2000"), "1999-00");
  assert.equal(canonicalEditorialSeason("1000/1001"), "1000-01");
  assert.equal(canonicalEditorialSeason("9998/9999"), "9998-99");
  for (const value of [undefined, null, 2026, {}, "", "2026", "26/27", "2026/28", "2026/26", "2026/2028", "0999/1000", "9999/10000", "9999/00", "2026.27", " 2026/27", "2026/27 ", "2026 /27", "2026/27\n", "x2026/27", "2026/27x"]) {
    assert.equal(canonicalEditorialSeason(value), null, JSON.stringify(value));
  }
});
