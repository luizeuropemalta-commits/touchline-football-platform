import assert from "node:assert/strict";
import test from "node:test";
import { QA_CI, qaReleaseSha, runReleaseGate, waitForQaCi } from "../scripts/check-touchline-qa-ci-gate.mjs";

const SHA = "a".repeat(40);
const repository = { full_name: `${QA_CI.owner}/${QA_CI.repo}`, name: QA_CI.repo, owner: { login: QA_CI.owner } };
const environment = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa",
  VERCEL_GIT_REPO_OWNER: QA_CI.owner, VERCEL_GIT_REPO_SLUG: QA_CI.repo, VERCEL_GIT_COMMIT_SHA: SHA,
};

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 100, run_attempt: 1, head_sha: SHA, head_branch: "qa", event: "push", path: QA_CI.workflow,
    repository, head_repository: repository, status: "completed", conclusion: "success", ...overrides,
  };
}

function response(runs: unknown[]) {
  return { ok: true, json: async () => ({ total_count: runs.length, workflow_runs: runs }) };
}

function harness(responses: unknown[], timeoutMs = 100) {
  let clock = 0;
  let requests = 0;
  return {
    options: {
      fetchImpl: async () => responses[Math.min(requests++, responses.length - 1)],
      sleep: async (ms: number) => { clock += ms; },
      now: () => clock, timeoutMs, pollMs: 20, log: () => {},
    },
    requests: () => requests,
  };
}

test("only exact Vercel QA context may consume CI and malformed identities fail closed", () => {
  assert.equal(qaReleaseSha(environment), SHA);
  for (const override of [{ VERCEL: undefined }, { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }]) {
    assert.equal(qaReleaseSha({ ...environment, ...override }), null);
  }
  for (const override of [{ VERCEL_GIT_REPO_OWNER: "fork" }, { VERCEL_GIT_REPO_SLUG: "other" }]) {
    assert.throws(() => qaReleaseSha({ ...environment, ...override }), /REPOSITORY_MISMATCH/);
  }
  for (const sha of [undefined, "", "a".repeat(39), "a".repeat(41), "g".repeat(40), `${SHA}\n`]) {
    assert.throws(() => qaReleaseSha({ ...environment, VERCEL_GIT_COMMIT_SHA: sha }), /INVALID_SHA/);
  }
});

test("exact completed CI success uses scoped public API without credentials or redirects", async () => {
  const { options } = harness([response([run()])]);
  const result = await waitForQaCi(SHA, {
    ...options,
    fetchImpl: async (url: URL, init: RequestInit) => {
      assert.equal(url.origin, "https://api.github.com");
      assert.equal(url.pathname, `/repos/${QA_CI.owner}/${QA_CI.repo}/actions/workflows/touchline-qa-release.yml/runs`);
      assert.equal(url.searchParams.get("head_sha"), SHA);
      assert.equal(url.searchParams.get("branch"), "qa");
      assert.equal(url.searchParams.get("event"), "push");
      assert.equal(init.redirect, "error");
      assert.equal(new Headers(init.headers).has("authorization"), false);
      assert.ok(init.signal instanceof AbortSignal);
      return response([run()]);
    },
  });
  assert.deepEqual(result, { sha: SHA, runId: 100, runAttempt: 1 });
});

test("run SHA, branch, event, workflow and both repository identities must match", async () => {
  for (const override of [
    { head_sha: "b".repeat(40) }, { head_branch: "main" }, { event: "pull_request" },
    { path: ".github/workflows/other.yml" }, { path: `${QA_CI.workflow}@main` },
    { path: `${QA_CI.workflow}@refs/heads/qa` }, { path: `${QA_CI.workflow}@QA` },
    { path: ".github/workflows/other.yml@qa" }, { repository: { ...repository, full_name: "fork/repo" } },
    { head_repository: { ...repository, owner: { login: "fork" } } },
    { repository: { ...repository, name: "other" } }, { head_repository: null },
  ]) {
    const { options } = harness([response([run(override)])]);
    await assert.rejects(waitForQaCi(SHA, options), /RUN_IDENTITY_MISMATCH/);
  }
});

test("workflow path permits only the canonical path with or without the exact QA suffix", async () => {
  for (const path of [QA_CI.workflow, `${QA_CI.workflow}@qa`]) {
    const { options } = harness([response([run({ path })])]);
    assert.deepEqual(await waitForQaCi(SHA, options), { sha: SHA, runId: 100, runAttempt: 1 });
  }
});

test("missing and running CI results are polled until exact success", async () => {
  const h = harness([response([]), response([run({ status: "in_progress", conclusion: null })]), response([run()])]);
  await waitForQaCi(SHA, h.options);
  assert.equal(h.requests(), 3);
});

test("initial unregistered workflow waits boundedly; a disappearing endpoint fails closed", async () => {
  const h = harness([{ ok: false, status: 404 }, response([]), response([run()])]);
  await waitForQaCi(SHA, h.options);
  assert.equal(h.requests(), 3);
  const missing = harness([{ ok: false, status: 404 }]);
  await assert.rejects(waitForQaCi(SHA, missing.options), /TIMEOUT/);
  assert.equal(missing.requests(), 5);
  const disappeared = harness([response([]), { ok: false, status: 404 }]);
  await assert.rejects(waitForQaCi(SHA, disappeared.options), /HTTP_404/);
  assert.equal(disappeared.requests(), 2);
});

test("default timeout accommodates the 25-minute workflow and bounds polling to 30 requests", async () => {
  assert.equal(QA_CI.timeoutMs, 30 * 60 * 1000);
  assert.equal(QA_CI.pollMs, 60 * 1000);
  const h = harness([response([])], QA_CI.timeoutMs);
  await assert.rejects(waitForQaCi(SHA, { ...h.options, pollMs: QA_CI.pollMs }), /TIMEOUT/);
  assert.equal(h.requests(), 30);
});

test("latest run or rerun prevents using an older passing result", async () => {
  for (const runs of [
    [run(), run({ id: 101, conclusion: "failure" })],
    [run(), run({ run_attempt: 2, conclusion: "cancelled" })],
  ]) {
    const { options } = harness([response(runs)]);
    await assert.rejects(waitForQaCi(SHA, options), /NOT_SUCCESSFUL/);
  }
  const h = harness([response([run(), run({ id: 101, status: "queued", conclusion: null })])]);
  await assert.rejects(waitForQaCi(SHA, h.options), /TIMEOUT/);
});

test("all terminal outcomes except success block release", async () => {
  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out", "neutral", "action_required", null]) {
    const { options } = harness([response([run({ conclusion })])]);
    await assert.rejects(waitForQaCi(SHA, options), /NOT_SUCCESSFUL/);
  }
});

test("missing CI times out and HTTP, network, redirect or malformed replies block release", async () => {
  const h = harness([response([])]);
  await assert.rejects(waitForQaCi(SHA, h.options), /TIMEOUT/);
  assert.equal(h.requests(), 5);
  for (const status of [301, 403, 429, 500]) {
    const { options } = harness([{ ok: false, status }]);
    await assert.rejects(waitForQaCi(SHA, options), new RegExp(`HTTP_${status}`));
  }
  for (const error of [new TypeError("network detail"), new Error("redirect detail"), new DOMException("timed out", "TimeoutError")]) {
    const { options } = harness([]);
    await assert.rejects(waitForQaCi(SHA, { ...options, fetchImpl: async () => { throw error; } }), /^Error: QA_CI_REQUEST_FAILED$/);
  }
  for (const body of [{}, { total_count: 1, workflow_runs: [] }, { total_count: 1, workflow_runs: [run({ id: null })] }]) {
    const { options } = harness([{ ok: true, json: async () => body }]);
    await assert.rejects(waitForQaCi(SHA, options), /INVALID_RESPONSE/);
  }
});

test("QA waits on CI; all other contexts run the unchanged suite and preserve its exit code", async () => {
  let waited = false;
  assert.equal(await runReleaseGate({ env: environment, waitForCi: async (sha: string) => { assert.equal(sha, SHA); waited = true; }, spawn: () => { throw new Error("must not run local suite"); } }), 0);
  assert.equal(waited, true);
  await assert.rejects(runReleaseGate({ env: environment, waitForCi: async () => { throw new Error("QA_CI_NOT_SUCCESSFUL"); } }), /NOT_SUCCESSFUL/);
  for (const status of [0, 1, 7, null]) {
    assert.equal(await runReleaseGate({
      env: {}, waitForCi: async () => { throw new Error("must not consume CI"); },
      spawn: (command: string, args: string[], opts: { stdio: string }) => {
        assert.equal(command, "pnpm");
        assert.deepEqual(args, ["run", "verify:release"]);
        assert.equal(opts.stdio, "inherit");
        return { status };
      },
    }), status ?? 1);
  }
});
