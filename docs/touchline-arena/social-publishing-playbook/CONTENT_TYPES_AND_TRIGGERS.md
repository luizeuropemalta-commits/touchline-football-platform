# Content types and triggers

This file records trigger intent and links to the executable source. A clock alone never makes football data official.

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

## Other approved concepts

Ranking leader, hat-trick hero, tutorial, event and campaign formats are design concepts only until each receives a typed input contract, deterministic trigger, immutable template version, fail-closed tests and Admin approval flow. They may be composed manually as DRAFT evidence but are not automatic pipeline content types.
