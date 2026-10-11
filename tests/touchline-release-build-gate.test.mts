import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonUrl = new URL("../package.json", import.meta.url);

test("Vercel build requires the release verification gate before Next.js", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  assert.match(scripts["verify:release"] ?? "", /tsc --noEmit --incremental false/);
  assert.match(scripts["verify:release"] ?? "", /eslint \./);
  assert.match(scripts["verify:release"] ?? "", /node scripts\/run-vercel-release-tests\.mjs/);
  assert.match(scripts["verify:release"] ?? "", /check-touchline-release-readiness\.mjs --check/);
  assert.equal(scripts["vercel-build"], "node scripts/check-touchline-qa-ci-gate.mjs && next build --webpack");
  assert.doesNotMatch(scripts["verify:release"] ?? "", /check-touchline-qa-ci-gate/, "CI must not wait on itself");
});

test("release runner bounds workers and preserves timeout, selection and exit status", async () => {
  const runner = await readFile(new URL("../scripts/run-vercel-release-tests.mjs", import.meta.url), "utf8");
  assert.match(runner, /"--test-concurrency=2"/);
  assert.match(runner, /"--test-timeout=30000"/);
  assert.doesNotMatch(runner, /"--test-force-exit"/, "release evidence must finish naturally rather than force process termination");
  assert.match(runner, /\.\.\.testFiles/);
  assert.match(runner, /process\.exit\(result\.status \?\? 1\)/);
  assert.doesNotMatch(runner, /"touchline-social-events-live\.test\.mts"/, "hermetic events contract tests must run in the remote gate too");
});

test("QA workflow provisions Ubuntu browsers and executes the complete suite independently of Vercel", async () => {
  const workflow = await readFile(new URL("../.github/workflows/touchline-qa-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /on:\n  push:\n    branches: \[qa\]/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 25/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /version: 11\.9\.0/);
  assert.match(workflow, /run: pnpm install --frozen-lockfile/);
  assert.match(workflow, /run: pnpm exec playwright install --with-deps chromium webkit/);
  assert.match(workflow, /run: pnpm run verify:release/);
  assert.match(workflow, /git diff --check/);
  assert.match(workflow, /git status --porcelain/);
  assert.doesNotMatch(workflow, /vercel-build|check-touchline-qa-ci-gate|secrets\./);
  for (const action of workflow.matchAll(/uses: (\S+)/g)) {
    assert.match(action[1], /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/, "workflow actions must be pinned to immutable revisions");
  }
});
