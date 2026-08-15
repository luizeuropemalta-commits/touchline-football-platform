# Deferred card-publication safety gate — 2026-08-11

## Status

**MANDATORY BEFORE THE FIRST REMOTE MIGRATION, VALUE WRITE, CARD PUBLICATION,
PUBLICATION-GATE ACTIVATION OR PRODUCTION PROMOTION.**

This is a queued pre-rollout safety gate. It does not authorise a remote
action, replace the recovery plan or change the current local candidate.

## Required proof before rollout

| Requirement | Required evidence |
| --- | --- |
| Atomic publish | One database transaction commits the manual value, publication, immutable publication history and value history together, or rolls all of them back. The current bulk UI is preview-only; any future bulk publish needs a separate all-or-nothing command. The public publication reader is intentionally uncached, so a post-commit cache failure cannot produce stale publication state. |
| Safe cutover | Schema first; backfill/dry-run next; then Preview/browser validation; only then enable the runtime published-card gate. |
| Revert | Revert reads the prior value and classification from immutable canonical history, restores the value and publication in the same transaction and adds immutable audit history. |
| Price semantics | Tiers retain their nominal prices: Ruby Red £0, Sapphire Blue £1, Amethyst Purple £2, Radiant Gold £4, Emerald Green £7, Clear Diamond £10, Diamond Gold £15. The atomic command independently fences the approved EUR thresholds as well as the price mapping. Launch-season payable rules remain separate. |
| Admin workflow | Canonical player → manual EUR value → engine tier → border/neon → nominal price → preview → explicit publish → immediate fresh public read, without Git, Codex or Vercel. |
| New player flow | Canonical football identity may exist without a card. New players create a protected `MARKET_VALUE_REQUIRED` alert and cannot render a public game card until manually reviewed and published. |
| No public pending card | No pending, grey, fake Ruby, fake £0 or unclassified game card may render. Football identity/profile may remain public without a game card. |
| Migration history | No historical migration is deleted or rewritten. All fixes are forward migrations and runtime/documentation changes. |

## Current local position

- The shared card component already fails closed when a published presentation
  is absent.
- The production cutover flag defaults disabled. Before it is explicitly set
  to `enabled`, only pre-existing canonical **verified** cards may use the
  transitional presentation; their EUR value, pending state and unclassified
  rows remain hidden. This prevents a code/schema deployment from blanking
  the existing card collection before the protected publication backfill.
- The protected route now delegates publish and revert exclusively to the
  atomic database commands. Until migration 052 exists remotely it fails
  closed with a 503 response and performs no write.
- Public card presentations now use a direct no-store server read. The
  protected route has no cache-invalidation step after the transaction, so
  cache availability cannot make a completed publication appear partially
  applied; the next page/API read validates the committed canonical rows.
- The local atomic command also rejects a mismatched manual-EUR/tier pair,
  even when the submitted nominal GBP price is internally consistent. It
  repeats the approved 6M/10M/20M/35M/50M/70M EUR thresholds at the final
  transaction boundary; it does not change contract or checkout amounts.
- Migrations `051_touchline_manual_card_editorial_profiles.sql` and
  `052_touchline_card_publication_atomic_commands.sql` are local and
  unapplied. The latter is a forward candidate for the atomic command, not
  proof of a remote transaction. No database schema, manual value,
  publication, Vercel setting or deployment has changed.
- The existing release gates also remain: canonical UUID/membership binding
  for the 533-row candidate, DNS verification, compliant Preview strategy,
  complete build and browser/device evidence.

## Activation stop condition

If any proof above is missing, the publication runtime remains local-only and
the system must not migrate, backfill, publish or promote production.

## 2026-08-11 local revert-offer hardening

- The protected Admin history now offers **Revert to prior** only when the
  immutable `before_state` contains complete, matching prior publication and
  market-value records for the same canonical player.
- A first publication, or any incomplete historical snapshot, displays no
  revert action. This is intentional: it prevents an operator from expecting
  a restoration that the atomic database command cannot prove safely.
- The UI check is advisory only. The future database command still performs
  canonical active-membership validation under lock before restoring any
  state.
- Local evidence: revert helper and protected-Admin boundary tests passed;
  strict TypeScript, scoped lint and diff checks passed. No migration, remote
  database command, environment change, Vercel change or deployment occurred.
