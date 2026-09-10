import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/visual-qa/card-goalkeeper-stat-strip/page.tsx", import.meta.url),
  "utf8",
);

test("the goalkeeper visual QA route is static, sanitised, and covers every official tier", () => {
  assert.match(source, /TOUCHLINE_CARD_TIER_KEYS/);
  assert.match(source, /role:\s*"goalkeeper"/);
  assert.match(source, /position:\s*goalkeeper\s*\?\s*"GK"\s*:\s*"CM"/);
  assert.match(source, /saves:\s*43/);
  assert.match(source, /staticPlayer\(tierKey, "midfielder"\)/);
  assert.match(source, /STATIC LOCAL VISUAL QA/);
  assert.doesNotMatch(source, /fetch\s*\(|from\s+["']@\/lib\/supabase|useTouchlineActiveRanking/iu);
});
