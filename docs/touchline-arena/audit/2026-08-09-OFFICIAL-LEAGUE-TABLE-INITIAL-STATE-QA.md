# Official league table — initial-state QA

**Date:** 2026-08-09
**Scope:** TouchLine England official league table only. This is not a
TouchLine ranking, card, market-value, roster, sync, database or deployment
change.

## Purpose

Before the first verified final result, the public table must still show the
canonical 20-club competition scope without inventing a leader or sporting
position. Every row must be neutral: `—` position and zero
J/V/E/D/GF/GA/SG/Pts statistics. Once a canonical final exists, the existing
real-standings path remains authoritative.

## Implementation and boundary

- `lib/football-data/official-league-table.ts` already supplies the
  server-owned `pending_no_final` model: exactly 20 identity-checked club rows,
  preserved input order, null positions, zero metrics and no form. It
  fail-closes for a missing/duplicate club or an invalid fixture identity.
- `components/touchline/TouchlineOfficialLeagueTable.tsx` now shows one,
  explicit initial-table notice above those rows rather than rendering the
  same message twice. EN: “Initial table — all 20 clubs are level.” PT-BR:
  “Tabela inicial — os 20 clubes estão empatados.”
- `app/visual-qa/official-league-table-initial/page.tsx` is an
  admin-gated, static local QA fixture. It invokes only the pure resolver with
  20 fixed fixture identities and no finals. It has no database, provider,
  account, market, card or ranking dependency. Its nested 390px local iframe
  exercises the mobile breakpoint without presenting the fixture as live data.

## Regression coverage

`tests/touchline-official-league-table.test.mts` proves:

1. the complete 20-club input order survives the initial state;
2. all position and sporting metric fields are neutral;
3. scheduled, live, cancelled and scoreless fixtures do not become final
   results;
4. a verified final still produces the existing canonical standings; and
5. incomplete identity/season scope remains fail-closed.

`tests/touchline-official-league-table-visual-fixture.test.mts` pins the local
fixture boundary and its mobile viewport fixture.

## Local visual evidence

The local route was launched with an empty allowlisted process environment:
no Supabase, Sportmonks, payment, Vercel or TouchLine credential variables.

- Desktop DOM check: 20 rows; 20 `—` positions; exactly one status notice;
  all desktop columns visible; no page horizontal overflow.
- 390px iframe check: 20 rows; one status notice; the mobile table exposes
  `Pos`, `Club`, `P`, `GD` and `Pts` only, as designed by the responsive CSS.
- Focused Node tests: **9/9 passed**.
- `pnpm typecheck`, `pnpm lint`, and `git diff --check`: passed. Lint emitted
  only the pre-existing Babel size note for `ArenaClient.tsx`.

## Non-actions and release boundary

No database connection/write, Sportmonks call, sync, migration, preview
deployment or production deployment occurred. The static QA route is not a
release candidate and cannot substitute for a data-backed production
verification.

## Follow-up

The next approved block is the ClubHub profile redesign. Its data map must
first establish whether an official matchday coach and nine named substitutes
exist; absent evidence must remain an explicit waiting state. Shared
TouchLine ranking content stays below the separate official table.
