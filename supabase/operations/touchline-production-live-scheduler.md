# Retained-data Production scheduler — operator gate

Preparation only; this file does not authorize remote execution. No migration
runner may include the adjacent SQL. It creates no app-callable privileged
function and changes no customer, XI, scoring, credential or schema records.

## Target and prerequisites

1. Obtain explicit release/cutover authority and fresh control-plane proof that
   the connection is project `xgxbwqxjssxxuihuwmgy`. Observed cluster fingerprint:
   `7666007964130682852`; retained season UUID:
   `1e83121b-b778-459b-b9a0-7cf1eaff5729`. SQL checks both. These are wrong-target
   tripwires, **not proof against physical clones**. A changed identity means
   stop and independently review, not edit the expected value to bypass it.
2. Verify installed `pg_cron` 1.6.4 (`cron.alter_job` supports `active`), `pg_net`
   0.20.4 and Vault 0.3.1, operator is `postgres`, and cron inventory contains
   only the known QA writer (and optionally the exact prepared Production job).
   Inventory includes disabled jobs; reconcile unknown/duplicate writers first.
3. Separately securely provision Vault name `touchline_production_live_sync_secret`
   matching the independently authorized Production sync credential. Never copy
   the Preview secret, put the value in SQL, logs, screenshots or this document.
   The SQL only reads that name and validates nonblank length/whitespace.
4. Prove the exact approved candidate serves `https://touchline.com.br`, bound to
   the retained database and correct project/org. Production sync runtime gate
   remains OFF until explicitly authorized. This script does not set it.
5. Freeze manual sync invocations, Dashboard cron edits, direct `cron.schedule` /
   `cron.alter_job` calls and other scheduler operators during handover. Review the
   actual lease RPC uses `hashtextextended('touchline-live-sync:sportmonks:live_scores',0)`.
   Capture nonsecret cron/lease state and existing customer-data preimage.

The operator takes the transaction-scoped advisory lock
`hashtextextended('touchline-live-sync:scheduler-operator',0)` before inspecting
cron inventory. A competing invocation using this same protocol fails with
`TL_SCHEDULER_OPERATOR_BUSY`; retry only after inspecting the other operation.
This is cooperative coordination, not a lock on `cron.job`: unrelated Dashboard
or direct API edits do not honor it and must remain frozen until postflight.
The managed `postgres` role needs read access and official cron API permission,
not table UPDATE/LOCK grants. Never escalate privileges to make a table lock work.
The separate writer lease lock remains required for prepare/activate; pause and
emergency disable intentionally do not wait for an active writer.

## Separate explicit invocations

For each authorized step, select ONE action in the same database session, then
execute the entire adjacent `.sql` file. There is no default action. Example:

```sql
select set_config('touchline.operator.action', 'prepare', false);
```

- `pause-qa`: disables only `touchline-qa-live-sync`. Does not cancel an already
  queued HTTP request. Wait for cron runs, pg_net queue/in-flight requests and
  provider sync runs to drain. Check again across a scheduler interval. Keep
  manual writers frozen. Do not infer drain from cron alone: its HTTP enqueue
  can finish before the HTTP request/lease begins.
- `prepare`: requires QA already inactive and no running sync/cron records;
  refuses even stale `running` records until independently investigated. Creates
  Production job and disables it **in one transaction**. Repeating verifies the
  exact disabled job, never overwrites drift or disables QA implicitly.
- `activate`: separate authorization after candidate/browser/auth/data smoke,
  gate activation and secure credential comparison. Requires disabled QA and
  no active writer, then enables only the exact prepared Production job.
- `disable-production`: rollback stops future Production ticks even if a sync
  is in flight or secret is unavailable. It does not delete jobs, history,
  columns, data or automatically reactivate QA. Wait for in-flight work to end.

Failures roll back the SQL transaction. Before retry, explicitly select the
desired action again; do not blindly rerun after error. No key values are printed.

## Postflight and remaining runtime evidence

Inspect only job name, ID, active flag, schedule, database and owner. Exactly one
writer may be active after cutover. Verify cron outcomes, HTTP status, protected
sync result and latest provider fixture timestamps/points; enqueued HTTP is not
success. Investigate stale running rows without automatically marking success.
Preserve old candidate/data until release verification independently passes.

Local tests execute real PostgreSQL PL/pgSQL in PGlite with minimal fake cron,
Vault and control-system readers because these extensions/cluster identity are
unavailable there. They cannot prove scheduler wakeup, pg_net execution, remote
credential correctness or multi-session race behavior. Fresh remote operator
preflight/postflight remains mandatory; this preparation is not a deployment.

Reference: [Supabase Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).
