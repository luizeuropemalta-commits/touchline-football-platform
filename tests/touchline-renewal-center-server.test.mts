import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("../lib/touchlineArena/renewal-center-server.ts", import.meta.url);

test("Renewal Center is server-only, owner-scoped and has no write operation", async () => {
  const source = await readFile(fileURLToPath(sourceUrl), "utf8");

  assert.match(source, /import "server-only"/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.in\("source_contract_id", contractIds\)/);
  assert.match(source, /\.select\(/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  assert.match(source, /TL_RENEWAL_CENTER_QUOTES_UNAVAILABLE/);
});
