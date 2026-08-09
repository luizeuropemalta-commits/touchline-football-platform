# 2026-08-09 — Canonical card perimeter trace visual QA

## Purpose

Replace the clipped filter-based card neon with one continuous stroke that
travels through the centre of the approved card perimeter. This is a visual
only change: it must not alter card art, tier rules, market values, prices,
contracts, rankings, roster data, database state, sync behaviour, Preview or
deployment.

## Implemented local candidate

- `components/touchline/cards/TouchlineCardPerimeterTrace.tsx` supplies one
  shared, stroke-only SVG perimeter geometry (`pathLength=100`, `fill="none"`):
  a static base plus one travelling dash follow that same continuous path at
  the outer card surface. It is a sibling of the player artwork and coach
  inner content, both of which intentionally crop their own art.
- `app/globals.css` removes the tier neon `filter`/`drop-shadow` treatment from
  the card surface and frame. The trace has no CSS mask, clip path, fill or
  filter; it uses a static centre-line base and one one-shot dash that ends as
  a soft residual outline.
- The player card derives `--touchline-card-frame-color` from
  `touchlineCardTierPalette(marketTier.key).accent`, falling back only to the
  established neutral public-card accent. The coach card derives the same
  variable from its existing canonical `tierPalette.accent`.
- Player crests use `resolvedClub.accent`; coach crests use the passed
  canonical `clubAccent`. Both receive a discrete fine-pointer hover lift,
  without changing any crest asset.
- The 22 compact moving Arena Live cards retain the static base trace but opt
  out of the travelling layer. This preserves their existing Safari
  anti-flicker paint boundary.
- `prefers-reduced-motion: reduce` explicitly disables the travelling path and
  hover transform while retaining a brighter static base outline. The trace is
  `pointer-events: none`; existing `touch-action: manipulation` remains, so
  pinch zoom is not disabled.

## Local visual fixture

`app/visual-qa/card-neon-trace/page.tsx` is an admin-gated, noindex, static
fixture with one Radiant Gold player and one Radiant Gold coach card. It uses
only local assets and hardcoded synthetic presentation data; ranking,
interaction, profile links, provider access and persisted layouts are all
disabled.

## Validation evidence

### Static and type checks — PASS

- Focused card regression suite: **78 passed, 0 failed**. It includes the new
  trace fixture/contract test, canonical token wiring, no-filter/no-mask trace
  boundary, crest treatment, compact Arena static boundary, pending/contract
  presentation and motion accessibility coverage.
- `pnpm typecheck` — PASS.
- `pnpm lint` — PASS; only the pre-existing Babel size note for
  `app/arena/ArenaClient.tsx` was emitted.
- `git diff --check` — PASS.

### Browser visual QA — PASS

The local fixture was served only on `127.0.0.1:3102` with an empty process
environment: no Supabase, Sportmonks, payment, TouchLine or Vercel variables.
No remote Preview or product route was opened.

| Viewport | Result |
| --- | --- |
| 1280 px desktop | Both player and coach cards rendered one complete octagonal trace. The computed Radiant Gold frame colour was `rgb(255, 216, 94)` (`#ffd85e`); both crest outlines resolved to Manchester City's canonical accent. |
| 768 px tablet | Both trace bounds remained inside their card bounds; page `scrollWidth === clientWidth`. |
| 390 px mobile | Player and coach trace bounds remained inside their card bounds; page `scrollWidth === clientWidth === 390`; no horizontal crop was observed in the viewport and lower-card capture. |

The active player trace advanced through dash offsets from approximately
`-19` to `-63`, `-99` and `-100`, ending at the intended `.28` residual
opacity. The player card geometry remained stable after load/scroll settling;
the trace is non-interactive and did not cover the crest or content.

The browser test surface does not expose an operating-system reduced-motion
emulator. The reduced-motion result is therefore proven by the explicit CSS
branch and focused regression assertions rather than represented as a native
OS-preference screenshot. No system accessibility setting was changed.

## Scope and release boundary

This remains a local-only candidate. No cards, tiers, prices, contracts,
values, rankings, database rows, sync runs, migrations, Preview or deployment
were changed. Generated `next-env.d.ts` and `tsconfig.tsbuildinfo` remain
preserved, uncommitted workspace artifacts.
