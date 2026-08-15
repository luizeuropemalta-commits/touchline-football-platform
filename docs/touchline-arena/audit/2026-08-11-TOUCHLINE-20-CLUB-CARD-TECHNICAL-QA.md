# TouchLine 20-Club Card Technical QA — 2026-08-11

## Completed local checks

- Scope contains exactly 20 unique canonical provider team IDs.
- Every club has a canonical crest asset.
- Every club/tier combination resolves to an existing full, compact and zoom
  frame asset: **20 × 7 × 3 = 420 frame derivatives**.
- All seven tier colour palettes are complete.
- A manual editorial decision uses the one shared policy to derive its tier
  and nominal price; it does not pick a border directly.
- Unresolved/bad/partial roster data fails closed instead of giving a new
  player a tier.

## Explicit limitation

No live production roster/database read was performed in this block. The
pending canonical UUID/membership binding and unapplied manual-editorial
migration mean this document does not claim that every player is published.
It proves that all visual assets and shared policy paths are present for each
club once a reviewed record is published.

## 2026-08-11 static presentation matrix

The protected local fixture and source-contract matrix was re-run after the
editorial/publication changes:

- **22/22 passed:** canonical 20-club frame/crest assets, seven-tier palettes,
  ClubHub crest trace, profile order, XI/bench/outside-roster partition,
  initial official table and EN/PT static fixtures.
- The card-neon regression expectations were updated to require an explicit
  published editorial card rather than the retired verified-valuation/
  contract formatter. The shared stroke-only tier/crest trace remains covered.
- A real browser pass was attempted but the local Next process did not become
  ready inside the safe wait window while the workstation volume was **99%**
  used (3.5 GB available). The process was stopped; no screenshot or device
  claim is recorded from that attempt.

## Next browser matrix

Use the same candidate build to record per club:

`TOTAL CARDS / PUBLISHED / MARKET VALUE REQUIRED / WRONG TIER / WRONG BORDER /
WRONG PRICE / GREY VERIFIED CARD / NEON DEFECT / CREST DEFECT / FLICKER`.

Do not turn this into a production promotion until the browser matrix and
manual-editorial database gate are both passed.

## 2026-08-11 re-check after editorial type hardening

- **29/29 focused checks passed:** all 20 canonical crest/frame derivatives,
  seven tier palettes, static twenty-club gallery isolation, ClubHub crest
  trace, match preview fail-closed handling, published-card-only ClubHub
  cards, initial official table and 20-club roster reconciliation.
- **Strict TypeScript passed:** the protected manual editor, bulk preview,
  alert queue, Arena public-card adapter and static gallery now compile under
  the complete project typecheck. The fixes were type-boundary only; they do
  not call a provider, write the database or alter a publication record.
- **Browser status:** a local browser attempt remained blocked by the existing
  protected `/visual-qa` authentication boundary before HTML was delivered.
  The boundary was not relaxed. No 390/768/1280 visual observation is claimed
  from this run; authenticated WebKit/Chrome review remains an external gate.
