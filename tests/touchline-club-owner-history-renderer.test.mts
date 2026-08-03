import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerSeasonHistoryRenderer.tsx", import.meta.url), "utf8");

test("ClubOwner history is server-only, owner-scoped and contains no write operation", () => {
  assert.match(renderer, /readTouchlinePostSeasonHistory\(admin, user\.id,/);
  assert.match(renderer, /touchLineAuthEntryHref\([\s\S]*?"\/login"[\s\S]*?history\?lang=/);
  assert.match(renderer, /if \(user && !isOwner\) notFound\(\);/);
  assert.match(renderer, /history && !history\.ok/);
  assert.match(renderer, /items\.length === 0/);
  assert.doesNotMatch(renderer, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|fetch\(/);
});
