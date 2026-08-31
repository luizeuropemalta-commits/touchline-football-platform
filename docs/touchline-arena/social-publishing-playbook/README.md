# TouchLine Social Publishing Playbook

Status: **QA design authority; approval-only; external dispatch disabled**
Last reviewed: 2026-08-30 (Europe/Malta)

This directory is the canonical operational index for TouchLine social publishing. It explains how the existing contracts fit together; it does not replace executable guards or authorise a migration, deployment, credential, Production change, or external publication.

## Authority order

When text and executable behaviour disagree, stop fail-closed and record the gap. The current executable authorities are:

1. Data gates: [`official-team-sheet-readiness.ts`](../../../lib/football-data/official-team-sheet-readiness.ts), [`social-lineup-contract.ts`](../../../lib/touchlineArena/social-lineup-contract.ts), [`social-final-score-draft-server.ts`](../../../lib/touchlineArena/social-final-score-draft-server.ts).
2. Render/read contracts: [`social-lineup-draft-server.ts`](../../../lib/touchlineArena/social-lineup-draft-server.ts), [`social-lineup-presentation-policy.ts`](../../../lib/touchlineArena/social-lineup-presentation-policy.ts), [`social-publication-contract.ts`](../../../lib/touchlineArena/social-publication-contract.ts).
3. Approval/outbox schema candidate: [`039_touchline_qa_social_approval_outbox.sql`](../../../supabase/qa/039_touchline_qa_social_approval_outbox.sql) and its [rollback](../../../supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql).
4. Generator and storage controls: [`generate-touchline-social-lineup-drafts.mts`](../../../scripts/qa/generate-touchline-social-lineup-drafts.mts), [`social-artifact-storage-core.ts`](../../../lib/touchlineArena/social-artifact-storage-core.ts).
5. Admin review surface: [`admin/social-publications/page.tsx`](../../../app/(app)/admin/social-publications/page.tsx) and [`TouchlineSocialDraftReviewActions.tsx`](../../../components/touchline/admin/TouchlineSocialDraftReviewActions.tsx).

## Index

- [Content types and triggers](CONTENT_TYPES_AND_TRIGGERS.md)
- [Visual standard](VISUAL_STANDARD.md)
- [British English copy and hashtags](COPY_AND_HASHTAGS.md)
- [Canonical Social Icon Lexicon](CANONICAL_SOCIAL_ICON_LEXICON.md)
- [Continuous editorial strategy](EDITORIAL_STRATEGY.md)
- [Club Owner Timeline — design only](CLUB_OWNER_TIMELINE_DESIGN.md)
- [Club Social Feed — roadmap only](CLUB_SOCIAL_FEED_ROADMAP.md)
- [Admin approval-only workflow](ADMIN_APPROVAL_WORKFLOW.md)
- [Data and fail-closed policy](DATA_AND_FAIL_CLOSED.md)
- [Formats, limits and cadence](FORMATS_LIMITS_AND_CADENCE.md)
- [Audit and rollback](AUDIT_AND_ROLLBACK.md)

## Current gaps — not release approval

- Migration 039 is a reviewed candidate but is **not documented here as applied to shared QA**.
- Real Instagram dispatch remains disabled and has no approved Meta credential or controlled delivery proof.
- The owner-approved two-minute team-sheet stability period is enforced by the worker/claim contract and exercised in the disposable PostgreSQL shadow; shared-QA runtime proof is still required before release.
- The automatic finite worker currently generates LINE-UP Feed drafts; automated FULL TIME, Story, Reel and multi-slide publication assembly remain incomplete.
- A canonical automatic hashtag builder is not implemented.
- `FINAL_SCORE` approval/outbox remains deliberately disabled until a typed current-source attestation exists; only read-only DRAFT evidence is available.
- Concurrent artwork/caption approvals, intent expiry/replay and transactional semantic revisions for the current 19-table render-source surface are exercised in the disposable PostgreSQL shadow. Season statistics are fixture-season-bound rather than selected from the competition-wide current-season set. The exact OWNER-only shared-QA approver manifest and independent comparison remain open gates; the candidate must be reaudited whenever a renderer adds another source table.
- Card Duel, Golden Boot and leader-change automation are documented strategy, not implemented content types.
- Club Owner Timeline is an unimplemented design proposal; this playbook does not authorise schema, Storage lifecycle, jobs or UI work for it.
- Club Social Feed is an unimplemented roadmap; it requires a separate schema/RLS/performance/moderation review before any runtime work.
- These gaps must remain visible in Admin/release evidence and must never be filled by inference or manual bypass.
