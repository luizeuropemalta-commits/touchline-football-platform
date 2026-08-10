# ClubHub crest perimeter trace

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Give each ClubHub crest the same calm, centre-line perimeter treatment as the
shared card crests without inventing club identity, tier, economic data or a
provider-derived visual.

## Local correction

- Added `ClubHubCrestTrace`, a presentational wrapper around the existing
  shared `TouchlineClubCrestPerimeterTrace` SVG.
- Applied it to the ClubHub directory's 20 canonical club crests, the profile
  hero crest and both canonical crests in Next Match.
- The trace takes its colour only from the canonical local club registry. A
  fixture opponent without a resolved canonical identity still has no crest,
  no trace and no invented accent.
- The trace remains entirely inside its square/circular host. It is stroke
  only, decorative (`pointer-events: none`) and uses no mask, clip-path or
  trace filter. The visible logo stays below the trace, so the moving line
  never crosses the crest art.
- Fine pointer interaction provides a small lift; coarse pointer interaction
  provides a short active lift. `prefers-reduced-motion` disables transforms
  and keeps the existing illuminated static outline.

## Boundaries preserved

- No card tier, price, value, contract, ranking, club data, fixture data,
  provider, database, sync, credential, migration or deployment setting was
  changed.
- The component accepts a concrete canonical logo URL and accent from its
  caller. It cannot create a logo or colour for an unknown opponent.

## Validation

- Focused resolver and crest-trace tests: **4/4 passed**.
- Full local suite: **841/841 passed**.
- Strict TypeScript, ESLint, Webpack production build and `git diff --check`
  passed.
- Local browser observation at **1280 × 720**:
  - the directory rendered 20 trace hosts / 20 calm 8-second crest loops;
    document width equalled viewport width;
  - the Manchester City profile hero and known home crest rendered their
    perimeter trace outside the crest art; the unknown opponent stayed in the
    explicit pending state without a logo or trace;
  - no horizontal overflow or cropped trace was observed.
- The CSS mobile/tablet layout retains square hosts at 390px/768px; native
  phone/tablet/Safari observations remain external device QA gates and are not
  claimed as completed here.

## Evidence

- `components/touchline/ClubHubCrestTrace.tsx`
- `components/touchline/cards/TouchlineClubCrestPerimeterTrace.tsx`
- `app/touchline-clubs/page.tsx`
- `app/touchline-clubs/[club]/page.tsx`
- `lib/touchlineArena/club-match-preview.ts`
- `tests/touchline-clubhub-crest-trace.test.mts`
- `tests/touchline-club-match-preview.test.mts`
