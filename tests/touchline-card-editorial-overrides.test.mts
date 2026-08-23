import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const overrides = await readFile(
  new URL("../lib/touchlineArena/card-editorial-overrides.ts", import.meta.url),
  "utf8",
);

test("editorial overrides are loaded in bounded player-id queries", () => {
  assert.match(overrides, /const OVERRIDE_LOOKUP_CHUNK_SIZE = 200;/);
  assert.match(overrides, /for \(let offset = 0; offset < ids\.length; offset \+= OVERRIDE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(overrides, /ids\.slice\(offset, offset \+ OVERRIDE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(overrides, /rows\.push\(\.\.\.data\)/);
});
