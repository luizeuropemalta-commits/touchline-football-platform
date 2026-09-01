# Admin approval-only workflow

The Admin surface is [`/admin/social-publications`](../../../app/(app)/admin/social-publications/page.tsx). It is owner-only and reads private previews through short-lived signed URLs.

## State flow

1. A complete verified source is observed; the 040 scheduler candidate acquires its singleton lease and queues the exact source revision.
2. The 040 runner candidate claims one fenced job and invokes the existing generator outside the HTTP request path.
3. The renderer exports final PNG/JPEG bytes.
4. Bytes are fully decoded, dimension-checked and SHA-256 hashed.
5. A create-only content-addressed object is stored in the private `touchline-social-drafts` bucket.
6. An immutable DRAFT records source, template, caption, object locator, byte checksum and manifest checksum.
7. Admin shows the integral artefact, caption, exact job and executor health as a UX preflight; this page check is not the security authority.
8. Luiz approves artwork and caption separately through fresh one-use review intents. The authenticated OWNER route re-hashes private media, then the server-only service-role boundary issues the actor-bound one-use intent. Authenticated clients cannot mint intents directly. The database gate atomically revalidates both executor components and the exact `COMPLETED` job when the intent is issued and again when either approval transition is attempted.
9. Both current checksums must match the same current manifest before the DRAFT becomes `APPROVED`.
10. A future enqueue may create one idempotent outbox identity. Approval does not itself publish.

Any rendered source, artefact, caption, revision or checksum change makes the older revision ineligible for enqueue/dispatch and requires a new immutable revision and review. Season statistics used by a LINE-UP draft are explicitly scoped to the canonical fixture competition and season; another row merely marked current is not a renderer dependency. A historical approval row remains immutable audit evidence; it is not rewritten or silently relabelled as rejected. Failed previews, stale generation health or current-source mismatch block approval.

Current shared-QA fail-closed boundary: only `LINEUP` is enabled for approval.
Module 041 proposes a separate `MATCH_PREVIEW` executor/job attestation and
database approval branch; it is local-only until its own shadow and second audit
pass. `FINAL_SCORE` remains read-only DRAFT evidence pending module 042.

041 does not claim runtime byte identity with 040. It preserves the 039/040
LINEUP tables, RPC grants and LINEUP approval branch, while intentionally
replacing the shared approval-trigger function with a content-type dispatcher.
The 041 rollback restores the 040 LINEUP-only function semantics; the disposable
shadow compares those semantics and exercises both the service-only intent
boundary and the 041 branch.

The future template-approval state machine is module 046, not part of the 041
pilot. It will require the OWNER to approve the first artwork and base caption of
an exact template identity before later eligible items can enter
`AUTO_PUBLISH_ENABLED`. A visual, dimensional, field, lexicon, placement,
template-checksum or version change returns to `TEMPLATE_APPROVAL_REQUIRED`.
Dynamic-data validation remains mandatory for every item. Kill switches, quotas,
pause/revoke and delivery reconciliation are database/runtime gates, not Admin
convenience flags.

## External delivery

External Instagram dispatch is disabled. Do not use an Instagram password, browser automation or an unapproved credential. A Meta integration requires a separate security review, controlled test and explicit owner approval for the exact publication.

Before any future outbound worker exists, it must use the fenced dispatch claim, re-read/decode/re-hash the exact private object immediately before the network call, reattest the current generation/source/health, and treat an expired or interrupted claim as `DELIVERY_UNKNOWN` pending reconciliation rather than retrying blindly.

Executable references: [`TouchlineSocialDraftReviewActions.tsx`](../../../components/touchline/admin/TouchlineSocialDraftReviewActions.tsx), [`social-publication-contract.ts`](../../../lib/touchlineArena/social-publication-contract.ts), migration candidate [039](../../../supabase/qa/039_touchline_qa_social_approval_outbox.sql).

The durable executor remains a local candidate until a separate second audit and activation decision: [040 migration](../../../supabase/qa/040_touchline_qa_social_draft_executor.sql), [scheduler](../../../scripts/qa/schedule-touchline-social-lineup-drafts.mts), [runner](../../../scripts/qa/run-touchline-social-lineup-draft-queue.mts) and [threat review](DRAFT_EXECUTOR_QA_THREAT_REVIEW.md). The scheduler heartbeat covers discovery; rollback uses the same `executor_cycles` then `generation_jobs` lock order as runtime. No scheduler configuration is included in this stage.
