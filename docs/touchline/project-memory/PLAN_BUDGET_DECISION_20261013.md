# Approved plan-budget decision — 13 October 2026

Status: owner-approved product decision; local implementation advanced, remote validation pending.

## Owner visual-review addenda and local integration

Owner requested full-page local ClubOwner review, not an isolated header fixture. Compact cover should retain plan name, budget, actual remaining balance, arrows and a single View plan action; detailed benefits, price and comparison belong in zoom. Beta red neon leads with a thin separated green identity line inside. Preserve photo, subscription and player-card art. Full-screen smoked plan-coloured detail, four Beta club crests, precise credit spending explanation and polished buttons remain queued until rendered verification.

Local changes now reduce embedded card height and hide repetitive cover sections, with comparison available inside the dialog. These latest presentation changes are not yet browser-accepted or release-verified. Prior 33 focused tests passed before this simplification. Legacy visual fixture now uses finite VIP data; no real account balance was changed. Full local Next application started on loopback port3322 using only canonical QA public URL/publishable key in ignored .env.development.local; provider gate explicitly OFF, no service-role/provider credentials copied. Authentication and full-page rendering remain to be verified. No deployment or migration applied.

## Budget, not subscription price

| Plan | XI market budget |
| --- | ---: |
| Beta | 50,000,000 TC (existing trial budget retained) |
| Standard | 400,000,000 TC |
| Pro | 650,000,000 TC |
| Master | 850,000,000 TC |
| VIP | 1,000,000,000 TC; no unlimited purchasing power |

The owner explicitly accepted these paid-tier budgets in the voice discussion. This does not approve new subscription prices, billing activation or charges.

## Reference and limits

Use the existing August 2026 approved market-value base for this iteration; do not spend time refreshing external valuations now. Review next year. Reference: most expensive XI under the current 4-3-3 position rules totals EUR 1,130,000,000. This is a valuation reference, not a subscription price or guaranteed sporting performance.

XI: Donnarumma 45M; Timber 70M; Saliba 100M; Gabriel 75M; O'Reilly 70M; Rice 120M; Anderson 110M; Rogers 110M; Saka 110M; Haaland 220M; Palmer 100M (tied alternatives exist). Current rules allow a midfielder in a wing slot. The strict natural-position example with Doku at 75M totals 1,105M instead. Do not silently change positional eligibility to fit this decision.

The reference covers eleven starters only. Do not assert that it prices a complete squad including reserves or coaches. Keep the current XI budget scope until those mechanics are verified.

Beta is the limited introduction and must not enter competitive rankings. Standard, Pro, Master and VIP share the title competition. VIP is intended as a paid tier; owner-granted courtesy access may select any paid tier, with the payment/courtesy origin private and auditable. Courtesy must not grant extra sporting benefits beyond its tier.

## Implementation boundary and acceptance

Audit and align preview copy, server policy, database save/confirmation guards, existing confirmed-XI snapshots and ranking eligibility. Preserve profile, photo, actual subscription identity, historical scores and payment records. Preview navigation remains visual-only.

Observed old implementation: preview 500M/1B/2B/unlimited; server policy uses the same old amounts; SQL migrations 20261011014000 and 20261011015000 enforce the old budgets/snapshots. Never edit applied migrations. A forward migration and an explicit existing-lineup transition are required; no silent mass rewrite of accounts or lineups.

Before rollout: budget boundary tests for every tier; reject unlimited VIP under the new policy; verify preview cannot alter entitlements; verify Beta ranking exclusion; verify courtesy privacy; independent review; exact-candidate release gates and remote customer/admin QA evidence.

The original decision record changed no runtime policy. SUPERSEDED by the subsequent local implementation: shared finite budgets now feed server validation and preview; forward migration `20261013173813` patches prepare/save/lock with atomic source guards and blocks existing CONFIRMED rows. Paid-tier snapshot filtering excludes Beta and unknown snapshots from competitive ranking projection without rewriting scores. VIP preview no longer says invitation-only, price remains undefined and payments disabled. Courtesy administration is still pending. No remote database, account entitlement, billing setting or deployment changed.

Local evidence:59/59focused tests including4real SQL cases. Independent source review found no concrete P1/P2; additional mixed-ranking fixture prepared. QA read-only inventory:3DRAFT,1FINAL,1LOCKED; noCONFIRMED; all existing plan snapshots null. No guessed historical backfill. QA active max_players_per_club=11, so reference XI is not subject to a3-player club cap.

Rollout remains blocked by full release/browser gates, not by the recorded confirmation count. Recheck count under write hold before migration. Runtime rollback must restore preimage function definitions and prior application together under write hold; inspect any newly confirmed/locked records under finite budgets before a rollback. Do not blindly rerun earlier migrations or rewrite historical records.
