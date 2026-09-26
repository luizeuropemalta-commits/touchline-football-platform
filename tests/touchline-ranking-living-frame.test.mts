import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("featured and full-ranking frames use the published tier and retain the crown envelope", () => {
  const source = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/data-ranking-tier-frame=\{card\.editorialCard\?\.tierKey \?\? "unresolved"\}/g)?.length, 2);
  assert.equal(source.match(/TouchlineClubPerimeterTrace accent=\{card\.editorialCard\?\.tierKey \? zoom\.tierAccent : undefined\}/g)?.length, 2);
  assert.match(source, /radial-gradient\(circle at 50% 4%/);
  assert.match(source, /\.tl-card-rankings-featured article\s*\{[^}]*overflow: visible/s);
});
