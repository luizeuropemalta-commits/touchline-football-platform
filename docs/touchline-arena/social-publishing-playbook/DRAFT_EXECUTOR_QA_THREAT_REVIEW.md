# Durable DRAFT executor — QA threat and risk review

Status: **local candidate 040; second audit required; not applied or scheduled**
Reviewed: 2026-08-31 (Europe/Malta)

## Objective and non-goals

The executor observes persisted official team sheets, queues an exact immutable source revision and creates only a `DRAFT` through the already reviewed 039 generator/storage contract. It does not approve artwork, approve copy, enqueue an Instagram delivery, call Meta, configure a scheduler or touch Production.

## Runtime boundary

1. A finite authenticated scheduler process uses the QA service role only after proving the exact QA project ref, Supabase ref and stable QA host. It reads persisted official source data and the protected first-party render-source endpoint.
2. The scheduler acquires a singleton fenced lease, starts a 30-second heartbeat before discovery, and enqueues an exact fixture/team/template/input/source-revision identity. Every renewal has an explicit 15-second abort deadline, well below the two-minute lease. Discovery may perform protected reads for longer than the original lease, so the heartbeat covers discovery as well as queueing. Incomplete data is recorded as `REVIEW_REQUIRED`; it is never rendered with a fallback.
3. A separate finite runner acquires its own singleton lease and one queue job. It spawns the existing renderer outside every HTTP request path, passes only the exact queued identity and continuously renews both leases.
4. The renderer creates immutable private bytes and a 039 `DRAFT`. The runner accepts completion only when the generated review and draft match the queued checksums and current source revision.
5. The owner-only Admin reads scheduler, runner and job health as a UX preflight. The database is the approval authority: review-intent creation and each artwork/caption approval transition atomically lock and revalidate both healthy 040 components plus the exact `COMPLETED` job before accepting the transition.

No application route imports Playwright, Chromium, the scheduler, runner or generator. Browser rendering is isolated to the finite runner child process. The scheduler/runner environment is never serialized to a browser or included in logs.

## Protected assets and trust boundaries

- Service-role and render-secret values: server process memory only; presence and scope are validated, values are never printed.
- Official source revision: persisted QA football tables plus the authenticated first-party source projection; no direct provider call and no inferred player/card.
- Immutable artefact: private content-addressed Storage object, revalidated by 039 before artwork approval.
- Human authority: OWNER artwork and caption approvals remain independent one-use 039 transitions.
- External channel: Instagram/Meta credentials and outbound network delivery are absent from this patch.

## Threats and controls

| Threat | Control | Fail-closed result |
| --- | --- | --- |
| Production or wrong project execution | Exact project ref, Supabase hostname, HTTPS stable QA host and `VERCEL_ENV != production` guard | Process exits before a claim/read/write |
| Duplicate scheduler/runner | Advisory locks plus token-fenced singleton leases | Later claimant receives `busy` |
| Scheduler lease expiry during slow discovery | Heartbeat starts immediately after claim and continues through discovery; each renewal is aborted after 15 seconds and failure is surfaced before queueing/completion; stale FAILURE completion is best-effort | The stale scheduler enqueues nothing; lease recovery is observable; a rejected cleanup never masks the original timeout code |
| Duplicate work | Unique fixture/team/content/template/input/source checksum identity | Existing job is reused; no duplicate DRAFT identity |
| Source changes while queued/running | Source-revision current check on enqueue, claim, renew and completion; generator receives expected checksums | Job becomes `SUPERSEDED`, loses renewal or retries without approval |
| Worker crash/hang | Runner/job heartbeats every 30 seconds; each renewal has a 15-second AbortController-backed deadline, plus bounded render timeout, exponential retry and lease-expiry recovery; stale job/runner completion is best-effort | Job returns to retry or `REVIEW_REQUIRED`; a stalled RPC cannot outlive the fence; fence rejection cannot replace the causal runner/job timeout code |
| Retry storm | Five-attempt ceiling and bounded exponential backoff | Exhausted work becomes visible `REVIEW_REQUIRED` |
| Queue/table tampering | FORCE RLS, service-role-only SELECT/RPC, mutation triggers and immutable identity columns | Direct mutations are rejected |
| Secret exfiltration through logs | Sanitised error codes; child stdout/stderr ignored; output contains only service/project/host/result metadata | Raw error detail and secrets never enter process output |
| Browser in request path | No app/lib request path imports executor or renderer; renderer is runner-only | Static gate fails |
| Automatic external publication | 040 has no approve/enqueue-dispatch/claim-dispatch/Meta function | DRAFT remains awaiting separate human approvals |
| Stale approval / preflight TOCTOU | Admin/API provide UX preflight; database triggers atomically lock both 040 components and the exact `COMPLETED` job during review-intent creation and approval | A health/job change between page load, intent and approval is rejected in the database |
| Scheduler enqueue ↔ OWNER review deadlock | All paths use the canonical order `source revision → generation identity → executor cycle → generation job`; two-session intent/enqueue and approval/enqueue races exercise the interleaving | Review fails closed while a scheduler lease is active; enqueue completes without PostgreSQL deadlock |
| Rollback deadlock or active-runtime teardown | Runtime and rollback use the canonical order `executor_cycles` then `generation_jobs`; rollback acquires both locks and rejects any unexpired lease | Rollback waits safely or fails with `TL_SOCIAL_EXECUTOR_040_ROLLBACK_ACTIVE_LEASE` |

## Residual risks and required second audit

- A durable hosting mechanism is deliberately not configured. Cron/queue cadence, credentials and operational ownership require a separate QA-only approval after this patch passes review.
- The legacy `social:watch:qa` command remains available for manual/local diagnostics only. It must be disabled before any durable 040 scheduler is activated; running both mechanisms together is a fail-closed deployment blocker.
- A process may lose its DB lease after completing an external CPU/render step. Exact source/draft checks and content-addressed create-only Storage make replay idempotent, but the next runner must reconcile the job.
- Admin health uses a three-minute freshness budget. The future scheduler cadence must be tighter than that budget and measured in QA.
- Service-role compromise remains high impact inside QA. Deployment must use the existing secret store and least-scoped execution environment; no secret is added by this patch.
- Rollback refuses an active lease and refuses to destroy non-empty executor audit tables. A future applied rollback needs the scheduler/runner paused, the same canonical lock order, and an explicit archival decision; it may not silently erase runs/jobs.

## Validation contract before activation

- Exact 039 + 040 migrations and rollback in a fresh local PostgreSQL 17 shadow.
- RLS/grants, singleton races, discovery beyond two minutes with a concurrent claimant, never-resolving scheduler/runner/job renewals with bounded abort, coherent lease-expiry recovery followed by rejected stale cleanup with the original error preserved, queue idempotence, source mismatch, renewals, timeout recovery, bounded retry, two-session rollback lock order, scheduler-enqueue versus intent/approval races, and intent/approval health/job races.
- TypeScript, ESLint, complete suite, build, governance, release-readiness and security diff.
- Independent second audit of the frozen diff.
- Only after explicit approval: separate commit/push, Git-native QA Preview, then a separate scheduler configuration review. Shared QA, Production and Instagram remain untouched until their own authorisations.
