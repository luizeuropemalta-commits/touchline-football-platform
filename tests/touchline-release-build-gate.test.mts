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

test("release runner bounds workers and preserves timeout, selection and exit status", async () => {
  const runner = await readFile(new URL("../scripts/run-vercel-release-tests.mjs", import.meta.url), "utf8");
  assert.match(runner, /"--test-concurrency=2"/);
  assert.match(runner, /"--test-timeout=30000"/);
  assert.match(runner, /\.\.\.testFiles/);
  assert.match(runner, /process\.exit\(result\.status \?\? 1\)/);
  assert.doesNotMatch(runner, /"touchline-social-events-live\.test\.mts"/, "hermetic events contract tests must run in the remote gate too");
});
