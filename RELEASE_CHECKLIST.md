# TouchLine Release Checklist

Status: CURRENT
Last reviewed: 2026-08-13

## Candidate

- [ ] One declared release objective and explicit non-goals
- [ ] Exact branch, `HEAD`, baseline, and task-owned manifest recorded
- [ ] Clean worktree; generated/cache files excluded
- [ ] Rollback target and trigger documented

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
- [ ] Observability activation never substitutes for product smoke tests or rollback readiness

`pnpm run verify:release` is the local executable baseline. Passing it is necessary, not sufficient, for Production approval.
