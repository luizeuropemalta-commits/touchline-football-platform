# Visual standard

## Authenticity

Use only current canonical TouchLine cards, crests, icons, typography, match-centre components and persisted values. Do not redraw, approximate, substitute or infer a branded asset. Public wording is `TouchLine Verified` or `TouchLine Verified Match Data`; never expose internal provider/API wording.

The LINE-UP renderer is [`TouchlineSocialLineupDraft.tsx`](../../../components/touchline/social/TouchlineSocialLineupDraft.tsx), using the shared regulation pitch [`TouchlinePitchSurface.tsx`](../../../components/touchline/pitch/TouchlinePitchSurface.tsx). The current Feed contract is:

- 1080×1350, 4:5;
- regulation field geometry 105×68, portrait orientation, attack upwards;
- exactly 11 upright cards at 0° on official formation coordinates;
- official bench ordered 2+2+2+2+1, ninth card centred;
- technical rail must not compress the pitch;
- current club coach in a separate labelled box;
- zero clipping, overlap, deformation, unreadable names or unsafe margins.

FULL TIME derives from the real TouchLine Live language. The current renderer is [`TouchlineSocialFinalScoreDraft.tsx`](../../../components/touchline/social/TouchlineSocialFinalScoreDraft.tsx): real crests, final score, scorers beneath the respective club, OG/PEN only when persisted, and one Top Match Card by final official Match Rating.

MATCH PREVIEW uses two complete published TouchLine cards at exactly equal size
and visual weight, the two canonical crests, fixture venue, Europe/Malta
kick-off, Premier League Gameweek and verified current table positions. The
background may use the canonical home venue interior. It must not display a
pitch formation, XI, bench or coach before the official team sheet.

### Canonical fixture scoreboard

The owner-approved 041 MATCH_PREVIEW fixture row is the single visual standard
for every social module that shows two competing clubs. The shared renderer is
[`TouchlineSocialFixtureScoreboard.tsx`](../../../components/touchline/social/TouchlineSocialFixtureScoreboard.tsx).
It owns the three-column geometry, crest sizing, club identity, centre alignment
and typography. Pre-match surfaces render `VS`; live and final surfaces render
plain score numerals separated by one centred hyphen (`-`). A module must not
draw an independent score separator or reconstruct the fixture row locally.

The shared card-frame surface over Arena imagery is a dark translucent smoke
glass, never solid black. Its canonical token is
[`social-visual-tokens.ts`](../../../lib/touchlineArena/social-visual-tokens.ts):
the Arena remains perceptible through the combined outer/inner layers, while a
controlled blur and a minimum 4.5:1 pale-text contrast gate preserve card and
copy legibility. Modules that reuse this frame must import the shared token;
fixture-specific opacity overrides are not permitted.

### Mandatory fumê transparency

Every new TouchLine social artwork must preserve the venue photograph as a
clearly visible full-canvas background. A solid or near-opaque enclosing dark
rectangle is not permitted. Layout panels and metric boxes may receive the
canonical fumê surface, always at exactly **40% opacity (60% transparent)**,
using the isolated 044 token in
[`social-ranking-visual-tokens.ts`](../../../lib/touchlineArena/social-ranking-visual-tokens.ts).
The percentage must not vary by
template, club, image or placement. Whole-canvas blur is prohibited; blur is
local to the fumê panels. A canonical player card must appear without an extra
rectangular backing tile; only its surrounding layout and metric boxes use the
fumê. A design review fails if the venue reads as a flat black background.

Rating and points values retain the TouchLine information hierarchy, but their
box geometry may vary by editorial theme so Hat-trick, Duel, Hero, Performer
and Ranking artworks remain visually distinct. Competing-club score rows always reuse the 041
fixture component with canonical crests and plain score numerals (for example,
`2 - 1`); templates must not redraw those elements.

### Hat-trick editorial composition

`HAT_TRICK_HERO` is a dedicated story template, not a recoloured ranking card.
Its locked hierarchy is: compact TouchLine masthead and canonical fixture
scoreboard; oversized two-line `HAT-TRICK HERO` title; player and club identity;
the three confirmed scoring moments; official Match Rating and Total Rating
boxes; current Gameweek rank; the official fixture venue; one enlarged unboxed
canonical player card; and a clear provisional/final Gameweek note. The card
occupies the right-hand hero column and the editorial facts occupy the left.
The venue name and image must resolve from the canonical fixture venue (not an
assumed home ground), remain bound into the render-source checksum and stay
visible through the fixed 40% fumê. Goal minutes and event kinds must come from
confirmed persisted fixture events; they must never be invented to complete
the composition.
The canonical card inside this artwork remains connected to the audited
Sportmonks card catalogue: Total Rating, Match Rating, goals, assists,
defensive score, clean sheets and discipline facts render when the verified
snapshot supplies them, while genuinely absent provider values remain an
explicit em dash.

## Synthetic visual QA

Synthetic geometry evidence must use [`TouchlineSocialLineupGeometryQa.tsx`](../../../components/touchline/social/TouchlineSocialLineupGeometryQa.tsx) and [`createTouchlineGeometryQaFixture`](../../../lib/touchlineArena/social-lineup-presentation-policy.ts). It must visibly say:

- `GEOMETRY QA`;
- `SYNTHETIC FIXTURE · NOT PUBLISHABLE`;
- synthetic fixture/team IDs;
- placeholder players only.

It must not use a real club name, crest, player card, fixture ID or `LINE-UP CONFIRMED`. The official renderer rejects synthetic identity before rendering.

## Template versioning

Any change to layout, size, typography, visual hierarchy or semantic content requires a new template version and new owner approval. Only fixture-bound data fields may change within one locked version.
