# TouchLine programming audit — block 1

Date: 2026-08-10
Mode: read-only audit, except the separately documented Quick Sub write guard.

This report records confirmed code-level findings. It does not authorize a
database write, migration, provider sync, value import, credential change or
production change.

## Corrected locally: unintended Arena-state write

- **Severity:** P0.
- **Finding:** an authenticated Quick Sub visit or `?clearLineup=1` could
  automatically schedule a remote state `PUT`, potentially persisting an
  empty lineup.
- **Disposition:** corrected locally, tested, pending deployment. See
  `docs/touchline-arena/audit/2026-08-10-QUICK-SUB-UNINTENDED-STATE-WRITE-GUARD.md`.

## Confirmed open findings

### P1 — no server-owned Quick Sub match record

The current no-reentry projection is browser-session scoped. Its match ID is
synthetic and it lives in session storage; it is not an official match event
that can be replayed across devices or Arena sessions. A future authoritative
snapshot/event command is required. Do not compensate with a roster write.

Relevant files:

- `app/arena/ArenaClient.tsx`
- `lib/touchlineArena/quick-substitution-session.ts`
- `lib/touchlineArena/durable-quick-substitution.ts`

### P1 — Quick Sub policy and UI still disagree

The UI says five substitutions while the durable reducer deliberately permits
more than five. The product must decide the rule before a cap is enforced.
Also, the current standalone panel does not implement the separately requested
inline Arena score-rail replacement or compatible-target neon.

### P1 — Live may present an old persisted snapshot without a clear stale label

`app/api/football-data/fantasy/livescores/route.ts` can return a degraded
snapshot; `components/touchline/match-centre/TouchlineMatchCentre.tsx` does
not yet surface that degraded state when rendering the fixture list. A safe
future presentation fix should label the timestamp/staleness or fail closed;
it must not fetch a provider from public display.

### P1 — release checks are not enforced by the deployment command

The project has separate tests/typecheck/lint/readiness scripts, but no
versioned `vercel-build`, CI workflow or compound release gate. The readiness
script does not include current Arena/Quick Sub or Live visual surfaces, so it
can report locally ready while those routes are not included.

Relevant files:

- `package.json`
- `scripts/check-touchline-release-readiness.mjs`

### P2 — type coverage and generated cache hygiene

The TypeScript config does not include the repository's `.mts` test/script
files. The regular typecheck prehook also deletes generated `.next/types`
duplicates, and tracked `tsconfig.tsbuildinfo` makes ordinary checks dirty the
worktree. These are developer-experience/release-gate issues, not a production
data mutation.

### P2 — roster/demo fallbacks require the planned canonical reconciliation

Bruno Guimarães remains associated with Newcastle in fallback/demo source,
contrary to the approved Arsenal decision. This is explicitly a reconciliation
input, not a permitted manual player patch. The current owner-approved values
remain blocked until a fresh canonical UUID/membership binding and separately
authorized atomic writer exist.

### P2 — ClubHub opponent crest fallback

If a future opponent name cannot be found in the static registry, the ClubHub
fallback can use the current club crest. A presentation guard should show a
neutral opponent mark instead; it must not invent opponent identity.

## Evidence and verification

- Full suite after the P0 fix: **835/835 passed**.
- Lint, strict TypeScript, production build and diff check passed.
- No credentials, remote state, database, Vercel configuration or production
  data were inspected or changed by this audit.

