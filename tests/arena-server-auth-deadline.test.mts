import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const arenaPagePath = fileURLToPath(new URL("../app/arena/page.tsx", import.meta.url));

test("Arena server auth is bounded and fails closed before rendering the client", async () => {
  const source = await readFile(arenaPagePath, "utf8");

  assert.match(source, /const ARENA_SERVER_AUTH_READ_TIMEOUT_MS = 8_000/);
  assert.match(source, /resolveServerReadWithin\(\s*supabase\.auth\.getUser\(\)\.then\(\(\{ data \}\) => data\.user\),\s*null,\s*ARENA_SERVER_AUTH_READ_TIMEOUT_MS/);
  assert.match(source, /canEditCardEngine=\{Boolean\(user && isOwnerEmail\(user\.email\)\)\}/);
});
