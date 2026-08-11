import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonUrl = new URL("../package.json", import.meta.url);

test("Vercel build requires the non-mutating release verification gate", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  assert.match(scripts["verify:release"] ?? "", /tsc --noEmit --incremental false/);
  assert.match(scripts["verify:release"] ?? "", /eslint \./);
  assert.match(scripts["verify:release"] ?? "", /node scripts\/run-vercel-release-tests\.mjs/);
  assert.match(scripts["verify:release"] ?? "", /check-touchline-release-readiness\.mjs --check/);
  assert.match(scripts["vercel-build"] ?? "", /^pnpm run verify:release && next build --webpack$/);
});
