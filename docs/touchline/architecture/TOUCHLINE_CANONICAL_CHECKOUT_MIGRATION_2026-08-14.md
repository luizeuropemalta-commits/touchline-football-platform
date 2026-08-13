# TouchLine canonical checkout migration manifest

Status: PRESERVATION MANIFEST / MIGRATION IN PROGRESS

## Identity

- Old checkout: `/Users/luizlopez/Documents/Codex/2026-08-02/continuar-a-touchline-a-partir-do/work/touchline-continuation-20260810`
- Source branch: `work/continuation-20260810`
- Source HEAD and `origin/main`: `7e61df57b4050cb9f47ba17ca704fc9ed0d02e52`
- Remote: `git@github.com:luizeuropemalta-commits/touchline-football-platform.git`
- Intended new local-only checkout: `/Users/luizlopez/Developer/touchline-football-platform`
- Deleted files: none

The exact intended resulting tree is the Git tree produced by the scoped
preservation commit containing only the paths below. Generated output,
`node_modules`, `.next`, `.env.local`, `.vercel`, caches, locks and iCloud
metadata are excluded.

## Modified tracked files

- `.env.example`
- `.gitignore`
- `app/arena/ArenaClient.tsx`
- `docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

## New files

- `.codex/config.toml`
- `.github/workflows/touchline-ci.yml`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CURRENT_EXECUTION_LEDGER.md`
- `CURRENT_STATE.md`
- `PRODUCT_RULEBOOK.md`
- `RELEASE_CHECKLIST.md`
- `ROLLBACK_PLAYBOOK.md`
- `SECURITY_BOUNDARIES.md`
- `app/global-error.tsx`
- `docs/touchline-arena/audit/2026-08-11-CARD-COLORS-AND-MANUAL-VALUATION-CONSOLIDATED-REPORT.md`
- `docs/touchline-arena/audit/2026-08-11-LIVERPOOL_CARD_PIPELINE_FORENSIC_REPORT.md`
- `docs/touchline-arena/audit/2026-08-11-MANUAL-CARD-EDITORIAL-ADMIN-CANDIDATE.md`
- `docs/touchline-arena/audit/2026-08-11-MANUAL-EDITORIAL-CARD-MODE-LOCAL.md`
- `docs/touchline-arena/audit/2026-08-11-ROSTER-EXPORTER-REMOTE-PREFLIGHT-NO-GO.md`
- `docs/touchline-arena/audit/2026-08-11-TOUCHLINE-20-CLUB-CARD-TECHNICAL-QA.md`
- `docs/touchline-arena/audit/2026-08-11-TOUCHLINE-NEON-CARD-VISUAL-AUDIT.md`
- `docs/touchline-arena/audit/2026-08-11-TOUCHLINE-NEW-PLAYER-ALERTING-CANDIDATE.md`
- `docs/touchline-arena/audit/2026-08-11-TOUCHLINE_EXISTING_CARD_RECOVERY_REPORT.md`
- `docs/touchline-arena/audit/2026-08-11-TOUCHLINE_VERCEL_COMPLETE_AUDIT.md`
- `docs/touchline-arena/audit/2026-08-11-VERCEL_CLEANUP_CANDIDATES.md`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T18-31-00Z/canonical-roster-export.json`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T18-31-00Z/owner-approved-canonical-binding-manifest.json`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T18-31-00Z/owner-approved-card-publication-manifest.json`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T18-31-00Z/owner-approved-quarantine.json`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T18-31-00Z/owner-approved-reconciliation-report.json`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-11T19-32-00Z/liverpool-existing-verified-publication-manifest.json`
- `docs/touchline/architecture/CODEX_ENGINEERING_ENVIRONMENT_2026-08-13.md`
- `docs/touchline/architecture/TOUCHLINE_ADMIN_MOBILE_NOTIFICATION_WORKFLOW.md`
- `docs/touchline/architecture/TOUCHLINE_CARD_PUBLICATION_ATOMIC_ROLLOUT.md`
- `docs/touchline/architecture/TOUCHLINE_LEGACY_CARD_MODEL_DEPRECATION.md`
- `docs/touchline/architecture/TOUCHLINE_MANUAL_MARKET_VALUE_CARD_PUBLICATION_ARCHITECTURE.md`
- `docs/touchline/architecture/TOUCHLINE_NEW_PLAYER_MARKET_VALUE_WORKFLOW.md`
- `docs/touchline/architecture/TOUCHLINE_PLAYER_TRANSFER_AND_EXIT_WORKFLOW.md`
- `docs/touchline/architecture/TOUCHLINE_POST_RELEASE_LARGE_MODULE_DECOMPOSITION.md`
- `docs/touchline/release-audit/2026-08-10-CLUBHUB-BENCH-AND-CARD-PENDING-READABILITY.md`
- `docs/touchline/release-audit/2026-08-11-DEFERRED-CARD-PUBLICATION-SAFETY-GATE.md`
- `docs/touchline/release-audit/2026-08-11-FINAL-LOCAL-RECOVERY-GATE.md`
- `docs/touchline/release-audit/2026-08-11-TOUCHLINE-VERCEL-COMPLETE-AUDIT.md`
- `docs/touchline/release-audit/2026-08-11-TWENTY-CLUB-CARD-QA-CHECKPOINT.md`
- `docs/touchline/release-audit/2026-08-11-VERCEL-COMPLETE-AUDIT.md`
- `docs/touchline/release-audit/VERCEL_CLEANUP_CANDIDATES.md`
- `instrumentation-client.ts`
- `instrumentation.ts`
- `lib/sentry/options.ts`
- `lib/sentry/privacy.ts`
- `playwright.config.ts`
- `sentry.edge.config.ts`
- `sentry.server.config.ts`
- `tests/browser/tooling-smoke.spec.ts`
- `tests/touchline-ci-contract.test.mts`
- `tests/touchline-sentry-boundary.test.mts`

## Independent evidence

- Direct blob hashing detected changes that the iCloud worktree index omitted.
- The old worktree had an existing zero-byte `index.lock` and long-running Git
  reads; no lock was removed.
- The reviewed task-owned files were reconstructed in an isolated worktree at
  the same parent HEAD and previously passed frozen install, TypeScript,
  ESLint, 929 tests, seven Playwright projects, release readiness, diff check
  and a 131-route production build.
- No secret value, Production change, database write or deployment belongs to
  this migration.
