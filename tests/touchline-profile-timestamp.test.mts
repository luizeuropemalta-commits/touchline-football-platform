import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatTouchlineProfileTimestamp } from "../lib/touchlineArena/profile-timestamp.ts";

test("fixture timestamps are readable in both languages with an explicit stable zone", () => {
  const en = formatTouchlineProfileTimestamp("2026-09-20T13:00:00+00:00", "en-GB");
  const pt = formatTouchlineProfileTimestamp("2026-09-20T13:00:00+00:00", "pt-BR");
  assert.match(en!, /20 Sept 2026.*13:00 UTC/);
  assert.match(pt!, /20 de set\. de 2026.*13:00 UTC/);
  assert.equal(en, formatTouchlineProfileTimestamp("2026-09-20T15:00:00+02:00", "en-GB"));
  assert.equal(en, formatTouchlineProfileTimestamp("2026-09-20T13:00:00.000000Z", "en-GB"));
});
test("midnight offsets cross the date correctly without guessing missing dates or zones", () => {
  assert.match(formatTouchlineProfileTimestamp("2026-10-01T00:30:00+02:00", "en-GB")!, /30 Sept 2026.*22:30 UTC/);
  for (const missing of [null, undefined, "", "bad", "2026-09-20", "2026-09-20T13:00:00", "2026-09-20T99:99:00Z"]) {
    assert.equal(formatTouchlineProfileTimestamp(missing, "pt-BR"), null);
  }
});
test("profile history, selected match, zoom history and season metadata never print raw timestamps", () => {
  const page = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /formatOfficialSyncTime\(fixture\.fixtureStartsAt, locale\)/);
  assert.match(page, /formatOfficialSyncTime\(current\.fixtureStartsAt, locale\)/);
  assert.match(page, /formatOfficialSyncTime\(statistics\.latestSyncAt, locale\)/);
  assert.doesNotMatch(page, /\{(?:fixture|current)\.fixtureStartsAt \?\? text\.unavailable\}/);
  assert.doesNotMatch(page, />\{statistics\.latestSyncAt\}<\/time>/);
});
