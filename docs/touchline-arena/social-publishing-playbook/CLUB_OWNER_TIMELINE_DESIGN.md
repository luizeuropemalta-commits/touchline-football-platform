# Club Owner Timeline — local candidate

Status: **module 045 implemented and shadow-validated locally; independent second audit and every remote action remain pending**.

The Club Owner Timeline is a first-party TouchLine channel. It is separate from Instagram, the approval-only Instagram outbox and external publishing cadence, but it consumes the same approved canonical editorial facts and copy source.

## Shared editorial source and channel adapters

- Instagram and the Club Owner Timeline share one canonical British English editorial copy and one factual `sourceChecksum`.
- The checksum covers the factual source identity used by both channels: fixture/team/player identities, state, score, events, ratings, timestamps and canonical editorial wording.
- A channel adapter may change presentation and channel-only footer/CTA fields; it may not change, omit in a misleading way, or reinterpret any factual field.
- Instagram may add approved hashtags, `COMING SOON`, and a channel-appropriate Story/swipe CTA.
- Timeline removes hashtags and Instagram-specific language and, only after their separate moderation/privacy contract is approved, may expose internal comments/reactions instead.
- If the canonical copy or any factual input changes, every channel derivative is stale and requires a new revision/checksum and its applicable approval.
- A mismatch between the factual payloads of two adapters is a blocking defect, never an editorial variation.

## Content model

### Match Thread

One canonical Match Thread per fixture. Its identity is the canonical fixture ID, competition and season; a team/player name is never its key.

The thread may receive immutable or revisioned entries as verified states arrive:

1. official LINE-UP;
2. confirmed match events in chronological order;
3. live/provisional TouchLine presentation where the relevant scoring contract allows it;
4. FULL TIME result and final reconciled summary.

An update must preserve its source snapshot/revision and cannot silently rewrite earlier evidence. Corrections append a new auditable revision and mark the superseded presentation; they do not erase the original audit record.

### Individual timeline posts

Preview, Card Duel, current leader, Golden Boot Race, Gameweek rankings and other editorial features remain individual posts. They may link to a Match Thread but must not be merged into fixture facts or treated as official match events.

Fixture-scoped posts appear in the timelines of both participating clubs. Competition-wide and Gameweek ranking posts may be distributed to every eligible Club Owner timeline. Fan-out references one canonical post/revision; it must not clone independently editable factual copies.

## Decided retention contract

- A Timeline item receives an immutable `expires_at` for 14 days after its publication time.
- At expiry it leaves the active feed and is hard-deleted from the Timeline channel; there is no indefinite Timeline archive.
- Hard-delete preserves only a minimal non-content audit tombstone: canonical post identity, `sourceChecksum`, channel, publication/deletion timestamps, deletion reason and audit/run identity needed to prove lifecycle execution.
- The tombstone must not retain rendered media, editorial body, hashtags, reactions, comments or other personal content unless a separately approved legal/privacy policy explicitly requires a bounded field.
- Canonical football records, fixture evidence, cards, ratings and player/coach settlements live outside the Timeline and are never deleted by Timeline retention.
- Comments/reactions follow the future approved comment/privacy policy. Until it exists, implementation must fail closed and cannot activate Timeline comments or reactions.
- Every active read is bounded, cursor-paginated and ordered by stable timestamp plus unique ID. No unbounded full-history reads or tombstone feed is permitted.

## Media lifecycle

- Heavy derived previews may receive a Storage lifecycle only after reference tracking and recovery rules are approved.
- Lifecycle must never delete canonical football source data, persisted fixture evidence, player/coach settlements, canonical cards, approval manifests or audit rows.
- Content-addressed social artefacts referenced by an active Timeline item or another live approval/publication identity are immutable and protected from overwrite/deletion.
- After the 14-day Timeline hard-delete, a Timeline-only rendered artefact/thumbnail may be deleted by Storage lifecycle once reference counting proves that no other channel, approval or publication still depends on it. The minimal tombstone retains its checksum, not the media bytes or locator.
- Instagram artefacts and any other channel identity follow their own retention contract and are not deleted merely because the Timeline copy expired.

## Separation from Instagram

- Timeline creation/update does not enqueue Instagram delivery.
- Instagram approval, idempotency and dispatch status do not control Timeline visibility.
- The two channels share the canonical editorial copy and factual `sourceChecksum`, while each immutable channel derivative has its own presentation checksum and approval state.
- A Timeline post adapted for Instagram becomes a separate immutable social DRAFT with the same factual source checksum, its own artefact/caption checksums and separate owner approvals.
- Instagram retention and external deletion are outside this proposal.

## Local candidate boundary and required review

The local candidate implements one canonical post plus immutable club references,
server-only bounded cursor reads, 14-day hard-delete, minimal tombstones and a
durable single-flight fan-out executor. It deliberately does not implement
comments, reactions, UGC, Storage object deletion or external delivery.

Before any shared-QA activation it still requires independent security/privacy
review of RLS, cross-club isolation, retention concurrency, query/index budget,
rollback and the ClubHub surface, followed by explicit operational authorisation.
