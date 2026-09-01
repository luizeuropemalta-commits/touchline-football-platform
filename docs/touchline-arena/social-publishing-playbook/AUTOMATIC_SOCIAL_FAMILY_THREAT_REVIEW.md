# Automatic social family — threat review

Scope: local designs 041–046. Shared QA, Production and outbound delivery are
outside this review until a separately frozen candidate passes its own audit.

| Threat | Boundary/control | Fail-closed outcome |
|---|---|---|
| A module borrows facts from another fixture/type | Typed content registry, exact fixture/Gameweek scope and per-type reader | No DRAFT; `REVIEW_REQUIRED` |
| Manual player/event override changes the story | Selectors accept canonical scope only; ranking/event identities are derived server-side | Input rejected |
| Ranking and membership disagree | Same snapshot plus exact provider/canonical player and current team membership | No club leader/card |
| Preview leaks speculative XI | MATCH PREVIEW payload has no XI/bench/formation fields and renderer tests forbid those labels | Render rejected |
| Stale data is approved | Source-revision checksum locked with the generation job and rechecked during intent/approval | Approval rejected |
| Later module changes frozen 039/040 | Separate forward migration/worktree/commit and security diff | Candidate audit fails |
| Event posted during VAR/pending | Confirmed event state and debounce/reconciliation gate in module 043 | No Story |
| “Final” before all facts reconcile | FINISHED plus score/event/settlement reconciliation in 042/044 | No final artefact |
| Template approval permits bad dynamic data | Module 046 template identity is independent from per-item source gates | Item remains blocked |
| Template changes without new OWNER review | Template checksum covers dimensions, fields, base copy/lexicon, placement and version | State returns to `TEMPLATE_APPROVAL_REQUIRED` |
| Automatic flood or duplicate delivery | Idempotency identity, global/per-type kill switch, quotas, bounded retries and immediate pause | Internal candidate refuses or pauses; no outbound exists |
| Delivery timeout causes blind retry | Exact delivery claim plus reconciliation; ambiguous result becomes terminal `DELIVERY_UNKNOWN` | No automatic retry |
| Credential/PII leak | Server-only secret store, sanitised codes, private Storage and no public provider wording | Process exits; no artefact/outbound |
| Timeline duplicates media or leaks drafts | One canonical artefact with club references; only approved/published rows; RLS and bounded pagination | Public query returns nothing |
| Retention destroys audit or football truth | Timeline lifecycle is isolated from canonical facts; minimal audit tombstone preserved | Cleanup refuses unsafe delete |

## Required independent evidence

Each numbered module must prove exact forward/rollback migration in a fresh
PostgreSQL shadow, RLS/grants, concurrency and stale-source races, immutable media
identity, executor recovery, browser dimensions/overflow, copy guard, Admin
visibility and no outbound import/path. Module 046 additionally needs OWNER
template approval/revocation races, kill-switch precedence, quota exhaustion,
delivery reconciliation and `DELIVERY_UNKNOWN` tests before any Meta integration
is considered.

The detailed local 046 review is maintained in
`SOCIAL_TEMPLATE_POLICY_046_THREAT_REVIEW.md`.
