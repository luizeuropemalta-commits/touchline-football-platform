# Club Social Feed 045 — local threat review

Status: **first local validation; independent second audit required**
Remote state: **not applied, not scheduled, not deployed**

## Protected assets

- immutable 039–044 DRAFT identity and approved artefact bytes;
- canonical factual `source_checksum` and source-revision checksum;
- exact club fan-out identities;
- private Storage locators and signed read URLs;
- active-feed visibility, retention evidence and executor leases.

## Trust boundaries

The browser never calls a database table or mutation directly. A server-only
reader invokes the bounded read RPC with the service role and converts private
object locators into short-lived signed URLs. The scheduler and runner are
separate server-only processes and accept only the exact canonical QA Supabase
origin. OWNER observability uses a dedicated bounded telemetry RPC; it does not
restore direct table access or disclose live lease tokens. All 045 tables use FORCE RLS, have direct DML
revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`, and mutate
only through narrowly granted SECURITY DEFINER functions with an empty
`search_path`.

## Threats and controls

| Threat | Control in the local candidate |
|---|---|
| DRAFT or stale content reaches ClubHub | Enqueue and completion independently require both component approvals, exact approved artefact/caption/manifest checksums, current source revision and content-type-specific target resolution. |
| Cross-club disclosure | Expected provider team IDs are derived in SQL from the canonical draft/fixture/season; caller-supplied targets must match exactly. Club reads filter through the immutable post/club reference. |
| Media duplication or overwrite | Fan-out stores one source-draft reference and club reference rows only; no Storage upload or object copy exists in 045. |
| Duplicate execution | Unique source draft job, canonical scope uniqueness, transactional completion, advisory locks, leases and exact fence tokens. |
| Stale worker mutates state | Renewal/completion require current scheduler, runner and job lease tokens with unexpired deadlines. |
| Unbounded cost/read amplification | Page size is capped at 12, cursor is stable timestamp+UUID, jobs and retention batches are bounded, and the server reader is the only public-data path. |
| Service-role key reaches a different host | Executor accepts only `https://xgxbwqxjssxxuihuwmgy.supabase.co/`, with no alternate port, userinfo, path, query or fragment. |
| Admin telemetry bypasses RLS or exposes a fence | Direct table privileges stay revoked. The service-role-only RPC returns at most 50 jobs and 12 posts, fixed counts and a boolean-like active-lease marker rather than the token. |
| Public provider/internal wording | Timeline adapter removes hashtags and channel-specific wording; SQL rejects provider/API/Instagram/testing language. Public UI says `TouchLine Verified`. |
| Retention deletes football history | Only 045 post/reference rows are hard-deleted after exactly 14 days. The job archives the post UUID and a minimal tombstone retains identity/checksum/timestamps/reason. DRAFTs, cards, ratings, settlements and fixture evidence are untouched. |
| Rollback destroys evidence | Rollback fails closed when a lease is active or any 045 post, reference, job or tombstone remains. It drops only an empty 045 schema and proves 044 unchanged in shadow. |
| Unmoderated interaction | Comments, reactions and UGC are absent and must remain disabled pending a separate contract. |

## Residual activation gates

1. Independent review of SQL, server reader, ClubHub UI and executor.
2. Query-plan/load evidence with representative feed volume.
3. Browser validation in Chromium, WebKit and Safari, including landscape and
   public/OWNER boundaries.
4. Exact preimage/rollback and shared-QA operational authorisation.

No migration, shared-QA write, scheduler configuration, Vercel action,
Production change or external social delivery is authorised by this document.
