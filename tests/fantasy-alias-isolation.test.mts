import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const rootAliasUrl = new URL("../app/fantasy/page.tsx", import.meta.url);
const legacyAliasUrl = new URL("../app/(app)/fantasy/page.tsx", import.meta.url);

test("the legacy Fantasy URL aliases the one canonical TouchLine Markt builder", async () => {
  const source = await readFile(rootAliasUrl, "utf8");
  assert.match(source, /redirect\(`\/market-transfer\?lang=/);
  assert.doesNotMatch(source, /FantasyGameweekClient|loadTouchlineFantasySnapshot/);
  await assert.rejects(access(legacyAliasUrl));
});
