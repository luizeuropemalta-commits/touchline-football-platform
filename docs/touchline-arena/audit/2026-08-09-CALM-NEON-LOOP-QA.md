# Calm neon loop QA — 2026-08-09

## Scope

Visual-only local refinement of the existing card, club-crest and Club Owner
portrait perimeter traces. It does not alter any player, club, card artwork,
tier, price, contract, inventory, ranking, database, provider, deployment or
Preview surface.

## Implemented contract

- Player-card and coach-card perimeter traces now run one calm eight-second
  cycle without requiring hover, focus or selection: approximately 1.5 seconds
  of travelling stroke, a soft completed residual perimeter for several
  seconds, then an invisible reset and repeat.
- Club crests now have their own stroke-only circular SVG overlay, rather than
  only a static CSS outline. It uses each card's already-resolved canonical
  club-accent token; it does not derive or change club data.
- The Club Owner portrait uses the matching circular cycle with fixed
  TouchLine-green `#a3ff12`; it never uses a club or tier colour.
- Fine-pointer hover gives card, crest and portrait their discreet existing
  lift. Coarse-pointer `:active` explicitly gives cards/crests and the portrait
  a transient lift without synthetic hover or `touch-action: none`.
- `prefers-reduced-motion: reduce` keeps the illuminated base stroke and
  disables travelling strokes and transforms.

## Compact Arena Live exception

The travelling card and crest layers are explicitly static for the existing
22 moving compact player cards and the two compact live coach cards. Their base
strokes remain visible. This is deliberate: Safari previously re-rasterised a
large group of animated compact layers and caused card flicker. The exception
is local CSS only and does not change Live data or card content.

## Validation

Focused source/fixture regression command:

```sh
node --test --experimental-strip-types \
  tests/touchline-neon-identity-regression.test.mts \
  tests/touchline-club-owner-portrait-neon.test.mts \
  tests/touchline-card-neon-trace-fixture.test.mts \
  tests/touchline-club-owner-portrait-neon-fixture.test.mts
```

Result: **38 passed, 0 failed**.

Additional local validation passed:

- `pnpm typecheck`
- `pnpm lint`
- `git diff --check`

Static local visual fixtures were exercised on loopback only:

- `app/visual-qa/card-neon-trace` at 390 × 844, 768 × 1024 and 1280 × 900;
  player/coach frame and crest traces remained inside their bounds and
  `scrollWidth === innerWidth` at every viewport.
- `app/visual-qa/club-owner-portrait-neon` at the same widths; the circular
  trace stayed inside the avatar bounds and `scrollWidth === innerWidth`.
- Browser style observations proved an `8s`, `infinite` run layer; samples
  observed a travelling dash, the full residual state (`100 0`, opacity `.28`)
  and a later repeated travelling dash.
- Browser console: no errors. The fixtures are static/admin-gated and contain
  no account, API, provider, storage or persistence access.

The local browser surface does not expose operating-system reduced-motion
emulation. Its static counterpart is therefore verified by the explicit CSS
branches and source regression tests above, not by changing a system setting.

## Boundary

No database read/write, Sportmonks request, sync, migration, deployment,
remote Preview or payment action was performed.
