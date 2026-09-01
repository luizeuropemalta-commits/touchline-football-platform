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

The shared card-frame surface over Arena imagery is a dark translucent smoke
glass, never solid black. Its canonical token is
[`social-visual-tokens.ts`](../../../lib/touchlineArena/social-visual-tokens.ts):
the Arena remains perceptible through the combined outer/inner layers, while a
controlled blur and a minimum 4.5:1 pale-text contrast gate preserve card and
copy legibility. Modules that reuse this frame must import the shared token;
fixture-specific opacity overrides are not permitted.

## Synthetic visual QA

Synthetic geometry evidence must use [`TouchlineSocialLineupGeometryQa.tsx`](../../../components/touchline/social/TouchlineSocialLineupGeometryQa.tsx) and [`createTouchlineGeometryQaFixture`](../../../lib/touchlineArena/social-lineup-presentation-policy.ts). It must visibly say:

- `GEOMETRY QA`;
- `SYNTHETIC FIXTURE · NOT PUBLISHABLE`;
- synthetic fixture/team IDs;
- placeholder players only.

It must not use a real club name, crest, player card, fixture ID or `LINE-UP CONFIRMED`. The official renderer rejects synthetic identity before rendering.

## Template versioning

Any change to layout, size, typography, visual hierarchy or semantic content requires a new template version and new owner approval. Only fixture-bound data fields may change within one locked version.
