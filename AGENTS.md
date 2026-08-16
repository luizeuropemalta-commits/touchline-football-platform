# TouchLine Engineering Instructions

## Authority and scope

- Git is the source of truth. Resolve the current repository root and `HEAD` at runtime.
- Before starting any mission, classify the task, load the canonical governance, and select every relevant tool. Before closing it, execute the TouchLine Mission Completion Gate in `docs/touchline/project-memory/TOUCHLINE_MISSION_FOOTER.md`. No mission may be declared complete without that gate.
- Never treat `/Library/Caches`, temporary copies, stale worktrees, generated files, or an old checkpoint as source authority.
- Run one write-authorized critical mission at a time. Declare objective, scope, non-goals, affected domains, acceptance, rollback, and final evidence.
- Preserve unrelated user changes. Never use blind `git add -A` in a contaminated worktree.

## Product and data boundaries

- Real football data and TouchLine game data are separate domains.
- Sportmonks owns external football identity/data; TouchLine UUIDs own permanent internal identity.
- Manual Admin owns approved Market Value. Card Engine owns tier, border/neon, and nominal card price.
- A public game card requires canonical publication state. Never fabricate football facts, values, tiers, or prices.
- Never use a player name as database identity.

## Database and security

- Use forward migrations only; never delete applied migration history.
- Production writes require preflight, audit evidence, idempotency/atomicity, and rollback.
- Preserve RLS and server-only boundaries. Never expose secrets in prompts, logs, commits, or public DTOs.
- Never copy a Production service-role credential into Preview.
- Stripe Live, DNS, billing, payment, credential, and Production configuration changes require explicit owner authorization.

## Git, verification, and release

- Use explicit task-owned manifests for critical releases. Never force-push `main` or Production.
- P0/P1 release work requires clean-worktree proof.
- Critical changes require typecheck, ESLint, focused tests, complete suite, `git diff --check`, Production build, and clean-worktree validation.
- P0/P1 flow: implementation → tests → independent review → clean-worktree proof → release gate.
- Feature flags default fail-closed. Deploy with the gate OFF, smoke-test, then enable only with explicit authority and smoke-test again. Roll back first on P0.
- Never alter data values to repair presentation defects.
- Authenticated QA must use the canonical QA project and the documented canonical owner persona only. Run the QA persona preflight before an authenticated test; do not create, reuse, or silently switch to a technical test identity.

## UX and documentation

- User-facing work requires actual rendered human inspection on desktop and mobile. Do not claim visual PASS from source or tests alone.
- Update `CURRENT_STATE.md` and the authoritative execution ledger after material work.
- Mark obsolete rules `SUPERSEDED`; preserve historical evidence.
- Use the smallest sufficient mode: DAILY for focused work, CRITICAL ENGINEERING for data/security/architecture, RELEASE for promotion gates, and AUDIT as read-only first.
