# Audit and rollback

## Evidence required per draft

- fixture/team/content/placement/locale/template/revision identity;
- source version, source checksum, first observed time, snapshot time and generation latency;
- decoded width/height/MIME and final-byte SHA-256;
- immutable private bucket/key and optional ETag;
- caption checksum and manifest checksum;
- separate artwork/caption approver, timestamp and approved checksum;
- generation, approval, enqueue, claim, retry and terminal-state audit rows;
- browser evidence at final resolution: safe zones, contrast, no clipping/overflow, all assets loaded, no public provider wording.

## Verification sequence

1. Focused contract/storage/SQL tests.
2. Disposable fresh PostgreSQL shadow: migration, grants/RLS, immutability, one-use intent replay/expiry, artwork/caption approval races, concurrent enqueue, claim expiry/invalidation, retry and rollback.
3. Security diff and threat-model review.
4. Full tests, TypeScript, ESLint, build, governance and release-readiness.
5. Exact QA Preview only after independent approval.
6. Chromium, WebKit and native Safari Admin review; no external dispatch.

## Rollback

Use the audited [039 rollback](../../../supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql) only under its guards. It must fail closed when outbox/audit state would be destroyed. Stop schedulers, prove leases idle, preserve the preimage/backup and exact object identities, execute the rollback, verify schema/storage state, then resume only after approval.

Content-addressed media must not be overwritten. Removing an unreferenced QA object is a separate, explicit, auditable storage action; database rollback does not imply deleting media.

Current constraint: migration 039 and shared-QA activation are not authorised by this documentation. Production and Instagram remain out of scope.

## Evidence gaps that remain explicit

- The disposable PostgreSQL 17.11 harness proves two-connection artwork/caption approval, concurrent enqueue, source-change/claim fencing, semantic dependency isolation and rollback. Shared-QA runtime remains unproven.
- Every state-changing RPC follows one canonical lock order: semantic source key, generation identity, draft identity, then dispatch attempt. The shadow observes granted and waiting advisory locks through `pg_locks` while enqueue and claim run in separate sessions; it does not rely on timing alone or pre-acquire those locks on behalf of the RPCs.
- Source revisions are keyed by the semantic renderer dependency, not merely by table row. The shadow covers each of the 19 renderer relations independently, including fixture/provider-key changes and SportMonks-to-other-provider reclassification of both the old and new identities. Static caller/reader tests prove that player season statistics are read by the exact canonical fixture competition/season; the shadow separately proves that updating an unrelated same-competition row marked current does not invalidate that fixture-scoped draft.
- The migration-time approver snapshot still requires an exact OWNER-only shared-QA manifest (UUID, normalised email and count) plus independent comparison before shared QA. Copying every current platform owner is not by itself independent attestation.
- Supabase `service_role` and Storage remain in the trusted computing base. Create-only adapter policy prevents ordinary overwrite, while byte re-hash detects mutation; it does not make a compromised privileged credential incapable of deleting bytes.
- No external publisher exists. Dispatch claim/recovery code is a dormant contract and cannot be treated as an operational Instagram proof.
- The candidate assigns transactional source revisions to all 19 tables currently read by the LINE-UP renderer, including player and coach ranking snapshots. Adding any renderer dependency without a source-key trigger is a release blocker; external delivery remains blocked independently.
