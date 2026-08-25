import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const rootAliasUrl = new URL("../app/fantasy/page.tsx", import.meta.url);
const legacyAliasUrl = new URL("../app/(app)/fantasy/page.tsx", import.meta.url);

test("the Fantasy Gameweek page is authenticated and does not revive the protected legacy route group", async () => {
  const source = await readFile(rootAliasUrl, "utf8");
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /redirect\(`\/login\?returnTo=/);
  assert.match(source, /loadTouchlineFantasySnapshot\(user\)/);
  assert.match(source, /<FantasyGameweekClient initialSnapshot=\{snapshot\}/);
  assert.doesNotMatch(source, /redirect\(["']\/arena["']\)/);
  await assert.rejects(access(legacyAliasUrl));
});
