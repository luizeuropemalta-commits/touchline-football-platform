# Automatic social module registry

Status: **architecture contract; local QA candidates only**
External dispatch: **disabled**

The complete local readiness matrix and visual review routes are recorded in
[Candidate readiness 039–046](CANDIDATE_READINESS_039_046.md). No module `038`
is registered in the current social architecture.

The common engine owns immutable publication identity, content-addressed media,
SHA-256 checksums, semantic revision, British-English copy, executor fencing and
Admin health. It does not weaken the sport-specific source gate of any content
type. A module may generate only a `DRAFT` until the matching approval contract
is active.

## Frozen foundations

| Module | Responsibility | State |
|---|---|---|
| 039 | Private Storage, immutable draft, separate artwork/caption approval and outbox contract | Shared-QA authority; outbound disabled |
| 040 | Durable `OFFICIAL_LINEUP` discovery/queue/runner | Frozen local candidate; later modules must not edit it |

## Additive modules

| Module | Content types | Eligibility boundary | Format |
|---|---|---|---|
| 041 | `MATCH_PREVIEW` plus shared typed registry/framework | Canonical future fixture, current competition/season, venue/Gameweek/kick-off, current official table and one best published card per club from the same active ranking snapshot | Feed 1080×1350 |
| 042 | `FULL_TIME`, `FINAL_SCORE_STORY` | Canonical `FINISHED`, score reconciled to accepted goal events, final Match Rating and published Top Match Card | Feed 1080×1350; Story 1080×1920 |
| 043 | `GOAL_CONFIRMED`, `HAT_TRICK_HERO`, `RED_CARD_CONFIRMED` | Current fixture plus confirmed, non-pending event revision; Hat-trick requires three accepted goals by the same player and red card requires canonical dismissal state | Feed 1080×1350 and separately versioned Story where specified |
| 044 | `GAMEWEEK_RANKING_PREVIEW`, `GAMEWEEK_RANKING_FINAL`, `PLAYER_DUEL`, `GAMEWEEK_HERO`, `TOP_PERFORMER` | One current audited ranking/settlement revision; `FINAL` only after every scoreable fixture and settlement is final | Feed 1080×1350, with separately versioned Story only when specified |
| 045 | Club Social Feed/Timeline fan-out | Only approved/published canonical artefacts; exact club references and one shared factual checksum | First-party bounded feed; no media-byte duplication |
| 046 | Template approval and automatic-delivery policy | OWNER approves the first art and base copy of an exact template version; later items still pass every dynamic-data gate | No outbound until a separate Meta operational approval |

## Module 042 visual approval

The `FULL_TIME` Feed artwork `touchline-full-time-feed-v1` received OWNER visual
approval on 2 September 2026. The locked visual checksum is
`sha256:22adfd36e36a669af67202def3432c75b16e2a4c66f2d71095ed2d006d6fb325`.
This approves artwork only: base-copy/caption approval, runtime activation,
shared-QA migration and every external destination remain separately gated.
After canonical `FINISHED` and score/event/rating reconciliation, the same
approved revision targets both fixture ClubHubs through module 045 before the
separate social-delivery gate. No surface rebuilds the football facts.

## Module 043 Hat-trick classification and visual approval

The OWNER classifies `HAT_TRICK_HERO` as a 043 confirmed-goal event, not as a
044 ranking publication. Its 1080×1350 artwork received visual approval on
2 September 2026 and is locked by
`sha256:17a6f218fa7e007dbebe0473ae95d408e5518532c0ad7c9fd5e3e9c7a35a9e2d`.
The current local candidate still uses the 044 ranking-family reader, which is
a documented transitional mismatch rather than an activation claim. A
separately reviewed forward migration must move its source/trigger contract to
043. Shared QA, Production and outbound remain fail-closed meanwhile.

Module 045 now has a **local-only candidate awaiting independent second audit**:
one approved 039–044 DRAFT becomes one first-party post, while immutable club
references perform the fan-out without copying media bytes. Public reads are
server-only, cursor-bounded to at most 12 items, and exclude DRAFT,
`REVIEW_REQUIRED`, stale and expired content. Active posts expire after exactly
14 days and leave only the approved minimal non-content tombstone. Comments and
reactions remain disabled. This state does not authorise a migration, scheduler,
shared-QA write or deployment.

Each module receives its own forward migration, rollback, branch/worktree, local
commit, deterministic tests, fresh shadow run, threat/security review and second
audit. A PASS for one module does not authorise the next module or any remote
action.

## Shared identity

Every candidate is keyed by `contentType + fixture/gameweek scope + placement +
locale + templateVersion + sourceVersion + semantic revision`. Final exported
bytes are stored under a content-addressed key and hashed independently from the
manifest and caption. A source, art, copy, template or checksum change invalidates
the matching approval and creates a new immutable revision.

Observation-only timestamps remain in the audit chronology but are excluded
from the semantic generation checksum. A refresh that changes only
`sourceSnapshotAt` or `tableAsOf` must reuse the existing generation identity;
any rendered football fact, ranking, card or fixture change must create a new
identity.

Fixture-level formats use `teamId = null`; team-specific OFFICIAL LINE-UP remains
one draft per fixture and team. Gameweek formats use a typed Gameweek scope and
may not masquerade as a fixture identifier.

## Fail-closed module isolation

- MATCH PREVIEW never reads or displays XI, bench or formation.
- OFFICIAL LINE-UP never uses a preview ranking to fill a missing player.
- FULL TIME and event formats never infer a scorer, assist, card or minute.
- Ranking and hero formats never use Match Rating as Total Rating or vice versa.
- No module may use an unpublished card, ambiguous club membership, stale source
  revision, incomplete ranking, mutable media object or unauthorised copy edit.
- No public wording exposes a provider, API, token, internal table or pipeline.
- No module contains Meta/Instagram credentials or outbound code.

## Module 041 pilot

The first acceptance fixture is `19722192`, Aston Villa (`15`) v Arsenal (`19`),
31 August 2026 at 20:00 Europe/Malta, Villa Park, Premier League Gameweek 2.
The reader resolves both club leaders from the same active QA ranking by
canonical membership and the documented ranking comparator after filtering for
eligible published cards. It cannot accept a caller-supplied player override.
Its fixture lookup is exact rather than a bounded season scan (a 380-fixture
season cannot hide the pilot), and `firstObservedAt` is the canonical fixture
candidate's first actual scheduler observation inside the eligible preview
window, preserved by the first idempotent job enqueue and re-read from that job
by the generator rather than inferred from a latest-sync timestamp. Admin receives
Feed artwork and British-English caption as separately approvable checksums
while module 041 is audited. Provider fixture identity remains internal and is
not rendered in artwork or caption.

## Module 046 — local candidate under second audit

This is deliberately separate from the 041 pilot. Its state machine is
`TEMPLATE_APPROVAL_REQUIRED → TEMPLATE_APPROVED → AUTO_PUBLISH_ENABLED`, plus
`PAUSED` and `REVOKED`. The approval identity includes content type, placement,
locale, dimensions, rendered fields, base-copy/lexicon checksum, visual template
checksum and template version. Any change requires new OWNER approval.

Template approval never approves dynamic facts. Every item still needs its
module's current source, identity, publication, checksum, idempotency, quota and
freshness gates. The future delivery layer also requires global and per-content
kill switches, immediate pause, before/after audit, bounded rate protection,
delivery reconciliation and terminal `DELIVERY_UNKNOWN`. No Instagram/Meta
outbound exists or is authorised by this design.

The current local candidate derives the template identity from the checked-in
visual sources, British-English copy source and canonical icon lexicon. OWNER
reviews artwork and copy separately against one approved immutable exemplar.
`AUTO_PUBLISH_ENABLED` can produce only an internal `READY` policy candidate;
the candidate row is not an outbox item and there is no destination adapter.
Pausing/revoking a version or engaging a kill switch atomically blocks its
existing `READY` candidates. Releasing a switch requires a fresh item
re-evaluation before eligibility can return. Shared QA, schedulers and outbound
remain disabled until an independent audit and separate operational authority.
