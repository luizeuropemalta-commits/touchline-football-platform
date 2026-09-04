# 043 Hat-trick owner art approval

Status: **OWNER-APPROVED VISUAL REVISION 4 — LOCAL SOURCE ONLY**

Approved by: Luiz Lopez

Approved on: 2 September 2026; revisions 3 and 4 approved 3 September 2026 (Europe/Malta)

Approval revision: **4 — byte-locked active 043 artwork plus preserved historical evidence**

Content type: `HAT_TRICK_HERO`

Approved evidence route: `/visual-qa/social-ranking-catalogue?focus=hat-trick-hero`

043 integration review route: `/visual-qa/social-confirmed-event?design=hat-trick`

Approved placement candidate: Feed / ClubHub / ClubOwner Timeline, 1080×1350 (4:5)

## 043 shared-title revision

- The active 043 preview removes the generic `HERO` suffix and presents one
  `HAT-TRICK` title in the same points yellow (`#f6d45f`) used by the approved
  Goal-family artwork. As the primary message, it uses an `82px`, maximum-weight
  treatment; the green player achievement line is enlarged to `17px` while
  remaining visually subordinate.
- On the website, its letters use the same sequential zoom cycle as Goal. A
  static export and reduced-motion mode always show the complete word.
- Luiz approved this active 043 revision on 3 September 2026 after the glyph
  colour was locked directly on every letter for consistent browser rendering.
  It does not overwrite the separately byte-locked original evidence.

## Revision 4 legibility approval

- The TouchLine Points result is now the dominant numeric fact in its panel:
  `52px`, points yellow, high contrast, with a secondary `TOUCHLINE POINTS`
  label. The panel no longer repeats `OFFICIAL MATCH RATING`.
- The frozen Hat-trick replay derives `+12` from its persisted `10.00` rating
  through the existing `player_scoring_v3` rule. A missing settlement is shown
  as awaiting official calculation, never as an invented `0`.
- The canonical club crest now precedes the player name. Long player names grow
  away from the crest and may balance across lines without covering it.
- Essential labels are enlarged for mobile-feed reading.
- Luiz approved this revision after the points hierarchy, crest-first player
  identity and mobile legibility corrections. It replaces revision 3 as the
  active local visual while preserving revision 3 as historical evidence.
  Outbound remains disabled.

## Owner classification decision

Hat-trick is a **043 confirmed-goal event**. It is triggered only after the
third accepted goal attributed to the same player in the same canonical
fixture revision. The intended 043 family is:

- `GOAL_CONFIRMED`, including confirmed penalty and own-goal presentation
  semantics;
- `HAT_TRICK_HERO`, after three individually verified goal events;
- `RED_CARD_CONFIRMED`, retained as a separate 043 event design.

Module 044 remains the family for Gameweek ranking preview/final, player duel,
Gameweek hero and top performer. The additive local migration candidate 047 now
moves Hat-trick source, trigger, event identity and approval routing into 043,
and blocks new Hat-trick jobs in 044. This candidate has not been applied to
shared QA or Production; outbound remains fail-closed.

## Locked visual decisions

- Compact TouchLine masthead and the shared 041 fixture scoreboard.
- Both 80 px club crests are aligned at equal distance from the score; score,
  minute and masthead copy are enlarged for mobile legibility.
- Plain score numerals, one short centred hyphen, and `FULL TIME` only.
- The byte-locked original evidence contains `HAT-TRICK HERO`; the active 043
  title revision contains only yellow `HAT-TRICK`, followed by the verified
  player identity and three confirmed goal moments.
- Official Match Rating, Total Rating and one dominant TouchLine Points result.
- Canonical fixture venue name and verified home-stadium image beneath the
  trophy.
- Enlarged upright card without an enclosing card box. Market value, ratings
  and card statistics render only when supplied by the audited source.
- The card perimeter uses the card tier colour; the active 043 artwork uses a
  thin travelling perimeter trace in the scorer club's exact primary accent.
- The website hover is a contained `1.006` scale. Static social exports do not
  include hover or motion.
- The 043 website renderer animates the title letter by letter with the same
  zoom sequence used by Goal. Reduced-motion mode and every static social
  export render the complete yellow `HAT-TRICK` title.
- The 043 renderer's thin travelling perimeter neon inherits the scorer club's
  exact canonical primary accent. It never approximates or changes that tone.
- The established TouchLine smoke/fume treatment remains at 40% opacity.

## Immutable visual manifests

Revision 4 active owner-approved source checksum:
`sha256:35439440aee10bdb05fc968c31d978445c1eac7f41e045dbcc1de12f3fa41760`

Runtime visual template checksum:
`sha256:d2e1091432d6bcd26601b6338b25c4b3260cc3da9aac0a0dc5d99d6bb927f60a`

Runtime template identity checksum:
`sha256:a3506d1996740589416954038db22632d6d42b01b829cec447d972e1ab80103b`

| Revision 4 active visual source | SHA-256 |
|---|---|
| `components/touchline/social/TouchlineSocialGoalHatLayoutDemo.tsx` | `5407eb29ac9a6867177b382dbece7130ccf97c16a967650331ec0ebc86ee68b8` |
| `components/touchline/social/TouchlineSocialGoalHatLayoutDemo.module.css` | `6e837026b16f445343e17fbf5064730fceb8f377bb8eae14ccea650e0bc7c845` |

Revision 3 approved historical checksum:

`sha256:5caf3cecb9783b42dca98452205aaae5d32c382833c9f49b4136da7b377440bc`

| Active 043 visual source | SHA-256 |
|---|---|
| `components/touchline/social/TouchlineSocialGoalHatLayoutDemo.tsx` | `eab895827330eb4491804d5e55646e379c6836e12ffe1e9809e740506f5a03f5` |
| `components/touchline/social/TouchlineSocialGoalHatLayoutDemo.module.css` | `3d796c3c0416ad8768587f2a9186d69529ad492ec2eddb12f2ec3d0485d61c70` |

Preserved original artwork combined visual checksum:

`sha256:a0bc151bfbe5348e204bac32ad2893e27490d8c0dace7d1d82953d6b01a0ef38`

| Visual source | SHA-256 |
|---|---|
| `components/touchline/social/TouchlineSocialRankingDraft.tsx` | `8bf06f57e9c94ab30303eb799e0db43709844270c0cc2249de8eddef8ce2252f` |
| `components/touchline/social/TouchlineSocialRankingDraft.module.css` | `62e76dd7cb22e6099bdd7e7f8fe9d13822ca0f86746d9d471f5323ca6d78cd2e` |
| `components/touchline/social/TouchlineSocialFixtureScoreboard.tsx` | `09e36f2e203fef2103a08d3fa482942f192ba193b6722e8eddcbc6240921f4e2` |
| `components/touchline/social/TouchlineSocialFixtureScoreboard.module.css` | `b03c09fde61c9433098c21aa10b980dbf70757ed7f0f87d76c2cd3fb500f680c` |
| `components/touchline/cards/TouchlineEliteExactCard.tsx` | `6cb7a2565e02f5ef18e089ede11d9fc682745a14eeb6587fbeb3e01fb8a55f9f` |
| `components/touchline/cards/TouchlineCardPerimeterTrace.tsx` | `eac6e8b7fb59a021e205bcaf221fbf7d0b4a6f537e5e2d42304453c98e5d14a2` |
| `public/touchlineArena/card-layouts/master-shirt-back-layout.json` | `7b1b432152001e3728eb967ba9d4cdb31c6b78b4c49e54787e83d6a9529e292f` |
| `lib/touchlineArena/social-ranking-visual-tokens.ts` | `e04103f74777689205b395ed9124246253a8ce19ac2e7f237d0360243d7a27d8` |
| `lib/touchlineArena/social-visual-tokens.ts` | `354442783ed145e90643b18f03ad3af3f22a747eb877245c0cb421214f1cd3ce` |
| `public/touchlineArena/trophies/touchline-england-league-trophy-lion-cup-candidate-v4-text.png` | `2ae6490be56d63b62523bdbf6eebb5889d906ec6e8de1724f57c985b9bdd372f` |
| `public/touchlineArena/brand/tl-shield-lime.svg` | `37522f0bfcab553f08df45300e22724af0292b7f620046c71c75ee91cb10fc3d` |

The executable owner-lock test recomputes every file checksum and the combined
manifest checksum. Any visual-source change breaks the lock and requires a new
OWNER review.

## Canonical data invariants

SportMonks facts first enter the canonical TouchLine fixture, event,
settlement, card and ranking revisions. The renderer must never read provider
payloads directly and must never invent a goal, minute, player, rating, rank,
market value, stadium or statistic. The third-goal condition requires exactly
three accepted, non-pending and non-rescinded goals for the same player. Every
rendered fact remains bound to the semantic source checksum.

## Safety state

This approval locks artwork only. It does not authorise the 043 migration,
shared-QA activation, database writes, deployment, caption approval, Meta
credentials or Instagram/Facebook delivery. The local sample remains
`LOCAL_NON_PUBLISHABLE_VISUAL_QA`.
