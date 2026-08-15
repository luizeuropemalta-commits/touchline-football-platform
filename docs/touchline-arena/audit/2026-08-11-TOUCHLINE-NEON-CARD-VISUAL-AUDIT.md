# TouchLine Neon/Card Visual Audit — 2026-08-11

## Status

**TECHNICAL CONTRACT PASS / BROWSER MATRIX STILL REQUIRED BEFORE DEPLOYMENT**

The reusable player and coach cards use one stroke-only SVG perimeter trace:

- the octagonal path follows the card frame rather than a generic rectangle;
- the trace lives above the artwork but outside cropped inner containers;
- colour comes from the canonical tier palette;
- the crest uses its own canonical club-accent circular trace;
- run cycle is 8 seconds with a residual pause, not a hover-only flash;
- reduced motion keeps a static illuminated edge and no transform animation;
- Arena compact live cards retain their existing animation kill-switch.

## Correction in this block

The legacy broad pending selector could desaturate any card frame. It is now
restricted to a genuinely neutral card:

```css
[data-card-tier="neutral"][data-card-classification="pending"]
```

Therefore a card that already carries a published editorial tier or a frozen
active-contract tier retains its canonical coloured frame/neon even if an old
generic pending flag reaches the surface. A genuinely unresolved card remains
honest and quiet; it does not receive a fabricated tier.

## 20-club asset proof

`tests/touchline-twenty-club-card-assets.test.mts` checked all 20 official
clubs × all 7 tiers:

- full frame PNG;
- compact WebP frame;
- zoom WebP frame;
- canonical crest asset;
- seven canonical accent/secondary palettes.

Result: **2/2 passed**.

## Remaining release gate

This is not a claim of a full device visual approval. Before deployment the
candidate still requires real-browser observation at 390×844, 430×932,
844×390, 768×1024, 1440×900 and 1920×1080, with a WebKit device/browser gate
recorded separately. No deployment occurred in this audit.
