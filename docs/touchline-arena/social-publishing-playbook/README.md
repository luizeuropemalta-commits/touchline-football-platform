# TouchLine Social Publishing Playbook

Status: **QA design authority; approval-only; external dispatch disabled**
Last reviewed: 2026-08-31 (Europe/Malta)

This directory is the canonical operational index for TouchLine social publishing. It explains how the existing contracts fit together; it does not replace executable guards or authorise a migration, deployment, credential, Production change, or external publication.

## Authority order

When text and executable behaviour disagree, stop fail-closed and record the gap. The current executable authorities are:

1. Data gates: [`official-team-sheet-readiness.ts`](../../../lib/football-data/official-team-sheet-readiness.ts), [`social-lineup-contract.ts`](../../../lib/touchlineArena/social-lineup-contract.ts), [`social-final-score-draft-server.ts`](../../../lib/touchlineArena/social-final-score-draft-server.ts).
2. Render/read contracts: [`social-lineup-draft-server.ts`](../../../lib/touchlineArena/social-lineup-draft-server.ts), [`social-lineup-presentation-policy.ts`](../../../lib/touchlineArena/social-lineup-presentation-policy.ts), [`social-publication-contract.ts`](../../../lib/touchlineArena/social-publication-contract.ts).
3. Approval/outbox schema authority in shared QA: [`039_touchline_qa_social_approval_outbox.sql`](../../../supabase/qa/039_touchline_qa_social_approval_outbox.sql) and its [rollback](../../../supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql).
4. Generator and storage controls: [`generate-touchline-social-lineup-drafts.mts`](../../../scripts/qa/generate-touchline-social-lineup-drafts.mts), [`social-artifact-storage-core.ts`](../../../lib/touchlineArena/social-artifact-storage-core.ts).
5. Admin review surface: [`admin/social-publications/page.tsx`](../../../app/(app)/admin/social-publications/page.tsx) and [`TouchlineSocialDraftReviewActions.tsx`](../../../components/touchline/admin/TouchlineSocialDraftReviewActions.tsx).
6. Frozen LINE-UP durable executor: [`040_touchline_qa_social_draft_executor.sql`](../../../supabase/qa/040_touchline_qa_social_draft_executor.sql), its [rollback](../../../supabase/qa/040_touchline_qa_social_draft_executor_rollback.sql), [scheduler](../../../scripts/qa/schedule-touchline-social-lineup-drafts.mts) and [runner](../../../scripts/qa/run-touchline-social-lineup-draft-queue.mts). The local candidate passed its independent audit but remains inactive until a separate operational apply/deploy decision.
7. Additive family registry: [Automatic social module registry](AUTOMATIC_SOCIAL_MODULE_REGISTRY.md). Each numbered module extends the shared publication identity without editing the frozen 039/040 source files.

## Index

- [TouchLine Social Media Regulations](TOUCHLINE_SOCIAL_MEDIA_REGULATIONS.md) — canonical catalogue, Central TouchLine architecture, destinations, priorities and approval policy
- [Multichannel destination roadmap](MULTICHANNEL_DESTINATION_ROADMAP.md) — Instagram active priority, Facebook Page next, all other destinations documented/disabled
- [Content types and triggers](CONTENT_TYPES_AND_TRIGGERS.md)
- [Automatic social module registry](AUTOMATIC_SOCIAL_MODULE_REGISTRY.md)
- [Visual standard](VISUAL_STANDARD.md)
- [British English copy and hashtags](COPY_AND_HASHTAGS.md)
- [Canonical Social Icon Lexicon](CANONICAL_SOCIAL_ICON_LEXICON.md)
- [Continuous editorial strategy](EDITORIAL_STRATEGY.md)
- [Club Owner Timeline — local module 045 candidate](CLUB_OWNER_TIMELINE_DESIGN.md)
- [Club Social Feed — local module 045 candidate](CLUB_SOCIAL_FEED_ROADMAP.md)
- [Admin approval-only workflow](ADMIN_APPROVAL_WORKFLOW.md)
- [Durable DRAFT executor — QA threat review](DRAFT_EXECUTOR_QA_THREAT_REVIEW.md)
- [Automatic social family — threat review](AUTOMATIC_SOCIAL_FAMILY_THREAT_REVIEW.md)
- [Template policy 046 — local threat review](SOCIAL_TEMPLATE_POLICY_046_THREAT_REVIEW.md)
- [Club Social Feed 045 — local threat review](CLUB_SOCIAL_FEED_QA_THREAT_REVIEW.md)
- [Data and fail-closed policy](DATA_AND_FAIL_CLOSED.md)
- [Formats, limits and cadence](FORMATS_LIMITS_AND_CADENCE.md)
- [Audit and rollback](AUDIT_AND_ROLLBACK.md)

## Current gaps — not release approval

- Migration 039 and private Storage are the accepted shared-QA approval-only authority. This does not authorise external dispatch.
- Migration candidate 040 and its scheduler/runner are frozen in local commit `242bc1cff005a8fdfc4cb39adf9e263ca2948ba2`; the independent candidate audit passed, but no durable scheduler is configured and no shared-QA apply/deploy follows from that PASS alone.
- Real Instagram dispatch remains disabled and has no approved Meta credential or controlled delivery proof.
- The owner-approved two-minute team-sheet stability period is enforced by the worker/claim contract. Durable 040 scheduler/runner runtime proof is still required before activation.
- The automatic family is isolated by modules: 040 LINE-UP, 041 MATCH PREVIEW, 042 FULL TIME/FINAL SCORE, 043 confirmed events, 044 ranking/hero formats and 045 first-party Club Feed fan-out. Later modules cannot borrow one another's eligibility gates, and local candidates are not remote authority.
- A canonical automatic hashtag builder is not implemented.
- `FINAL_SCORE` approval/outbox remains deliberately disabled until a typed current-source attestation exists; only read-only DRAFT evidence is available.
- Concurrent artwork/caption approvals, intent expiry/replay and transactional semantic revisions for the current 19-table render-source surface are exercised in the disposable PostgreSQL shadow. Season statistics are fixture-season-bound rather than selected from the competition-wide current-season set. The exact OWNER-only shared-QA approver manifest and independent comparison remain open gates; the candidate must be reaudited whenever a renderer adds another source table.
- Card Duel, Golden Boot and leader-change automation are documented strategy, not implemented content types.
- Club Owner Timeline/Club Social Feed module 045 is a local-only candidate. Its migration, runner, retention and ClubHub UI require independent RLS/security/performance/browser review before any remote activation; comments/reactions and Storage lifecycle remain unimplemented.
- These gaps must remain visible in Admin/release evidence and must never be filled by inference or manual bypass.
