import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const rootAliasUrl = new URL("../app/fantasy/page.tsx", import.meta.url);
const legacyAliasUrl = new URL("../app/(app)/fantasy/page.tsx", import.meta.url);

test("the fantasy alias redirects to Arena without inheriting the protected legacy route group", async () => {
  const source = await readFile(rootAliasUrl, "utf8");
  assert.match(source, /redirect\(["']\/arena["']\)/);
  await assert.rejects(access(legacyAliasUrl));
});
