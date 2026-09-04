# 043 Goal artwork — approved Hat-trick composition

Status: **OWNER-APPROVED VISUAL — LOCAL QA ONLY**

Approved by: Luiz Lopez

Approved on: 2 September 2026 (Europe/Malta)

Approved route: `/visual-qa/social-confirmed-event?design=goal-hat-layout`

Placement candidate: Feed / ClubHub / ClubOwner Timeline, 1080×1350 (4:5)

Runtime visual template checksum:
`sha256:d2e1091432d6bcd26601b6338b25c4b3260cc3da9aac0a0dc5d99d6bb927f60a`

Runtime template identity checksum:
`sha256:c04b3f999cb9d7f80a8cdb8f7445e697c6bf0c441e57fbb33cd5715af49843e5`

These checksums bind the approved composition to its exact executable visual,
copy, icon lexicon and rendered-field contract. A covered change invalidates
the approval and cannot silently replace the saved art.

## Locked editorial decisions

- A normal goal reuses the approved Hat-trick editorial composition.
- The visible headline is `GOAAAALLLLL / GOALLLLLL`; the artwork never says
  `GOAL CONFIRMED`, because that wording can imply a VAR review.
- The top scoreboard uses large mobile-legible club crests, score and minute.
- The score is the exact score immediately **after that event**, never the
  final result unless that event itself produced the final result.
- The stadium image and venue name are resolved from the canonical home club.
  A visitor stadium must never be substituted.
- TouchLine Points are the persisted `player_scoring_v3` rating-band result.
  A goal does not receive a second invented points contribution.
- Missing, conflicting, pending, rescinded or unpublished facts fail closed.

## Verified owner sample

The local owner proof is bound to the checked-in canonical evidence snapshot:

- SportMonks fixture `19722191`: Chelsea 4–3 Brighton, 30 August 2026;
- João Pedro, provider player `28931574`;
- accepted goal event `157709453`, minute `32`;
- exact post-event score `Chelsea 3–0 Brighton`;
- home venue `Stamford Bridge`;
- final Match Rating `8.24`, TouchLine Points `+5`, Total Rating `16.45`.

The sample is `LOCAL_NON_PUBLISHABLE_VISUAL_QA`. It cannot enter the outbound
publication queue and does not replace the live canonical reader.

## Motion and export rule

The website animates each letter independently: the white top line progresses
from `G` to its final `L`, then the yellow lower line follows. The lower line
uses the same `#f6d45f` gold as the points/rating figures. The loop repeats
without moving the artwork canvas or changing any football fact.
`prefers-reduced-motion` renders the complete word without animation. Before a
PNG is captured, the exporter applies `data-static-export="true"`; Instagram,
Facebook and other static destinations therefore always receive the complete
headline, never an intermediate animation frame.

## Club-colour perimeter rule

The thin travelling perimeter neon uses the scorer club's exact canonical
primary accent. Chelsea therefore uses canonical Chelsea blue; Manchester
United uses canonical Manchester United red. A renderer must not choose an
approximate colour, infer one from the stadium, or alter the canonical tone.

## Safety state

This approval records the artwork and its data invariants. It does not enable
outbound dispatch, change Meta credentials, write Production data, run a
Production migration or authorise a Production deployment.
