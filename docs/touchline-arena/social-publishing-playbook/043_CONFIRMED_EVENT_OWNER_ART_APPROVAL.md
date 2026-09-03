# 043 confirmed-event owner art approval

Status: **SUPERSEDED OWNER-APPROVED REVISION — RETAINED AS AUDIT EVIDENCE**

Approved on: 2 September 2026

Approved route: `/visual-qa/social-confirmed-event?design=goal`

Approved placement candidate: Feed, 1080×1350

This older Goal revision remains in history, but the active owner-approved Goal
artwork is `043_GOAL_HAT_LAYOUT_OWNER_ART_APPROVAL.md`. Operational generation
must use `touchline-goal-event-feed-v1`; it must not silently fall back to this
older composition.

## Locked visual decisions

- `GOAL CONFIRMED` remains in the TouchLine masthead.
- `GOALLLLLLL` is the primary event headline.
- The scorer card is the single hero card and remains upright.
- Player name and club remain directly associated with the card.
- Total Rating, official Match Rating and TouchLine Points sit beneath the card.
- The confrontation keeps both canonical club crests.
- Event crests are 20% larger than the preceding 043 review candidate.
- The score uses the shared 041 fixture-scoreboard geometry and one centred
  plain hyphen (`-`); 043 must not draw its own separator.
- Website presentation may animate the goal-card emphasis. Exported social PNG
  remains static and disables animation.

## Canonical scoring statement

SportMonks supplies the official match rating. TouchLine owns the versioned
rule that converts that rating into TouchLine Points. Under
`player_scoring_v3`, goals do not receive an independent fixed points award.
For the approved local sample, a Match Rating of 8.14 maps to +5 TouchLine
Points. This does **not** mean that every goal is worth five points.

## Safety state

This approval records the visual candidate only. The local sample remains
`LOCAL_NON_PUBLISHABLE_VISUAL_QA`; outbound delivery, Production publication
and remote database writes remain disabled until the canonical release gates
are separately satisfied.
