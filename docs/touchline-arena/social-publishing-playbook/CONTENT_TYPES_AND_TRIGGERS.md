# Content types and triggers

This file records trigger intent and links to the executable source. A clock alone never makes football data official.

## MATCH PREVIEW

Target timing is T-24 hours through pre-kick-off. Generation requires:

- one canonical scheduled fixture in the current Premier League season;
- exact home/away provider team IDs mapped once in the 20-club catalogue;
- verified Europe/Malta kick-off, venue and Gameweek;
- a current official league-table projection with publishable positions;
- one active published card per club selected from the same active audited
  `player_scoring_v3` ranking snapshot by Total Rating, then the canonical
  minutes/appearances/provider-ID tie-breaker;
- immutable source revisions for the target fixture, competition, season,
  round, both clubs, **every active canonical membership in both current
  squads (including members not yet projectable into the public DTO)**,
  the active card-ranking snapshot and one competition-scoped league-table
  aggregate. The aggregate advances transactionally when any fixture, club or
  season row capable of changing the 20-club table changes; an unrelated
  fixture correction therefore supersedes the older preview atomically.

The selector has no manual player override. It joins ranking identities to the
current canonical club memberships and Card Engine publication state, filters
to eligible published cards, then chooses the highest ranked eligible card.
Any missing/ambiguous membership, duplicate identity, absence of an eligible
card, null Total Rating, stale table/ranking or changed revision is
`REVIEW_REQUIRED`.

MATCH PREVIEW contains no XI, substitute, formation or speculative team news.
The locked Feed template is 1080×1350 and gives both cards equal visual weight
under `WHO COMES OUT ON TOP?`.

## LINE-UP

Target timing is approximately T-30, but generation begins only after the persisted team sheet passes the shared gate in [`official-team-sheet-readiness.ts`](../../../lib/football-data/official-team-sheet-readiness.ts):

- fixture, competition, season, home and away identity are canonical;
- both teams have exactly 11 unique starters;
- formation positions are the exact unique set 1–11;
- each team has exactly nine unique official substitutes with no XI overlap;
- the selected team has a unique formation;
- every rendered starter and substitute resolves to the correct public canonical card and shirt number;
- coach copy is “CURRENT CLUB COACH” unless fixture-specific coach evidence exists.

The per-team rendering gate is [`social-lineup-contract.ts`](../../../lib/touchlineArena/social-lineup-contract.ts). The read model is [`social-lineup-draft-server.ts`](../../../lib/touchlineArena/social-lineup-draft-server.ts). Missing or conflicting data creates `REVIEW_REQUIRED`; it never creates a fallback player, card, shirt, team or coach.

The local candidate now enforces the approved two-minute stability interval after first complete observation in both worker discovery and the database claim boundary. It remains release-blocked until the exact migration/worker pass the disposable shadow and runtime acceptance matrix.

## FULL TIME

Generation is eligible only when [`social-final-score-draft-server.ts`](../../../lib/touchlineArena/social-final-score-draft-server.ts) proves:

- canonical fixture state is finished;
- integer final score exists;
- accepted Goal/Own Goal/Penalty events reconcile exactly to that score;
- goal order and minute/stoppage time come from persisted events;
- the highest final official Match Rating belongs to an eligible appearance and resolves to a published canonical card.

Official Match Rating must never be converted into TouchLine Points. A missing event, mismatched goal count or unpublished Top Match Card blocks the draft.

Gap: this read model is not yet connected to a reviewed current-source generation/attestation row. `FINAL_SCORE` approval and outbox transitions therefore remain disabled fail-closed; read-only DRAFT evidence is not approval eligibility.

## Additional numbered modules

The complete product family and activation order live in [Automatic social
module registry](AUTOMATIC_SOCIAL_MODULE_REGISTRY.md). Modules 042–046 remain
design contracts until their own typed input, migration/rollback, renderer,
deterministic trigger, fail-closed tests and second audit exist. No HALF TIME
content type is permitted.
