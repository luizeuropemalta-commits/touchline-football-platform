# Club Owner portrait perimeter trace — local visual QA

**Date:** 2026-08-09
**Status:** LOCAL COMPLETE / NOT DEPLOYED
**Scope:** visual-only Club Owner portrait treatment

## Purpose

Replace the live Club Owner avatar's clipped green `box-shadow`/hover filter
with one circular, continuous centre-line perimeter trace in fixed TouchLine
logo green (`#a3ff12`). The portrait image, owner identity, ownership data,
contracts, economy, cards and layout remain unchanged.

## Implementation evidence

- `components/touchline/social/ClubOwnerPortraitPerimeterTrace.tsx` contains
  the decorative circle only: two stroke-only circular paths with
  `pathLength="100"`, `fill="none"`, `aria-hidden`, `focusable="false"` and no
  input for club or tier colour.
- `components/touchline/social/TouchlineSocial.tsx` exposes an opt-in
  `clubOwnerPortraitTrace`; only
  `components/touchline/club-owner/ClubOwnerProfileRenderer.tsx` enables it,
  alongside the existing `CLUB_OWNER_TOUCHLINE_NEON = "#a3ff12"`.
- The photo remains in `.socialAvatarPhoto` with the circular crop. The SVG
  is a sibling in the visible outer avatar surface, so the perimeter is not
  clipped by the image crop. The path stays inside the avatar bounds, which
  also avoids clipping by the surrounding social header at compact widths.
- The trace uses the card trace's temporal contract exactly: 1500ms
  `cubic-bezier(.22,.74,.28,1)`, a travelling dash, then the same soft
  residual phase. It is fixed TouchLine green, never club or card-tier
  colour.
- Fine-pointer hover gives the portrait a small `translateY(-2px)` lift.
  Coarse-pointer `:active` gets the same transient lift/trace without
  synthetic hover or `preventDefault`. No `touch-action` override is added,
  and the SVG is `pointer-events: none`.
- `prefers-reduced-motion` leaves the static lit perimeter, disables trace
  animation and forces no avatar transform. The existing card/crest rules
  already provide fine-pointer crest lift, coarse-pointer selected-card lift
  and reduced-motion transforms-off; they were validated rather than
  duplicated here.

## Static visual fixture

`app/visual-qa/club-owner-portrait-neon/page.tsx` is an admin-gated, noindex,
local-only fixture. It contains one local avatar asset and static labels only;
it has no account, roster, provider, API, storage, market, contract or
persistence dependency. `portraitTraceActive` exists only to make the
decorative travel observable during local QA.

## Local visual checks

The fixture was run on `127.0.0.1` with an empty application environment. No
database, provider, sync, Preview or deployment request was used.

| Viewport | Result |
| --- | --- |
| 390 × 844 | PASS — `scrollWidth === clientWidth === 390`; 92px portrait and trace bounds match; no horizontal overflow or crop. |
| 768 × 1024 | PASS — `scrollWidth === clientWidth === 768`; avatar and trace bounds match at 190px, all fixture sections remain within 30.7–737.3px. |
| 1280 × 900 | PASS — `scrollWidth === clientWidth === 1280`; header, fixture and note stay within 100–1180px. |

Browser inspection also recorded the trace as pointer-inert with
`overflow: visible`, fixed computed stroke `rgb(163, 255, 18)`, and a running
dash whose computed dash offset advanced between samples. The local browser
surface has no OS media-emulation capability; the reduced-motion behaviour is
covered by explicit source regression assertions rather than changing a
system accessibility setting.

## Validation

- Focused portrait/card visual regression suite: **35/35 passed**.
- Final TypeScript, lint and diff checks are recorded with the checkpoint.

## Boundaries

No asset was replaced, moved or deleted. No values, tiers, prices, contracts,
ranking, identity, database, migration, provider sync, Preview or deployment
changed. This report is evidence for the local visual checkpoint only.
