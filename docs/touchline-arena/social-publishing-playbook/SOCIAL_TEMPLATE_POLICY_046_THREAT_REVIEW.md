# Module 046 — template policy threat review

Status: **local candidate awaiting independent second audit**
Remote state: **not applied**
Outbound: **absent and disabled**

## Security boundary

Module 046 approves one exact visual and one exact British-English copy source
for a versioned template. It does not approve football facts, source revisions,
cards, scores, line-ups or rankings. Every generated item continues through the
current 039–044 source, generation, immutable-media and approval gates before it
can become an internal policy candidate.

| Threat | Control | Fail-closed result |
|---|---|---|
| Reuse a version after visual/copy/lexicon change | SHA-256 identity binds content type, placement, locale, dimensions, rendered fields, source checksums and `templateVersion` | Registration rejects version reuse; OWNER must review a new version |
| Approve a different exemplar than the one reviewed | Intent binds template identity, content checksum and approved exemplar manifest; artwork route re-reads and rehashes the exact private object | Approval rejected |
| Bypass OWNER through a browser RPC | Intent issuance is service-role-only; consumption requires authenticated OWNER UUID and a one-use, five-minute intent | Request rejected |
| Template approval authorises stale or invented sports data | Registration, intent, approval and item evaluation recheck current canonical source plus the exact completed generator job | No candidate |
| Replaced/truncated media passes | Server-only Storage read validates locator, byte length, full PNG/JPEG decode, dimensions and SHA-256 | No visual approval or item candidate |
| Duplicate automatic item | Idempotency binds draft UUID/revision, template identity, source revision, manifest, artifact and caption checksums | One candidate per exact draft revision |
| Pause or revocation leaves eligible work behind | State transition atomically moves matching `READY` candidates to `BLOCKED` | No stale eligibility |
| Kill switch races evaluation | Delivery-control row and candidate are locked; engaging global/per-type control atomically blocks matching `READY` candidates | No stale eligibility |
| Switch release silently restores an old item | A blocked item returns to `READY` only after the executor rehashes and reevaluates all current gates | Remains blocked until fresh proof |
| Flood or policy collision | Global and per-content quotas plus Feed minimum-gap checks precede eligibility | Candidate is `BLOCKED` |
| Ambiguous previous delivery is retried | Existing 039 `DELIVERY_UNKNOWN` count is surfaced; 046 contains no retry or connector | Operator-visible, no outbound |
| Direct table mutation or data exfiltration | Six tables use FORCE RLS, no table DML grants, guarded transitions and immutable audit rows | Database rejects mutation/read |
| Production or wrong QA target | Exact QA project/URL and disabled-by-default executor boundary | Process exits before reads/writes |

## Lock and state order

Canonical order is source revision → template/candidate advisory lock → row
locks → control rows. Human transitions and evaluator mutations occur only in
their SECURITY DEFINER functions with an empty `search_path`. The durable
REGISTRY/EVALUATOR cycles use fenced leases, heartbeat, timeout and bounded
backoff. A stale lease cannot complete a newer cycle.

## Residual boundary

`READY` means only that the internal policy was satisfied at evaluation time.
It must never be interpreted as delivered or placed into the 039 dispatch
outbox. A future destination adapter needs its own audited claim, current-source
revalidation, quota reservation, delivery reconciliation, official Meta
credentials and terminal `DELIVERY_UNKNOWN` handling. None of that is present or
authorised in module 046.

## Local evidence required before remote consideration

- focused contract/executor/Admin tests;
- fresh PostgreSQL 17 shadow applying 039→046 and rolling back 046→039;
- real FORCE RLS/grant checks and direct-mutation rejection;
- separate OWNER artwork/copy approval and intent-boundary tests;
- exact artifact rehash, idempotency, kill-switch and pause/resume tests;
- rollback refusal for active lease/non-empty state and preservation of 039–045;
- TypeScript, ESLint, full suite, build, governance and independent security diff.
