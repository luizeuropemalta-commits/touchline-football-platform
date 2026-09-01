# Club Social Feed — local module 045 candidate

Status: **implemented and shadow-validated locally; not independently approved, applied, scheduled or deployed**.

Each Club Hub may eventually expose a first-party TouchLine social feed filtered by the canonical `clubId`/provider `teamId` mapping. It reuses the Club Owner Timeline editorial source and channel adapter; it is not an Instagram embed and does not create an independent copy of fixture facts.

## Eligible official content

- Match Preview;
- TouchLine Card Duel;
- Official Line-up;
- one live Match Thread per fixture, updated with verified goals and cards;
- Full Time;
- Top Match Card;
- verified coach/card milestones;
- club ranking and verified form.

Phase 1 contains official TouchLine posts only. Comments, reactions and
user-generated posts are disabled until their separate moderation, abuse,
privacy and deletion contracts are approved.

## Canonical identity and fan-out

- Create one canonical social artefact/post identity per content revision or fixture thread.
- Associate it to relevant clubs through immutable `clubId` references; never duplicate media bytes, canonical copy or independently editable factual payloads per Club Hub.
- Fixture-scoped content fans out to both participating clubs. Club-specific milestones fan out only to the verified club. Competition/Gameweek rankings may fan out to all eligible clubs.
- Every reference carries the same factual `sourceChecksum`. The Club Social Feed uses the Timeline presentation adapter, so it removes Instagram hashtags/CTAs and cannot change facts.
- A fixture correction creates a new canonical revision and invalidates affected channel presentation approvals; it does not silently rewrite a published artefact.

## Visibility boundary

- Only immutable `APPROVED`/`PUBLISHED` channel states are visible in a Club Hub.
- `DRAFT`, `REVIEW_REQUIRED`, rejected, stale, invalidated, expired and failed content is absent from public queries, accessibility trees, search and client payloads.
- Missing or conflicting `clubId`/`teamId`, fixture identity, source checksum or approval state fails closed.
- Comments/reactions remain disabled until moderation, privacy, rate-limit and deletion policies pass review.

## Retention

- Active Club Social Feed/Timeline posts expire and are hard-deleted after 14 days according to immutable `expires_at`.
- Preserve only the minimal audit tombstone defined by the [Club Owner Timeline design](CLUB_OWNER_TIMELINE_DESIGN.md); do not retain post body, media, comments or reactions by default.
- Canonical football data, fixture evidence, cards, ratings and settlements remain outside the feed and are never deleted by feed retention.
- Timeline-only heavy derivatives may be removed through reference-counted Storage lifecycle after hard-delete. A shared Instagram or approval reference prevents deletion of the same content-addressed object.

## Runtime gates still required

Before implementation, a separate reviewed proposal must prove:

1. RLS and server-side authorisation for club membership, owner/customer roles and moderation;
2. exact canonical `clubId`/`teamId` reconciliation and cross-club isolation;
3. bounded cursor pagination, query/index plan, fan-out reference cost and load budget;
4. no DRAFT/`REVIEW_REQUIRED` leakage through API, RSC, cache, search or accessibility output;
5. comment/reaction moderation, rate limits, abuse controls, privacy/export/deletion handling and audit;
6. content-addressed media reference counting, 14-day lifecycle, retries and rollback;
7. concurrency/idempotency for one Match Thread per fixture and one canonical post/revision;
8. disposable database, RLS/security, performance and browser tests before shared QA.

The local candidate covers items 2, 3, 4, 6 and 7 in its current first-party
scope and has a disposable PostgreSQL proof. Items 1, 5 and 8 remain explicit
activation gates, and an independent review must verify all eight against the
actual diff. No item above authorises a migration, deploy, shared QA write,
Production change or Instagram dispatch.
