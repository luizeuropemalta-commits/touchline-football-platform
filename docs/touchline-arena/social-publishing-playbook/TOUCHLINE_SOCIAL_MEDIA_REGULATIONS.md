# TouchLine Social Media Regulations

Status: **canonical product regulation; implementation remains modular and gated**
Authority: **Luiz Lopez, TouchLine product owner**
Effective record: **2026-08-31, Europe/Malta**
External dispatch: **disabled until a separately audited operational authorisation**

## Purpose and Central TouchLine principle

This regulation defines which verified football events may become TouchLine
content, where each item may appear, and which gate must fail closed when the
source is incomplete. A single Central TouchLine pipeline receives, persists and
reconciles the official event. One versioned canonical DTO then supplies the
ClubHub, Club Social Feed, mobile/push alert and Instagram generator. Those
surfaces must never maintain independent factual pipelines that can disagree.

Internal first-party surfaces update before social delivery. An image is never
the ClubHub source: native ClubHub components consume the same canonical DTO.
Every fan-out is idempotent, revision-bound and observable.

### Operational upstream synchronisation

“Total synchronisation” means following the upstream football feed closely while
keeping Central TouchLine as the only public authority:

`upstream observation → internal raw/audit persistence → TouchLine validation
and reconciliation → canonical revision → scoring/projections → ClubHub / Live /
push / social DRAFT / outbox`

No public consumer reads or composes directly from the upstream provider.
Provider player, fixture, team, season and competition IDs remain internal
identity/fence fields. Incomplete or contradictory observations enter
`REVIEW_REQUIRED`; lineup, goal, red-card and final events propagate only after
their content-specific gate passes. Public source language is always
“TouchLine Verified”, never a provider, API or pipeline name.

Each canonical event owns one `sourceRevision` and factual checksum. Every
destination references that exact identity rather than rebuilding facts. A
source change during rendering, approval or delivery supersedes the old DRAFT,
creates a new immutable revision and invalidates stale approval. Integration
tests for every numbered module must exercise source-change races, fan-out
duplication, missing destinations, stale approval and current-revision
revalidation before delivery.

## Canonical catalogue

`Feed` means 1080×1350. `Story` means 1080×1920. Every item uses British
English, the [canonical icon lexicon](CANONICAL_SOCIAL_ICON_LEXICON.md), exact
TouchLine cards/assets and no public provider/API/pipeline wording.

| # | contentType | Trigger | Fail-closed requirements | Format | Destinations | Audience | Priority |
|---:|---|---|---|---|---|---|---|
| 1 | `MATCH_PREVIEW` | Configurable T-24h/véspera window | Canonical future fixture; current season/competition; kick-off Europe/Malta; venue; Gameweek; current table; one highest eligible published card per club from one active ranking snapshot; **no XI** | Feed | Instagram global | Global football audience | P0 Matchday |
| 2 | `OFFICIAL_LINEUP` | Immediately after the stable official team sheet arrives, normally around T-30 | Exact fixture/team/season; 11 unique XI with formation positions 1..11; exactly 9 official substitutes; all 20 canonical cards valid; official identity and revision stable; no predicted or partial line-up | Feed plus native DTO | ClubHub/confronto, Club Social Feed, configured push, Instagram global | Both clubs, opted-in followers, global audience | P0 Matchday |
| 3 | `PLAYER_RANKING_RACE_PREMATCH` | Before the first scoreable fixture of the Gameweek | One current, complete player-ranking snapshot; canonical Top 3; once per Gameweek, not per fixture | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Matchday |
| 4 | `COACH_RANKING_RACE_PREMATCH` | Before the first scoreable fixture of the Gameweek | One current coach snapshot; canonical Top 3; coach scoring version verified; once per Gameweek | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Matchday |
| 5 | `GOAL_CONFIRMED` | After the goal is confirmed and debounce/reconciliation completes | Canonical current fixture/event revision; scorer/minute/score verified; not pending, VAR-disallowed or inferred; card and live Total Rating current | Story | Instagram Story; optional preference-based push; Match Thread/Club Social Feed | Relevant clubs and opted-in users | P0 Matchday |
| 6 | `RED_CARD_CONFIRMED` | Immediately after confirmed dismissal | Canonical red-card event, player, minute and current score; never pending/inferred | Story | Instagram Story; optional preference-based push; Match Thread/Club Social Feed | Relevant clubs and opted-in users | P0 Matchday |
| 7 | `FULL_TIME` | After `FINISHED` and short configurable reconciliation window | Score equals accepted goal events; scorers/minutes reconciled; player/coach scoring final; current Top Match Card available; no provisional residue | Feed plus native DTO | Both Club Social Feeds, confrontation feed/Match Thread, Instagram global | Both clubs and global audience | P0 Matchday |
| 8 | `CLUB_TOP_CARD` | After the fixture is final and scoring reconciled | Highest final eligible card **for each club**, from fixture settlement; Match Rating and Total Rating remain distinct | First-party club post; selected Feed only | Club Social Feed; optional curated Instagram global | One club; curated global audience | P0 Matchday |
| 9 | `LEAGUE_TABLE_PREVIEW` | Before the first scoreable fixture of the Gameweek | Current complete canonical table snapshot and Gameweek identity | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Gameweek |
| 10 | `LEAGUE_TABLE_FINAL` | After the last scoreable fixture is final | All Gameweek fixtures `FINISHED`; table snapshot consolidated; no missing result | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Gameweek |
| 11 | `PLAYER_RANKING_FINAL` | After Gameweek consolidation | All scoreable player settlements final; one complete ranking snapshot; Top 3 and gaps derived canonically | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Gameweek |
| 12 | `COACH_RANKING_FINAL` | After Gameweek consolidation | All scoreable coach settlements final under the canonical home/away rule; one complete snapshot | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Gameweek |
| 13 | `TEAM_OF_THE_GAMEWEEK` | After Gameweek consolidation | Canonical positional eligibility, formation and tie-break rules exist; exactly 11 eligible cards; all settlements final | Feed | Instagram global; eligible global first-party surfaces | Global audience | P0 Gameweek |
| 14 | `GAMEWEEK_HERO` / `TOP_PERFORMER` / `HAT_TRICK_HERO` | Confirmed final achievement | Event/settlement/ranking evidence final; canonical card published; provisional leader labelled when the Gameweek is still open | Feed; separately versioned Story only when enabled | Instagram global; relevant Club Social Feed | Global and relevant club audience | P0 Gameweek |
| 15 | `PLAYER_DUEL` | Configurable pre-match window | One highest eligible current Total Rating card per club from the same active ranking snapshot; equal visual weight; exact fixture | Feed | Instagram global | Match audience | P1 Engagement |
| 16 | `MATCHDAY_SCHEDULE` | Configurable day/Gameweek planning window | Complete bounded official schedule, timezone and status; no inferred fixture | Feed/Story by approved version | Instagram global; eligible first-party schedule surface | Global audience | P1 Engagement |
| 17 | `GAMEWEEK_DEADLINE` / `MARKET_OPEN` / `MARKET_CLOSING` | Canonical market calendar transition/window | Server-authoritative Gameweek calendar and lock time; client clock corrected; scoring is never described as paused by the market | Feed/Story or push by approved version | Instagram, configured push, first-party market status | Users eligible for the relevant Gameweek | P1 Engagement |
| 18 | `LEADER_CHANGE` | Stable player-ranking leader changes | Two consecutive/stable canonical snapshots; real identity change; no transient or tie ambiguity | Story | Instagram Story; eligible global first-party surfaces | Global audience | P1 Engagement |
| 19 | `CARD_SPOTLIGHT` / `MILESTONE` | Verified record or milestone | Canonical historical facts and scoring version; published card; no invented comparison | Feed/Story by approved version | Instagram; relevant Club Social Feed | Global/relevant club audience | P1 Engagement |
| 20 | `CLUB_FORM` / `RESULT_RUN` | Configurable club-content window | Canonical definition, bounded fixture set and verified current results exist; otherwise disabled | First-party post or Feed by approved version | Club Social Feed; optional Instagram | One club; optional global audience | P1 Engagement |
| 21 | `NEXT_FIXTURE` | After Full Time, under quota | Next canonical scheduled fixture is unique and verified; does not duplicate the primary preview | First-party post or Story by approved version | Club Social Feed; optional Instagram Story | Relevant club audience | P1 Engagement |
| 22 | `POLL_QUESTION_VARIANT` | Attached to an eligible parent content revision | Factual checksum identical to parent; only approved British-English engagement copy varies; no factual mutation | Caption/Story interaction | Instagram or first-party reactions/comments | Parent audience | P1 Engagement |
| 23 | `CLUB_OWNER_RANKING_PREVIEW` / `CLUB_OWNER_RANKING_FINAL` | Future explicit feature activation | Feature flag OFF by default; owner ranking/privacy/rules approved and snapshots complete | Undecided, separately versioned | Disabled | Disabled | Future |

## Mandatory routing rules

An exact approved revision is stored once. Module 045 associates that revision
only with the relevant ClubHub team identifiers; module 049 presents the same
canonical revision in the common ClubOwner Timeline. Both internal surfaces
provide a user-initiated native Share action. Neither module contains an
Instagram or Facebook credential or callable outbound adapter; external
delivery remains a separate, fail-closed operational gate.

- `MATCH_PREVIEW` uses the same immutable approved 041 revision for Instagram
  DRAFT and for the internal Club Social Feed of the two participating clubs.
  The ClubHub fixture header remains the compact navigation summary; the feed
  post is the editorial artwork and never creates a second factual source.
- `OFFICIAL_LINEUP` uses one canonical revision for the simultaneous ClubHub
  update, Club Social Feed post, configured alert and Instagram DRAFT. A partial
  failure is observable and retried idempotently; it may not create divergent
  facts.
- Goal content is generated only from a confirmed event. VAR/pending content is
  never rendered or queued.
- `FULL_TIME` waits for fixture, accepted goals and player/coach scoring to
  reconcile. It is not triggered by a visual clock alone.
- Gameweek table and ranking content has distinct preview and final gates. Final
  means every scoreable fixture and required snapshot is consolidated.
- There is no `HALF_TIME` content type.
- Match Preview, Line-up, Full Time, rankings/tables, duels and heroes target the
  Instagram Feed. Goals, red cards, leader changes, deadline and optional final
  score target Story.
- Club Social Feed receives only relevant club content. Push audiences are
  configurable and preference-bound to avoid spam.

## Publishing cadence and editorial calendar

Status: **editorial policy approved by Luiz; module 046 implements local-only
eligibility controls, while outbound scheduling remains inactive and 047+ is
future work**. All clock times in this
section use `Europe/Malta`. Event-driven content becomes eligible from a
verified canonical state transition; editorial slots order eligible evergreen
content without substituting a source gate.

### Event-driven content has no editorial clock

`OFFICIAL_LINEUP`, `GOAL_CONFIRMED`, `RED_CARD_CONFIRMED`, `FINAL_SCORE`,
`FULL_TIME` and other verified match facts are event-driven. They enter the
orchestrator when their official gate becomes ready, regardless of the nearest
editorial peak slot. Quotas, conflict ordering and backpressure can delay
delivery, but a wall clock can neither make an ineligible fact ready nor replace
its canonical event trigger.

### Relative to each fixture

| Timing/state | Content | Orchestration rule |
|---|---|---|
| T-24h | `MATCH_PREVIEW` Feed | Generate inside the configurable preview window after every preview gate passes. If exact T-24 falls outside 09:00–21:00 Malta, select the closest eligible peak slot that does not make the preview too late. |
| T-6h | `PLAYER_DUEL` Feed | Optional and secondary; defer when it would collide with P0 content. |
| Official sheet `READY` | `OFFICIAL_LINEUP` Feed + native ClubHub + Club Social Feed + configured push | Trigger immediately from the stable exact 11+9 sheet, normally around T-30. The clock alone can never trigger it. |
| Confirmed event | `GOAL_CONFIRMED` Story | Trigger immediately after confirmation and reconciliation; never pending or VAR-disallowed. |
| Confirmed event | `RED_CARD_CONFIRMED` Story | Trigger immediately after the canonical dismissal is confirmed. |
| `FINISHED` + reconciled | `FINAL_SCORE` Story, then `FULL_TIME` Feed | Event-driven: Story is first and Feed follows, with a delivery target of +5–10 minutes. Neither item becomes eligible before score, goals and scoring gates pass, and neither waits for a peak slot after readiness. |
| +30–90 minutes after Full Time | `CLUB_TOP_CARD` | Publish natively to the relevant Club Social Feed. Instagram global receives only policy-engine-selected highlights. |
| Next day, free slot | `NEXT_FIXTURE` / approved engagement | Publish only if relevant, verified and not displaced by higher-priority content. |

### Relative to each Gameweek

Gameweek anchors are the canonical `firstFixture` and `lastFixture`, never fixed
weekday names, because the competition calendar can move.

| Anchor | Preferred content |
|---|---|
| T-24h before `firstFixture` | `LEAGUE_TABLE_PREVIEW` |
| T-8h before `firstFixture` | `PLAYER_RANKING_RACE_PREMATCH` |
| T-5h before `firstFixture` | `COACH_RANKING_RACE_PREMATCH` |
| T-2h before `firstFixture` | `MATCHDAY_SCHEDULE` / final call, only without collision |
| First eligible 13:00 or 20:00 slot after `lastFixture` is `FINISHED` and snapshots are consolidated | `LEAGUE_TABLE_FINAL` |
| Next eligible 13:00 or 20:00 slot after consolidation | `PLAYER_RANKING_FINAL` |
| Next eligible 20:00 slot after consolidation | `COACH_RANKING_FINAL` |
| Following eligible 10:30 or 13:00 slot | `TEAM_OF_THE_GAMEWEEK` |
| Following eligible 13:00 or 20:00 slot | `GAMEWEEK_HERO` / `TOP_PERFORMER` |
| Intermediate free 13:00 or 20:00 slots | `CARD_SPOTLIGHT`, `MILESTONE`, `CLUB_FORM` or the next eligible `PLAYER_DUEL` |

### Initial editorial peak-slot hypotheses

These are launch hypotheses, not proven audience peaks:

1. Primary: **20:00 Malta**.
2. Secondary: **13:00 Malta**.
3. Morning slot for weekend/Gameweek content: **10:30 Malta**.
4. Collision reserve: **18:30 Malta**.

Initial mapping uses 13:00 or 20:00 for final rankings, final table and heroes;
20:00 for coach ranking, duels and card spotlights; and 10:30 or 13:00 for Team
of the Gameweek and schedules. Match Preview retains its T-24 basis with the
09:00–21:00 adjustment above. These slots never authorise missing facts and are
not a fixed delivery promise.

### Account-specific optimisation

- Collect official account Insights per post when available: reach,
  impressions, saves, shares, comments, follows/profile actions, weekday and
  publication time.
- Use at least 14 days for the initial baseline and conduct the main review at
  30 days. Choose future slots from measured account/audience performance, not
  generic social-media advice.
- Run controlled A/B tests without changing template and time simultaneously;
  otherwise the result cannot attribute performance.
- Admin displays `recommendedScheduledAt`, the recommendation reason and the
  version of the scheduling policy that produced it.
- A feature flag can preserve fixed initial slots during rollout or diagnosis.
- If Insights are unavailable or insufficient, retain the initial hypotheses.
- Meta/Instagram scheduling behaviour and rate limits must be verified against
  the official outbound integration and account contract. No presumed numeric
  platform limit may be encoded.

### Conflict, quota and expiry rules

- Automated Feed posts have a configurable minimum 90-minute gap. P0
  event-driven content may defer P1 content; the event stays recorded and is
  never silently discarded.
- Goal and red-card Stories are exempt from the Feed gap, but still enter their
  own bounded quota and queue.
- Conflict priority is: `RED_CARD_CONFIRMED` / `GOAL_CONFIRMED` >
  `OFFICIAL_LINEUP` > `FULL_TIME` / `FINAL_SCORE` > `MATCH_PREVIEW` > table and
  ranking content > engagement content.
- Daily quotas and platform rate limits remain configurable. This policy does
  not invent an Instagram limit; exact values require verification against the
  official Meta account/API contract. Kill switches and backpressure remain
  mandatory.
- If delay removes editorial relevance, mark the candidate `EXPIRED` or
  `SKIPPED` with a reason. Never publish stale news to empty a queue.
- Club Social Feed may receive a verified event for its own club immediately.
  Instagram global always passes through the orchestrator to avoid spam.
- Each candidate records `scheduledAt`, `eligibleAt`, `generatedAt`,
  `approvedTemplateVersion`, `publishedAt`, plus an explicit skip/delay reason.
  These fields supplement, and do not replace, the source/reconciliation SLA
  timestamps below.

## Template-version approval policy (local module 046 candidate)

Luiz approves the first artwork and first base caption for an exact identity:
`contentType + placement + locale + dimensions + rendered-field schema +
copy/lexicon checksum + visual template checksum + templateVersion`. The state
machine is:

`TEMPLATE_APPROVAL_REQUIRED → TEMPLATE_APPROVED → AUTO_PUBLISH_ENABLED`

`PAUSED` blocks operation until an explicit OWNER transition; `REVOKED` is
terminal. A change to layout, dimensions, placement, rendered fields, base
copy, lexicon, checksum or version invalidates approval and requires a fresh
OWNER review. Template approval never approves dynamic data: every publication
must still pass its current source, asset, revision, checksum and sport-specific
gate.

Module 046 provides global and per-content kill switches, immediate pause,
idempotency, bounded quotas/rate protection, before/after audit, delivery
reconciliation and terminal `DELIVERY_UNKNOWN` for an external result that
cannot be proven. Instagram/Meta outbound remains absent/disabled until official
connection, current terms/limits verification, controlled testing and separate
operational authorisation.

## SLA and observability

No latency target is promised before runtime measurement. Every eligible event
records monotonic, correlated timestamps for:

`official_observed_at → persisted_at → reconciled_at → first_party_visible_at
→ draft_generated_at → approved_or_auto_publish_eligible_at → delivery_started_at
→ delivery_reconciled_at`

The dashboard reports measured median/P75/P95, never-run, stale, retry and
terminal status per stage/content type. ClubHub and other internal surfaces must
consume the reconciled DTO before social outbound begins. Scheduler, fan-out and
delivery use leases/single-flight, bounded retry, idempotency keys and sanitised
failure codes. Quota exhaustion pauses delivery; it never discards the canonical
event or silently skips an eligible draft.

## Module map and current state

| Module | Scope | Current state on 2026-09-01 |
|---|---|---|
| 039 | Immutable DRAFT/Storage, separate per-post art and caption review, outbox contract | Shared-QA approval-only authority; external dispatch disabled |
| 040 | Durable `OFFICIAL_LINEUP` discovery/queue/runner | Frozen audited local candidate; not configured/applied by this regulation |
| 041 | Shared content registry plus `MATCH_PREVIEW` pilot | Local candidate validated; independent second audit remains the gate |
| 042 | `FULL_TIME` Feed and optional `FINAL_SCORE` Story | Local candidate validated in disposable shadow; no shared-QA write/deploy |
| 043 | Confirmed goal/hat-trick Feed and red-card Story | Local candidate validated in disposable shadow; no shared-QA write/deploy |
| 044 | Ranking preview/final, duel and hero family implemented by its bounded registry | Local candidate validated in disposable shadow; broader table/coach/TOTW catalogue remains future work |
| 045 | Club Social Feed/Timeline native fan-out | Local candidate shadow-validated; second audit and all remote activation pending |
| 046 | Template-version approval and controlled auto-publish policy | Local candidate independently validated; internal eligibility only, with outbound hard-disabled and no connector |
| 047 | Hat-trick event-family correction | Local candidate; shared-QA apply pending |
| 048 | Match Preview fan-out to both fixture ClubHubs | Local candidate; shared-QA apply pending |
| 049 | Common official ClubOwner Timeline reader | Local candidate; shared-QA apply pending; same media bytes, no external connector |
| 050+ | Push orchestration, schedule/deadline, remaining engagement/future modules | Unnumbered dependency plan; disabled until separately scoped and audited |

No module may alter frozen predecessors silently. Every additive runtime module
requires its own forward/rollback migration where needed, deterministic tests,
fresh shadow, threat/security review and independent second audit.

Destination expansion follows the separate [Multichannel Destination
Roadmap](MULTICHANNEL_DESTINATION_ROADMAP.md). `ACTIVE PRIORITY` is Instagram and
the 041–046 family. `NEXT` is a separate Facebook Page adapter only after
Instagram is stable and measured. Threads, X, TikTok, YouTube Shorts and
LinkedIn are `DOCUMENTED / DISABLED`: they receive no runtime-specific schema,
OAuth, credential, API or implementation work and cannot delay 041–046. They may
be reopened only by a new explicit Luiz decision.

## Explicit open decisions

- Module 045 fixes active-feed expiry at exactly 14 days and preserves only the
  minimal audit tombstone. Comments/reactions and Storage object deletion remain
  disabled; enabling either requires a separate privacy/moderation/lifecycle
  decision and audit.
- Push notification defaults, per-event opt-in/opt-out, quiet hours, geography,
  age/privacy treatment and quota are **pending explicit product/privacy
  approval**. Until then push is disabled, even when a DTO is eligible.
- Club Owner rankings remain feature-flagged OFF. No owner ranking facts may be
  generated or exposed before the rules and privacy contract are approved.

## Changelog

- **2026-08-31 — Luiz Lopez:** approved the proposed Europe/Malta publishing
  cadence, event-driven versus editorial-slot distinction, Gameweek anchors,
  conflict priority, configurable Feed spacing, quotas/backpressure, expiry and
  scheduling audit fields for future modules 046/047+. No runtime was activated.
- **2026-08-31 — Luiz Lopez:** refined the launch hypotheses to 20:00 primary,
  13:00 secondary, 10:30 weekend/Gameweek and 18:30 collision reserve; required
  account Insights baselines at 14/30 days and controlled scheduling A/B tests.
- **2026-08-31 — Luiz Lopez:** approved the design-only multichannel sequence:
  Instagram, Facebook Page, Threads/X, TikTok/YouTube Shorts and institutional
  LinkedIn, with independent destination adapters and no account connection.
- **2026-08-31 — Luiz Lopez:** fixed the operational priority to Instagram
  first, Facebook Page next after stabilisation/measurement, and every other
  destination documented/disabled until a new explicit decision.
- **2026-08-31 — Luiz Lopez:** established the Central TouchLine principle,
  canonical 23-type catalogue, destination/audience rules, P0/P1 priority,
  measured SLA chain and future template-version approval model. This document
  records product authority; it does not authorise a migration, deployment,
  shared-QA mutation, Meta connection, Instagram delivery or Production change.
