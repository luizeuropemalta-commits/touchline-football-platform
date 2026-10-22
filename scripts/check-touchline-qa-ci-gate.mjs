import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Browser tests need Ubuntu libraries unavailable in Vercel's AL2023 image.
// Only this exact QA Git deployment may consume the complete Ubuntu CI result.
// Every other context retains the local release suite before Next.js builds.
export const QA_CI = Object.freeze({
  owner: "luizeuropemalta-commits",
  repo: "touchline-football-platform",
  branch: "qa",
  workflow: ".github/workflows/touchline-qa-release.yml",
  timeoutMs: 30 * 60 * 1000,
  pollMs: 60 * 1000,
  requestTimeoutMs: 10 * 1000,
});

function assertSha(sha) {
  if (typeof sha !== "string" || sha.length !== 40 || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("QA_CI_INVALID_SHA");
  }
}

export function qaReleaseSha(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== QA_CI.branch) {
    return null;
  }
  if (env.VERCEL_GIT_REPO_OWNER !== QA_CI.owner || env.VERCEL_GIT_REPO_SLUG !== QA_CI.repo) {
    throw new Error("QA_CI_REPOSITORY_MISMATCH");
  }
  assertSha(env.VERCEL_GIT_COMMIT_SHA);
  // Owner-approved QA baseline: never silently publish the two-language fallback.
  // This check changes no configuration and never applies to Production.
  if (env.TOUCHLINE_SITE_LOCALES_ENABLED !== "true") {
    throw new Error("QA_SITE_LOCALES_REQUIRED");
  }
  return env.VERCEL_GIT_COMMIT_SHA;
}

function isCanonicalRepository(repository) {
  return repository?.full_name === `${QA_CI.owner}/${QA_CI.repo}`
    && repository?.name === QA_CI.repo
    && repository?.owner?.login === QA_CI.owner;
}

function assertRunIdentity(run, sha) {
  if (run.head_sha !== sha || run.head_branch !== QA_CI.branch || run.event !== "push"
      || ![QA_CI.workflow, `${QA_CI.workflow}@${QA_CI.branch}`].includes(run.path)
      || !isCanonicalRepository(run.repository)
      || !isCanonicalRepository(run.head_repository)) {
    throw new Error("QA_CI_RUN_IDENTITY_MISMATCH");
  }
}

export async function waitForQaCi(sha, {
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = Date.now,
  timeoutMs = QA_CI.timeoutMs,
  pollMs = QA_CI.pollMs,
  log = console.log,
} = {}) {
  assertSha(sha);
  const endpoint = new URL(`https://api.github.com/repos/${QA_CI.owner}/${QA_CI.repo}/actions/workflows/touchline-qa-release.yml/runs`);
  endpoint.search = new URLSearchParams({ branch: QA_CI.branch, event: "push", head_sha: sha, per_page: "100" }).toString();
  const deadline = now() + timeoutMs;
  let previousState;
  let workflowEndpointSeen = false;

  while (now() < deadline) {
    let body;
    try {
      const response = await fetchImpl(endpoint, {
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(QA_CI.requestTimeoutMs, Math.max(1, deadline - now()))),
      });
      if (response.status === 404 && !workflowEndpointSeen) {
        // A newly pushed workflow may not yet be registered. This only waits;
        // it cannot authorize a build and shares the overall bounded deadline.
        body = { total_count: 0, workflow_runs: [] };
      } else {
        if (!response.ok) throw new Error(`QA_CI_HTTP_${response.status}`);
        body = await response.json();
        workflowEndpointSeen = true;
      }
    } catch (error) {
      throw new Error(error?.message?.startsWith("QA_CI_HTTP_") ? error.message : "QA_CI_REQUEST_FAILED");
    }
    if (now() >= deadline) throw new Error("QA_CI_TIMEOUT");
    if (!Array.isArray(body?.workflow_runs) || !Number.isSafeInteger(body.total_count)
        || body.total_count !== body.workflow_runs.length || body.total_count > 100
        || body.workflow_runs.some((run) => !Number.isSafeInteger(run?.id) || run.id <= 0
          || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1)) {
      throw new Error("QA_CI_INVALID_RESPONSE");
    }
    // Never use an older success after a newer run or rerun failed/started.
    const run = [...body.workflow_runs].sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
    let state = "awaiting workflow";
    if (run) {
      assertRunIdentity(run, sha);
      if (run.status === "completed") {
        if (run.conclusion !== "success") throw new Error("QA_CI_NOT_SUCCESSFUL");
        log(`QA_CI_PASS sha=${sha} run=${run.id} attempt=${run.run_attempt}`);
        return { sha, runId: run.id, runAttempt: run.run_attempt };
      }
      if (!["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status)
          || run.conclusion !== null) throw new Error("QA_CI_INVALID_RUN_STATE");
      state = `run=${run.id} status=${run.status}`;
    }
    if (state !== previousState) log(`QA_CI_WAIT ${state}`);
    previousState = state;
    await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
  }
  throw new Error("QA_CI_TIMEOUT");
}

export async function runReleaseGate({
  env = process.env,
  spawn = spawnSync,
  waitForCi = waitForQaCi,
} = {}) {
  const sha = qaReleaseSha(env);
  if (sha !== null) {
    await waitForCi(sha);
    return 0;
  }
  const result = spawn("pnpm", ["run", "verify:release"], { stdio: "inherit", env });
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runReleaseGate();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
