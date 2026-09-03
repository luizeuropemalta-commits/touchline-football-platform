# TouchLine Release Checklist

Status: CURRENT
Last reviewed: 2026-09-02

Mandatory policy: [Cost-Safe Commit and Vercel Deployment Policy](docs/touchline/release-audit/VERCEL_COST_SAFE_COMMIT_AND_DEPLOY_POLICY.md)

## Candidate

- [ ] One declared release objective and explicit non-goals
- [ ] Exact branch, `HEAD`, baseline, and task-owned manifest recorded
- [ ] Clean worktree; generated/cache files excluded
- [ ] Rollback target and trigger documented

## Vercel cost safety

- [ ] Owner explicitly authorized this exact target; authorization has not been inferred from earlier unrelated work
- [ ] Remote-build budget recorded; default is one Git-native build for the exact approved SHA
- [ ] Related approved changes batched; remote deployment is not being used as the first build/test environment
- [ ] Candidate SHA is not already queued, building or ready for the same target
- [ ] No duplicate Git/CLI/redeploy/deploy-hook path exists for this candidate
- [ ] One active build per branch; no `--force`, **Start Building Now**, Turbo/Enhanced or full-concurrency override
- [ ] A failed SHA was diagnosed locally and was not blindly retried
- [ ] Spend Management and usage-alert status recorded for release-cost review

## Verification

- [ ] Focused regression tests pass
- [ ] Complete test suite passes
- [ ] `pnpm exec tsc --noEmit --incremental false` passes
- [ ] `pnpm lint` passes without errors
- [ ] `git diff --check` passes
- [ ] `pnpm build`/`pnpm vercel-build` passes in a clean environment
- [ ] Independent review finds no unresolved P0/P1
- [ ] Human browser inspection covers desktop and mobile; Safari/device gaps are explicit
- [ ] UI changes run the Playwright 390/768/1280/1440, keyboard, touch-capable, reduced-motion and console/network-observation matrix
- [ ] Native iOS/Android gaps are recorded; Playwright WebKit is not described as native iOS Safari
- [ ] If Sentry is enabled for the candidate: DSN/environment/release are correct, privacy scrubbers pass, source maps use a build-only token, and one non-Production controlled event is received and resolved

## Production

- [ ] Feature gate defaults OFF/fail-closed
- [ ] Gate-OFF deployment reaches Ready and public smoke passes
- [ ] Any database write has preflight, audit, idempotency, and rollback proof
- [ ] Gate enablement has separate explicit authority
- [ ] Post-cutover smoke covers affected public/authenticated routes
- [ ] P0 triggers rollback before further repair
- [ ] `CURRENT_STATE.md` and execution ledger are appended with final evidence
- [ ] Deployment ID, exact SHA, target and remote-build budget consumed are recorded
- [ ] Observability activation never substitutes for product smoke tests or rollback readiness

`pnpm run verify:release` is the local executable baseline. Passing it is necessary, not sufficient, for Production approval.
