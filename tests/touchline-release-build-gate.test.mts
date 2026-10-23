import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("QA workflow uses pinned preinstalled Ubuntu browsers and executes the complete suite independently of Vercel", async () => {
  const workflow = await readFile(new URL("../.github/workflows/touchline-qa-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /on:\n  push:\n    branches: \[qa\]/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 25/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /version: 11\.9\.0/);
  assert.match(workflow, /run: pnpm install --frozen-lockfile/);
  const lockfile = await readFile(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");
  const playwrightVersion = lockfile.match(/'@playwright\/test':\n\s+specifier: [^\n]+\n\s+version: ([\d.]+)/)?.[1];
  assert.ok(playwrightVersion, "Playwright version must resolve from the frozen lockfile");
  assert.match(workflow, /container:\n\s+image: mcr\.microsoft\.com\/playwright:v[\d.]+-noble@sha256:[a-f0-9]{64}/);
  assert.ok(workflow.includes(`mcr.microsoft.com/playwright:v${playwrightVersion}-noble@sha256:`), "container browser revision must match the locked Playwright package");
  assert.ok(workflow.includes("-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e"), "release image must retain the reviewed immutable digest");
  assert.doesNotMatch(workflow, /playwright install|apt-get|apt install/, "browser OS setup must not depend on runner package mirrors");
  assert.match(workflow, /run: pnpm run verify:release/);
  assert.match(workflow, /git -c safe\.directory="\$GITHUB_WORKSPACE" -C "\$GITHUB_WORKSPACE" diff --check/);
  assert.match(workflow, /repo_status=\$\(git -c safe\.directory="\$GITHUB_WORKSPACE" -C "\$GITHUB_WORKSPACE" status --porcelain\)/);
  assert.match(workflow, /test -z "\$repo_status"/);
  assert.ok(workflow.indexOf("Verify exact checked-out repository") < workflow.indexOf("Frozen install"));
  assert.doesNotMatch(workflow, /safe\.directory[= ]['"]?\*|git config --global|persist-credentials: true/);
  assert.doesNotMatch(workflow, /vercel-build|check-touchline-qa-ci-gate|secrets\./);
  for (const action of workflow.matchAll(/uses: (\S+)/g)) {
    assert.match(action[1], /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/, "workflow actions must be pinned to immutable revisions");
  }
});

test("container repository checks bind exact path and SHA and fail closed on Git errors", async () => {
  const workflow = await readFile(new URL("../.github/workflows/touchline-qa-release.yml", import.meta.url), "utf8");
  const step = (name: string) => {
    const block = workflow.split(`      - name: ${name}\n        run: |\n`)[1]?.split(/\n      - /)[0];
    assert.ok(block, `missing workflow step: ${name}`);
    return block.split("\n").map((line) => line.replace(/^          /, "")).join("\n");
  };
  const preflight = step("Verify exact checked-out repository");
  const safety = step("Diff and generated-artifact safety");
  const fixture = await mkdtemp(join(tmpdir(), "touchline-ci-git-"));
  try {
    await writeFile(join(fixture, "git"), `#!/bin/sh
test "$1" = '-c' || exit 91
test "$2" = "safe.directory=$GITHUB_WORKSPACE" || exit 92
test "$3" = '-C' || exit 93
test "$4" = "$GITHUB_WORKSPACE" || exit 94
shift 4
case "$*" in
  'rev-parse --show-toplevel') test "$CI_TEST_CASE" != root-error || exit 128; if test "$CI_TEST_CASE" = wrong-root; then printf '/other-checkout\\n'; else printf '%s\\n' "$GITHUB_WORKSPACE"; fi ;;
  'rev-parse HEAD') test "$CI_TEST_CASE" != sha-error || exit 128; if test "$CI_TEST_CASE" = wrong-sha; then printf 'wrong-sha\\n'; else printf '%s\\n' "$GITHUB_SHA"; fi ;;
  'diff --check') test "$CI_TEST_CASE" != diff-error || exit 129 ;;
  'status --porcelain') test "$CI_TEST_CASE" != status-error || exit 128; if test "$CI_TEST_CASE" = dirty; then printf ' M tracked-file\\n'; fi ;;
  *) exit 95 ;;
esac
`, { mode: 0o700 });
    const run = (script: string, scenario: string) => spawnSync("/bin/sh", ["-e", "-c", script], {
      cwd: tmpdir(),
      env: { ...process.env, PATH: `${fixture}:${process.env.PATH ?? ""}`, GITHUB_WORKSPACE: "/exact checkout with spaces", GITHUB_SHA: "a".repeat(40), CI_TEST_CASE: scenario },
      encoding: "utf8",
    });
    for (const script of [preflight, safety]) assert.equal(run(script, "clean").status, 0);
    for (const scenario of ["root-error", "wrong-root", "sha-error", "wrong-sha"]) assert.notEqual(run(preflight, scenario).status, 0, scenario);
    for (const scenario of ["diff-error", "status-error", "dirty"]) assert.notEqual(run(safety, scenario).status, 0, scenario);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
