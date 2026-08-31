# Admin approval-only workflow

The Admin surface is [`/admin/social-publications`](../../../app/(app)/admin/social-publications/page.tsx). It is owner-only and reads private previews through short-lived signed URLs.

## State flow

1. A complete verified source is observed and the generator acquires its singleton/candidate lease.
2. The renderer exports final PNG/JPEG bytes.
3. Bytes are fully decoded, dimension-checked and SHA-256 hashed.
4. A create-only content-addressed object is stored in the private `touchline-social-drafts` bucket.
5. An immutable DRAFT records source, template, caption, object locator, byte checksum and manifest checksum.
6. Admin shows the integral artefact and caption.
7. Luiz approves artwork and caption separately through fresh one-use review intents.
8. Both current checksums must match the same current manifest before the DRAFT becomes `APPROVED`.
9. A future enqueue may create one idempotent outbox identity. Approval does not itself publish.

Any rendered source, artefact, caption, revision or checksum change makes the older revision ineligible for enqueue/dispatch and requires a new immutable revision and review. Season statistics used by a LINE-UP draft are explicitly scoped to the canonical fixture competition and season; another row merely marked current is not a renderer dependency. A historical approval row remains immutable audit evidence; it is not rewritten or silently relabelled as rejected. Failed previews, stale generation health or current-source mismatch block approval.

Current fail-closed boundary: only `LINEUP` is enabled for approval in the candidate contract. `FINAL_SCORE` may be rendered as read-only DRAFT evidence, but its approval/outbox path remains blocked until a typed current-source generation/attestation contract receives its own review and shadow tests.

## External delivery

External Instagram dispatch is disabled. Do not use an Instagram password, browser automation or an unapproved credential. A Meta integration requires a separate security review, controlled test and explicit owner approval for the exact publication.

Before any future outbound worker exists, it must use the fenced dispatch claim, re-read/decode/re-hash the exact private object immediately before the network call, reattest the current generation/source/health, and treat an expired or interrupted claim as `DELIVERY_UNKNOWN` pending reconciliation rather than retrying blindly.

Executable references: [`TouchlineSocialDraftReviewActions.tsx`](../../../components/touchline/admin/TouchlineSocialDraftReviewActions.tsx), [`social-publication-contract.ts`](../../../lib/touchlineArena/social-publication-contract.ts), migration candidate [039](../../../supabase/qa/039_touchline_qa_social_approval_outbox.sql).
