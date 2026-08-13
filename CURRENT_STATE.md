# TouchLine Current State

Verified: 2026-08-14
Canonical repository: `/Users/luizlopez/Documents/Codex/2026-08-02/continuar-a-touchline-a-partir-do/work/touchline-continuation-20260810`
Branch: `work/continuation-20260810`
Repository HEAD at environment-audit start: `7e61df57b4050cb9f47ba17ca704fc9ed0d02e52`

## Production and release

- Git `origin/main` was verified at the same SHA during the latest card cutover.
- Current stable Production deployment recorded: `dpl_Bzpu9Wkx3vvi7sVSDvRGBENZQByt`.
- `TOUCHLINE_CARD_PUBLICATION_GATE`: **disabled** after P0 rollback.
- Latest isolated candidate evidence outside iCloud: frozen install PASS, typecheck PASS, ESLint 0 errors (4 warnings), tests 929/929 PASS, Playwright 7/7 PASS, release readiness PASS, diff check PASS, Production build PASS. This is validation evidence, not a clean-worktree claim for the iCloud checkout.

## Database

- Forward migrations through `054_touchline_existing_verified_liverpool_29_atomic_batch.sql` are represented in the repository.
- Latest applied evidence records 533 owner-approved lifecycle rows plus 29 Liverpool lifecycle rows: **562 published lifecycle cards across 20 clubs**.
- Recorded integrity failures: 0 incomplete, 0 membership mismatch, 0 duplicate players, 0 invalid nominal prices, 0 tier mismatch/fake zero.
- Exclusions remain outside the write set: 5 missing-value, 23 provider-only, 20 owner-only review.

## Active P0/P1 blockers

- **P0 Production authentication:** login returned `auth_unavailable`. Production environment-name inventory found `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, but `NEXT_PUBLIC_SUPABASE_URL` was absent. No environment value was changed.
- **P1 authenticated product QA:** Market, Arena, ClubOwner, Training Centre, and Quick Sub cannot receive final authenticated Production verification until auth is restored.
- **P1 native device QA:** native Safari/iOS/Android remains an external observation gate where unavailable.
- **P1 CI activation:** a read-only GitHub Actions candidate now covers every required gate and passes local validation, but it is not active until its reviewed commit reaches GitHub.
- **P1 filesystem:** the active clone is under Documents/iCloud and has previously stalled during build/I/O.
- **P1 Sentry Production activation:** organization `touchline-rn`, project `touchline-arena`, official CLI authentication and the privacy-first Next.js instrumentation are now validated. The integration remains fail-closed and inactive in Production because no DSN or Sentry build token was added to Vercel/Production. Activation requires its own reviewed release gate.

## Next executable action

Run a separately authorized Production-auth restoration mission: verify the canonical public Supabase URL without exposing it, add only the missing `NEXT_PUBLIC_SUPABASE_URL` scope if approved, keep the card gate OFF, redeploy the same SHA, validate login and authenticated surfaces, then reassess card-gate cutover. Do not copy a Production service-role credential into Preview.

The permanent Codex environment is ready for product work. Do not continue environment optimization unless a new material environment blocker appears.

For detailed immutable evidence, use `CURRENT_EXECUTION_LEDGER.md`.
