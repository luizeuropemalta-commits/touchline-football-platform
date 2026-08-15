# TouchLine representative QA package — 2026-08-15

## Status

`APPLIED_TO_DEDICATED_QA_ONLY`

- Git branch: `qa`
- Git base SHA: `bcd0b39ed9fa2011c4bb02531d4b4aa9ce4f365e`
- QA Supabase project ref: `xgxbwqxjssxxuihuwmgy`
- QA fixture run: `bf476289-c6df-47a6-878e-7dc8c40f3f91`
- Fixture version: `touchline-representative-qa-v1`
- Source fingerprint: `d9ae32dee6560e58ffd4416034905755bbbc59d4614b78a31a8c14848a201182`
- Package fingerprint: `e7077327762c19f22395b5a9abf95dbfd4d1998b0bc775ccd8634e2338564544`
- Production changed: **NO**

## Canonical representative data

The package is derived from reviewed repository artefacts. It does not identify
players by name alone and does not invent official football or valuation data.

| Coverage | Applied QA result |
| --- | ---: |
| Clubs | 20 |
| Competition | 1 |
| Canonical players | 588 |
| Active memberships | 588 |
| Owner-approved cards | 533 |
| Preserved Liverpool cards | 29 |
| Published/inventory cards | 562 |
| Card tiers represented | 7 |

The applied run is `applied`, has no rollback timestamp and its observed counts
match its expected counts. A replay returned the same counts without duplicate
players, memberships, inventory cards or publication rows.

## Representative ClubOwner

- Existing QA Auth identity reused: `072900f3-27fc-41a5-9881-6913a486754e`
- No new Auth user was created by this package.
- The scenario uses the official zero-TC Market checkout path and contains 35
  active contracts: 3 goalkeepers, 10 defenders, 11 midfielders and 11
  attackers.
- Arena state: `4-3-3`, 11 starters, 9 matchday substitutes, 15 outside the
  matchday squad, coach provider id `455907` and the approved repository avatar.
- Tactical QA overlay: GK 3, CB 6, RB 2, LB 2, CDM 5, MID 6, ATT 6 and ST 5.
- Tactical labels are explicitly QA-only. They do not rewrite canonical broad
  football positions and are not represented as provider facts.

## Match Centre and Arena fixtures

The versioned QA snapshot contains 20 deterministic fixtures and exercises all
20 clubs as home and away participants:

- 4 Scheduled
- 4 `2nd Half`
- 4 Finished
- 4 Postponed
- 4 Cancelled
- 1 deliberately partial score for fail-closed rendering
- stale/degraded snapshot behavior

No venue or other unverified football fact was fabricated. The QA public live
endpoint returned HTTP 200 with the persisted 20-fixture snapshot.

## Cards, coach and UI states

`/visual-qa/representative-package` is a static, admin-gated, non-production
fixture. It covers full, compact and zoom cards; published and active-contract
authority; long and short names; missing-image fallback; and a synthetic coach
presentation. The synthetic coach is visibly QA-only, is not an official
football fact and is never written to the canonical coach registry.

The versioned service-role-only coverage catalogue has exactly 27 rows:

- card: 11
- coach: 2
- Quick Sub: 4
- UI states: 10 (`loading`, `empty`, `success`, `error`, `unavailable`,
  `pending`, `stale`, `unauthorized`, `forbidden`, `not-found`)

The table has RLS enabled and no `anon` or `authenticated` grants. Its apply and
rollback functions reject every project ref except the dedicated QA project.

## Quick Substitution proof

Focused evidence passed 31/31 tests:

- opens only with exactly 11 starters and 9 substitutes;
- keeps fixed pitch slots and a complete disjoint 20-player partition;
- removes the incoming player from the active bench;
- shows the outgoing player in a disabled substituted-out rail;
- rejects re-entry, stale commands, cross-owner/cross-match commands and forged
  restored state;
- replays identical commands idempotently;
- does not call the saved-roster mutation path during a match substitution;
- replaces the Arena score rail with nine cards and the central coach.

Known boundary: the current match substitution projection is persisted in the
browser session and rebuilt from the canonical snapshot. It is not yet a
server-owned match event ledger and therefore is not cross-device durable. The
35-player roster itself remains canonical and is not mutated by Quick Sub.

## Reversibility

Every QA write has a scoped, project-guarded rollback:

- `touchline_rollback_representative_qa_package`
- `touchline_rollback_qa_owner_scenario`
- `touchline_rollback_qa_matchday_scenario`
- `touchline_rollback_qa_owner_tactical_slots`
- `touchline_rollback_qa_coverage_catalog`

The coverage catalogue rollback was proven inside an outer transaction:
27 rows removed, zero rows remaining, 27 rows reapplied, and the proof
transaction rolled back. Final QA state remained applied.

## Verification

- Representative package/card fixtures: 27/27 PASS
- Quick Sub focused suite: 31/31 PASS
- Coach/card zoom focused suite: 24/24 PASS
- TypeScript (`--noEmit --incremental false`): PASS
- `git diff --check`: PASS

## Security and release boundary

Supabase security advisors were rerun after the QA DDL. The catalogue's
service-role-only/RLS-no-public-policy posture is intentional. Existing project
advisor notices are deferred to the dedicated security phase and were not
opportunistically changed here.

No Production Supabase project, Auth user, row, RLS policy, Vercel environment,
alias, DNS, feature flag, payment, provider integration or `touchline.com.br`
deployment was changed. This package is QA evidence, not Production approval.
