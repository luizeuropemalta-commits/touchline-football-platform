import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("typecheck does not implicitly delete generated files", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.typecheck, "tsc --noEmit");
  assert.equal(manifest.scripts.pretypecheck, undefined);
  assert.ok(existsSync(new URL("../scripts/clean-next-type-duplicates.mjs", import.meta.url)));
});
