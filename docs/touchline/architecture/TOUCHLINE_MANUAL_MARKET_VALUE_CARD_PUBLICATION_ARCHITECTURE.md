# TouchLine manual market-value and card-publication architecture

Status: local implementation candidate; the migration and the protected admin workflow are not applied to a remote database by this document.

## Source of truth

Sportmonks supplies football identity and roster data only. TouchLine holds the canonical player UUID, current active membership and the manually entered EUR market value in `football_player_market_values`. No public page exposes a provider valuation, estimated value, source name, or a value pending state.

`touchline_card_publications` is the one publication record per canonical player. It links the current membership, the approved manual-value row, calculated tier and nominal card price. `touchline_card_publication_history` is append-only audit evidence; private source/note fields never cross a browser DTO.

## Lifecycle and public rule

`detected → market_value_required → ready_for_review → ready_to_publish → published → inactive_in_competition → archived`

Only a `published` record whose manual value is verified, whose player still has the recorded active membership, and whose calculated tier/price are valid may become a game card. The reusable server-only reader is `lib/touchlineArena/card-publication-read-model.ts`; all game consumers must consume its public projection. It returns `null` on any mismatch.

Therefore:

- a real football player and roster profile may remain visible before publication;
- an unpublished player produces no card, no neutral/grey card, no placeholder tier, and no card-price action;
- a published card receives its frame and neon from the calculated tier and its crest accent from its canonical club;
- cache invalidation after a protected publish makes the change visible without a Vercel deployment.

## Manual input and calculation

The protected endpoint accepts a canonical player UUID and one manual EUR value. It validates canonical identity, current club, exactly one active Premier League membership, then stores the manual value in `football_player_market_values`. The engine determines tier and nominal card price; an editor does not choose either.

Bulk preview accepts at most 50 strict lines:

```text
NAME | AGE | VALUE
```

Name and age are matching aids only. An age mismatch, ambiguity, missing canonical identity or membership prevents publishing. No bulk input creates a player, changes an identity or applies a value without review.

## Explicit exclusions

This architecture does not change contracts, inventory, wallet, payments, ranking points, provider sync, or player identity. It also does not authorise a remote migration, database write, deployment, email delivery or web-push delivery.

## Required release gates

1. Apply and inspect the additive migration in an authorised database window.
2. Verify RLS/role policy: publication and history tables are service-only; no public grant exists.
3. Exercise one manual-value review/publish in a non-production environment and prove the shared read model publishes only the valid card.
4. Reconcile/cache-invalidate and test ClubHub, Arena, Market, tables, rankings and player profile with published and unpublished players.
5. Obtain separate authorisation before any production value or publication mutation.
