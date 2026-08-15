# TouchLine Post-Release Large Module Decomposition

Status: DEFERRED TECHNICAL DEBT — NO REFACTOR AUTHORIZED
Date: 2026-08-13

This plan records boundaries for a later mission. It does not authorize code movement during the current release/product work.

## `app/arena/ArenaClient.tsx`

**Responsibilities today:** Arena bootstrap, authenticated roster/state synchronization, lineup, formation, fixture rail, Market entry points, Quick Sub session UI, card adapters, intro/media behavior and extensive presentation state.

**Coupling risk:** product data authority, browser persistence, server API calls, match projection and rendering share one client module; small UI changes can trigger persistence or match-state regressions.

**Proposed modules:** Arena bootstrap/state authority; roster and lineup projection; fixture/score rail; Quick Sub controller; card presentation adapters; persistence gateway; visual components and responsive layout.

**Stable contracts:** canonical inventory UUID identity; 11/9 matchday partition; no-reentry substitution rule; server-authoritative roster state; explicit demo/QA isolation; current API payload shapes.

**Regression evidence required:** roster sync failure/fallback, no incidental writes, lineup reload, fixture view isolation, multi-step Quick Sub, 390/768/1280/1440 visual matrix, keyboard/touch/reduced-motion, authenticated route smoke.

## `components/touchline/club-owner/ClubOwnerProfileRenderer.tsx`

**Responsibilities today:** public/private ClubOwner identity, owner portrait/profile, club direction, squad/coach presentation, ranking/social actions, responsive field and card zoom surfaces.

**Coupling risk:** authorization-dependent data, profile presentation, cards and field layout are intertwined, making public/private leakage and mobile layout regressions expensive to review.

**Proposed modules:** identity/header; authorization-aware private panels; squad/technical area; ranking/social surfaces; pitch layout; shared card/zoom adapters.

**Stable contracts:** public/private field separation; owner/club canonical identity; no internal editorial notes in public DTOs; existing profile routes and EN/PT copy.

**Regression evidence required:** public vs owner vs admin access matrix, no PII leakage, owner portrait trace, long-name layout, field/card positioning, 390/768/1280/1440 visual matrix, keyboard/touch accessibility.

## `components/touchline/cards/TouchlineEliteExactCard.tsx`

**Responsibilities today:** shared player-card rendering, tier frame/neon, crest trace, compact/zoom modes, localization, statistics, accessibility, ranking/social integrations and layout compatibility.

**Coupling risk:** the most widely reused visual component can change ClubHub, Arena, Market, ClubOwner, player profiles and QA fixtures simultaneously; visual tier and commercial/publication authority must never be conflated.

**Proposed modules:** canonical presentation resolver; frame/neon renderer; identity/shirt surface; statistics surface; compact layout; zoom adapter; accessibility/interaction controller; optional ranking/social integrations.

**Stable contracts:** published editorial/contract authority, canonical tier palette, club-colored crest, EN/PT labels, pinch zoom, safe zones, no invented values/tiers/prices, fail-neutral unpublished state.

**Regression evidence required:** every tier and neutral state, 20-club assets, compact/zoom, long names, safe zones, neon pause/restart and reduced motion, keyboard/touch/pinch, public publication boundaries, 390/768/1280/1440 screenshots.

## Execution rule

Decompose one module at a time after the current release is stable. Preserve behavior with characterization tests first, use small reversible extractions, obtain an independent diff review, and run all product release gates before merging.
