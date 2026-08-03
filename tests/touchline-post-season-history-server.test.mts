import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("../lib/touchlineArena/post-season-history-server.ts", import.meta.url);

test("post-season history has a server-only, owner-scoped read model with no write operation", async () => {
  const source = await readFile(fileURLToPath(sourceUrl), "utf8");

  assert.match(source, /import "server-only"/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.select\(/);
  assert.match(source, /return phase === "POST_SEASON"/);
  assert.match(source, /\|\| phase === "RENEWAL_WINDOW"/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
});
