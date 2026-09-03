# TouchLine — Cost-Safe Commit and Vercel Deployment Policy

Status: CURRENT / MANDATORY
Owner decision: 2026-09-02
Scope: every TouchLine commit, Preview/QA deployment, Production deployment, redeploy, promotion and rollback

## Purpose

Prevent avoidable Vercel charges and prevent defective candidates from reaching a remote environment. Local work is the default. A remote build is a scarce, owner-funded release action.

This policy does not itself authorize a commit, push, deployment, database change, environment change, alias change or Production action.

## Cost model to remember

- Vercel normally creates a deployment/build for each new commit received through an enabled Git integration.
- Build usage is affected by elapsed build time, machine CPU allocation and concurrent builds.
- Multiple quick pushes can create multiple paid builds. Running a Git deployment and a CLI/redeploy path for the same candidate duplicates work.
- Elastic, Enhanced, Turbo and on-demand concurrency can increase paid usage. Faster or parallel is not automatically cheaper.
- A failed, cancelled or superseded build does not justify an immediate blind retry. Diagnose locally first.

Official references:

- <https://vercel.com/docs/builds/managing-builds>
- <https://vercel.com/docs/project-configuration/project-settings#ignored-build-step>
- <https://vercel.com/docs/pricing/manage-and-optimize-usage>

## Non-negotiable defaults

1. **Local-first:** develop, render, test and inspect on localhost before creating a remote build.
2. **Batch changes:** combine an owner-approved group of related fixes into one candidate instead of deploying each visual adjustment.
3. **Zero-build default:** no remote build is allowed until the owner explicitly authorizes the target environment.
4. **One-build budget:** after authorization, the default budget is one Git-native deployment for the exact approved SHA and target.
5. **One path only:** never combine Git-triggered deployment, `vercel deploy`, deploy hook, dashboard Redeploy, `--force` or **Start Building Now** for one candidate.
6. **No blind retries:** never rebuild the same failed SHA. Preserve the failure evidence, identify the cause, correct it locally, produce a new verified candidate, and request any additional remote-build budget.
7. **No speculative Production:** Preview/QA evidence must pass first. Production needs separate explicit authorization at the time of promotion.
8. **No silent cost upgrades:** Turbo/Enhanced machines, full on-demand concurrency or other paid acceleration need explicit owner authorization.
9. **One active build per branch:** prefer Vercel's `WAIT_FOR_NAMESPACE_QUEUE` behavior. Do not force queued work to start.
10. **Spend protection:** keep Vercel Usage Notifications enabled and configure Spend Management thresholds/actions appropriate to the owner's budget.

## Mandatory gate before a commit

- Resolve and record canonical Git root, remote, branch, baseline and `HEAD`.
- Inspect `git status --short` and the complete intended diff.
- Use an explicit task-owned file manifest. Never use blind `git add -A` in a contaminated worktree.
- Confirm no secret, credential, `.env*` value, cache, `.next`, build output, local database or temporary artifact is included.
- Confirm unrelated user work remains untouched.
- Run focused tests for the changed contract.
- Run TypeScript, ESLint and `git diff --check`.
- Run the proportional/full suite required by the mission risk.
- For a release candidate, run the complete release verification and a local production build before committing/deploying.
- Review failures; do not commit with a known failing required gate.

Recommended local baseline:

```text
pnpm run check:mission-governance
pnpm run check:release-readiness
pnpm exec tsc --noEmit --incremental false
pnpm run lint
pnpm run test
git diff --check
pnpm run build
```

## Mandatory gate before a remote deployment

- Re-run from the canonical repository, never a cache, temporary directory or stale checkpoint.
- Require a clean worktree and an immutable committed SHA.
- Record the exact target: isolated Preview, functional QA or Production.
- Record the exact file manifest, test counts, build result, flags and rollback target.
- Confirm the candidate SHA is not already `QUEUED`, `BUILDING` or `READY` for the same target.
- Confirm no second automation, deploy hook or CLI command will deploy the same SHA.
- Confirm the owner-authorized build budget has not been consumed.
- Use Git-native deployment. Do not use `--force` or **Start Building Now**.
- Keep feature gates OFF/fail-closed for the first remote smoke when applicable.

If any item is unknown, the release is `NO-GO` and no Vercel build is started.

## After the single authorized build

1. Verify that the deployment corresponds to the exact recorded SHA.
2. Require Vercel `READY`, but do not treat it as functional approval.
3. Smoke-test affected public and authenticated routes.
4. Inspect browser console, failed network requests and deployment/runtime logs.
5. Verify data, authorization and persistence boundaries.
6. On a blocking regression, stop further builds and roll back/promote the last verified deployment first.
7. Record deployment ID, URL, SHA, result and cost-related anomaly in the execution ledger.

## When another build may be requested

Another remote build is justified only when the previous candidate exposed a defect that could not reasonably be detected locally or when the owner materially changes the approved scope after the deployment. The failure and corrective evidence must be recorded before requesting another build.

## Prohibited shortcuts

- deploy to “see if it builds”;
- deploy every small visual iteration;
- retry the same SHA;
- use `--force` to solve an unexplained cache/build issue;
- run Git and CLI deployments together;
- start all queued builds immediately;
- change Vercel machine/concurrency/billing settings without explicit authority;
- call a deployment safe merely because its status is `READY`;
- hide failed checks or use a remote build as the first test environment.

## Required release report fields

- owner authorization and target;
- approved remote-build budget and builds consumed;
- canonical repository, branch and exact SHA;
- intended file manifest;
- local verification commands and exit status;
- local build result;
- duplicate-build check;
- remote deployment ID/URL/status, when one was authorized;
- smoke, logs and rollback result;
- Production status.
