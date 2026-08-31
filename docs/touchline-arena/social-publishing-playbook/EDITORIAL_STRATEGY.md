# Continuous editorial strategy

All formats in this strategy remain approval-only. “Automatic” means generating an immutable DRAFT for separate artwork and caption review; it never means publishing without Luiz's explicit approval.

## TouchLine Card Duel — pre-match

Purpose: compare the current **Total Rating leader** of each club before a relevant fixture.

- Both canonical cards have exactly equal size and visual weight.
- Headline: `TOUCHLINE CARD DUEL`.
- Engagement line: `WHO COMES OUT ON TOP?`.
- Show each player's current Total Rating, club and active ranking snapshot/revision.
- Do not substitute Official Match Rating, TouchLine Points from one fixture, market value or Golden Boot goals.
- Fail closed if either club has no eligible published card, no current Total Rating, a stale snapshot or ambiguous club membership.

Default format: Feed 1080×1350. A Story reminder may reuse the approved facts through a separately versioned 1080×1920 template. Reel is not eligible until a motion template, audio rights and export contract receive separate approval.

Trigger: one candidate DRAFT per fixture after both club leaders are resolved from the same current ranking snapshot and before kick-off. A ranking change invalidates the DRAFT and its approvals.

## Golden Boot Race

Golden Boot is a separate editorial product from the TouchLine Ranking.

- Source field: verified competition goals, with the current competition/season identity.
- Never rank by Total Rating, Official Match Rating or TouchLine Points.
- Label: `GOLDEN BOOT RACE`; while unfinished, `CURRENT GOLDEN BOOT LEADER` and `SEASON IN PROGRESS`.
- Ties must use only the competition's documented official tie presentation; absent a canonical rule, show joint leaders rather than inventing an order.

Default format: Feed for the periodic table; Story only for a verified leader change. Reel remains blocked pending a separate approved template.

## Current TouchLine leader

Before a relevant match, a DRAFT may show the current overall or Gameweek leader using the active player-scoring snapshot.

- Overall label: `CURRENT TOUCHLINE LEADER`.
- Open Gameweek label: `CURRENT GAMEWEEK LEADER` plus `GAMEWEEK IN PROGRESS`.
- Do not say winner, champion or final while eligible fixtures/settlements remain provisional.
- Show Total Rating accumulated through the stated snapshot; if a last Match Rating is shown, label it separately.

Default format: Feed for a substantial pre-match feature; Story for a short verified update. A Reel requires the separate motion gate.

## Leader change

A change detected from a newer verified ranking snapshot may create a Story DRAFT.

- Label: `NEW CURRENT LEADER` and `GAMEWEEK IN PROGRESS` when applicable.
- Record previous leader, new leader, old/new snapshot revisions and observation time internally.
- Do not generate on a transient, stale, incomplete or rolled-back snapshot.
- Any later reversal is a new revision and requires a new approval; never silently edit an approved Story.

Gap: stable-change detection and its idempotent trigger are not implemented. Until they are tested, leader-change Stories are manual DRAFTs only.

## Final Gameweek ranking

Generate only when every eligible Gameweek fixture is finished and every required player settlement is final, with zero scoreable gaps.

- Label: `GAMEWEEK FINAL RANKING`.
- Show the final snapshot/revision and clearly distinguish Total Rating from the last Match Rating.
- Never publish a “final” table while a fixture is live, postponed without a documented resolution, or still provisional.

Default format: Feed. Optional Story summary requires its own approved template. Reel is not currently supported.

## Anti-spam and idempotency

- Card Duel: maximum one approved publication identity per fixture and template revision.
- Current-leader pre-match feature: maximum one Feed candidate per relevant fixture; do not repeat unchanged leader/snapshot facts.
- Leader-change Story: one candidate per verified leader + ranking revision; identical revisions are deduplicated.
- Golden Boot Race: maximum one regular Feed candidate per Gameweek, plus a Story only for an actual verified leader change.
- Final Gameweek ranking: exactly one candidate per Gameweek + locale + template revision.
- Do not create a Reel by automatically recycling a Feed/Story asset.
- Owner rejection, stale source or changed facts do not justify duplicate spam; they create a corrected immutable revision when warranted.

## Data and approval references

Ranking values must come from the active canonical ranking/player-scoring read model. All artwork/caption identity, checksum, revision and approval rules remain governed by [`social-publication-contract.ts`](../../../lib/touchlineArena/social-publication-contract.ts), [Admin approval workflow](ADMIN_APPROVAL_WORKFLOW.md) and [Data/fail-closed policy](DATA_AND_FAIL_CLOSED.md).
