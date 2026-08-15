# Manual editorial card mode — local implementation

**Date:** 2026-08-11
**Status:** `LOCAL_COMPLETE / NOT_DEPLOYED / NO_DATA_MUTATION`

## Purpose

Temporarily remove the public dependence on player market valuation from the
shared TouchLine player-card presentation. A card may now publish only a
manually reviewed editorial tier and card price. No player market value is
looked up, inferred, displayed, or used to select a public tier or price in the
covered public card surfaces. A pre-existing bundled frame may remain as visual
artwork while the editorial record is unpublished; it never supplies a tier,
price, status, or economic claim.

## Shared implementation

- `lib/touchlineArena/editorial-card-profile.ts` defines the strict local
  editorial record: canonical player UUID, `tierKey`, `cardPrice`,
  `editorialState`, `lastReviewedAt`, and private `internalNote` /
  `internalSource` fields.
- `lib/touchlineArena/editorial-card-catalog.ts` is the server-owned local
  catalogue. It exposes only the safe public projection
  `{ tierKey, cardPrice, lastReviewedAt }` and is intentionally empty until a
  reviewed record is entered.
- `components/touchline/cards/TouchlineEliteExactCard.tsx` is the shared
  compact-card seam. It now renders public tier/neon/price from a published
  editorial profile or, separately, from a pre-existing frozen active contract.
  An unpublished card can retain its already-bundled club frame only as visual
  artwork; it remains neutral in tier/price semantics. It contains no `Market
  Value` / `Valor de Mercado` block or placeholder.
- `lib/touchlineArena/card-zoom-details.ts` is the shared zoom seam. It now
  renders `Card profile` / `Perfil do card`, tier, card price, identity and
  TouchLine points. It emits no market value, economic-profile, range,
  `Pending`, or `Updating` field.

## Covered readers and public surfaces

- ClubHub public squad route reads identity/current-club/membership only with
  `includeMarketValues: false`, then adds a published editorial presentation by
  canonical player UUID.
- ClubHub grid, XI, player profile, ClubOwner profile, rankings, table zoom,
  static card QA, Arena field/bench/ranking card presentation and the
  authoritative owned-roster bridge consume the same presentation. The Arena
  adapter fails closed to a neutral tier/price when neither an editorial
  profile nor a frozen active contract exists. It may retain an already-bundled
  frame asset as non-commercial visual artwork.
- `/api/players/search-and-build-card` now stops with
  `manual_editorial_catalog_only` (`410`, `private, no-store`) before parsing a
  search request or invoking automatic player/card assembly. The old public
  search component is a local editorial notice, not a data search.
- Existing active contracts retain their stored tier and contractual price.
  A manual editorial price is display metadata only: it creates no contract,
  wallet entry, offer, checkout capability, or payment rule.

The 20 ClubHub clubs are untouched. No owner-approved market-value row, UUID
binding, Sportmonks snapshot, card inventory, contract, database row, migration,
provider credential, sync, Vercel environment, or deployment was changed.

## Entering one manual card

An authorised editor adds one reviewed record to
`TOUCHLINE_EDITORIAL_CARD_CATALOG` in
`lib/touchlineArena/editorial-card-catalog.ts`. Use the canonical
`football_players.id` UUID — never a player name, provider ID, or market value.

```ts
{
  playerId: "<canonical-football_players.id UUID>",
  tierKey: "radiant-gold",
  cardPrice: { amountMinor: 1500, currency: "TC" },
  editorialState: "published",
  lastReviewedAt: "2026-08-11T12:00:00.000Z",
  internalNote: "Editorial rationale — never public",
  internalSource: "Internal review reference — never public",
}
```

- `draft` and `review` never expose tier or price.
- `published` exposes only tier, card price, and review timestamp to the public
  card projection; the two internal fields are stripped.
- Add/edit one entry only; there is no batch operation and no effect on other
  clubs or players.
- Do not add a market valuation, supplier reference, or provider identifier to
  this record.

## Explicit limits and next gate

This local block intentionally did **not** redesign Arena/Market transaction
workflows or alter payment/contract authority. Their existing commercial logic
remains a separate protected surface; only the Arena's card presentation was
adapted to this editorial boundary. The shared compact and zoom card now fail
closed to neutral tier/price presentation unless a published editorial profile
or frozen active contract supplies a tier. Existing bundled frame artwork can
remain visible without becoming a tier claim.

Before any deployment, review the staged diff, add approved canonical UUID
records if desired, run the complete release gate, and obtain a separate
deployment decision. No editorial record was added in this block, so no live
player is newly assigned a manual tier or price by this work alone.

## Local validation evidence

- Focused editorial/public-boundary suite before the final Arena presentation
  adapter: **94/94 passed**.
- Editorial privacy contract after making the raw catalogue private: **7/7
  passed**.
- Arena presentation-boundary contract: **4/4 passed**.
- After the visual-art continuity adjustment, the focused editorial/public-card
  boundary suite passed **17/17**.
- A fresh integrated TypeScript run was started after the Arena adapter, but
  did not complete during a transient filesystem I/O stall. It is therefore
  not claimed as passed for the final combined tree and remains a release
  gate. The earlier strict TypeScript pass applies to the pre-Arena-adapter
  checkpoint only.
- A broad ESLint invocation was started but did not return before manual
  interruption during a transient worktree I/O slowdown; it is therefore not
  claimed as passed and remains a release gate.
- The pre-existing local server on port 3110 was serving an older `next start`
  build, so it was not used as visual evidence for this source change. The
  static EN/PT fixture and its source contract remain covered by the focused
  suite; a fresh local build is still required before release visual sign-off.

Relevant tests include:

- `tests/touchline-editorial-card-profile.test.mts`
- `tests/touchline-card-zoom-details.test.mts`
- `tests/touchline-public-card-release-scope.test.mts`
- `tests/touchline-card-value-states-fixture.test.mts`
- `tests/touchline-card-neon-trace-fixture.test.mts`
- `tests/touchline-authoritative-roster*.test.mts`
- `tests/touchline-commercial-card-surfaces.test.mts`
- `tests/search-and-build-card-response-boundary.test.mts`
