# 041 MATCH_PREVIEW owner artwork approval

Decision date: **2 September 2026, Europe/Malta**
Local source recheck: **10 September 2026, Europe/Malta**
Authority: **Luiz Lopez, TouchLine product owner**
Content type: **MATCH_PREVIEW**
Placement: **ClubHub / ClubOwner Timeline / Instagram Feed candidate**
Canvas: **1080×1350**
Template version: **touchline-match-preview-feed-v1**
Artwork approval: **APPROVED — LOCAL SOURCE ONLY**
Caption approval: **PENDING — SEPARATE OWNER REVIEW REQUIRED**
Outbound: **DISABLED — SEPARATE OPERATIONAL AUTHORISATION REQUIRED**

Approved evidence routes:

- `/visual-qa/clubhub-next-fixture-post`
- `/visual-qa/social-match-preview`

## Locked runtime identity

Visual template checksum:
`sha256:181fbf97fa849795a73a3f68f214072057dbff92d8d59902476057f74ac331da`

Complete template identity checksum:
`sha256:64fd190e2d20d081b4b8a138a0cc563a23fbf82f423e01877534cc04d3fba1f4`

The complete identity includes the approved visual sources, base caption source,
canonical icon lexicon and exact rendered-field manifest. Any covered source or
field change produces a new identity and requires a new owner review.

The owner completed this local recheck on 10 September 2026 from deterministic
non-publishable visual evidence. It refreshes this local source lock only; it
does not approve football facts, QA runtime use, captions, outbound delivery or
publication.

## Locked visual and data decisions

- One premium two-club fixture composition with the highest eligible published
  TouchLine card for each club.
- The two club leaders represent their own clubs; neither card is a global
  ranking claim.
- Club crests, fixture, kick-off, venue, Gameweek, current table positions and
  both cards come only from the canonical TouchLine readers.
- The venue and stadium image belong to the home club. The visitor must never
  select the stadium.
- Provider identifiers remain internal and never appear in public artwork or
  copy.
- Missing, stale, conflicting or non-unique source data fails closed. No
  opponent, result, player, rank, rating or stadium may be invented.

## Publication boundary

This record saves the approved artwork, not a remote publication. A real 041
item still requires a unique future fixture, current canonical table and card
ranking revisions, immutable generated media, separate artwork and caption
approvals in the Admin workflow, and idempotent first-party fan-out.

The intended internal sequence is one exact approved revision to both relevant
ClubHubs and then the same revision to every ClubOwner Timeline. Instagram and
Facebook remain disabled until their own credentials, delivery adapter,
preflight and explicit operational authorisation are complete.
