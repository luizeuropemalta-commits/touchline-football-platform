# QA avatar retention scheduler — local implementation, not activated

Mission: bridge pg_net JSON POST to the existing bodyless retention worker. Scope: three new source/test files only plus this runbook. No remote mutation or deploy. Existing worker authentication, discovery, eligibility and deletion protections remain unchanged. Rollback: unschedule the new job and disable its dedicated gate; do not weaken worker authentication.

## Why this exists

The deployed worker being ACTIVE does not schedule execution. Its POST contract deliberately rejects `{}`, while pg_net sends JSON. The scheduler accepts only an empty JSON object and calls the fixed QA worker with a bodyless POST. The database holds only a trigger credential, never the privileged service-role credential. Caller input cannot set an operation, target, age, or deletion policy.

## Activation gates (owner execution, not done by this change)

1. Independently review the implementation and deployed worker contract. Inspect all currently eligible operations and candidates, not just the VIP fixture. Confirm current-revision protection and QA project binding.
2. Generate a random 32-byte base64url trigger credential privately. Store the same value as Edge `TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_SECRET` and Vault `avatar_retention_scheduler_secret`. Do not print it or commit it. Edge must retain its existing valid QA service-role binding.
3. Deploy only the new `touchline-avatar-retention-scheduler` endpoint with platform JWT verification OFF because it performs its own constant-time trigger authentication. Keep the existing `touchline-avatar-retention` JWT verification ON. New scheduler flag `TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_ENABLED` defaults OFF; enable after authentication smoke checks. Existing worker enabled flag remains independently required.
4. Invoke the scheduler once with `{}` and the trigger header. Verify discovery/candidate journals and Storage outcomes, including old object absent and current object readable. Do not infer deletion from HTTP 200 alone.
5. Only after the single invocation passes, register the job below in canonical QA. Inspect pending pg_net requests before enabling; never register duplicate jobs. Observe at least two actual scheduled cycles and journal advancement. No timestamp backdating or fixture resets.

Supabase warns that pending pg_net request headers are visible to database login roles; this is why the queue must carry only the dedicated trigger credential. Its capability is still retention execution, so rotate/revoke it if exposed. It cannot select objects or bypass minimum age/current-photo protections.

```sql
-- Canonical QA only. Run after the prior gates, with the Vault secret provisioned.
select cron.schedule(
  'touchline-qa-avatar-retention',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://xgxbwqxjssxxuihuwmgy.supabase.co/functions/v1/touchline-avatar-retention-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-touchline-avatar-retention-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'avatar_retention_scheduler_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000
  );
  $job$
);
```

Expected maximum inactivity before old-photo discovery is approximately the worker's five-minute eligibility delay plus the five-minute cadence; deletion may require additional cycles under pagination/load. This is eventual cleanup, not instant replacement deletion. Per-isolate exclusion is not a distributed mutex; database leases remain authoritative. Request failure is not proof of zero writes. Investigate journals before retrying an ambiguous request.

## Evidence and remaining gates

Focused adapter tests: 8 PASS (fixed bodyless forwarding; bad auth/input; disabled/misbound/drift configuration; upstream errors; concurrency). Existing worker unmodified. Reader cleanup releases its lock after cancellation. Explicit Origin/query/media-type rejection, stalled-stream cancellation and actual entrypoint authority/fallback/drift tests passed. Targeted TypeScript and ESLint passed; combined scheduler + existing server/entrypoint suite: 21 PASS. Full project build, independent review, Edge deployment, Vault/secret configuration, cron registration and two-cycle remote verification remain parent release gates. UI/mobile not applicable to this backend-only change. Production NOT TOUCHED. Remote builds consumed: 0.

Sources: https://supabase.com/docs/guides/functions/schedule-functions and https://supabase.com/docs/guides/functions/auth (consulted 2026-11-02).

## Activation preflight 2026-11-02 — not activated

QA inventory inspected: two committed VIP operations; revision 1 has one retention candidate and an accepted attempt at 18:36:28 UTC; revision 2 is current and has no candidate. Parent independently verified old object absent (Storage HTTP 400 with NoSuchKey/404 body) and current object readable (200, image/webp, 59,318 bytes). No other operations were present. Scheduler secret names are absent from Edge configuration. CLI read-only secret-name/digest inventory succeeded; no secret values were printed. Focused scheduler suite rerun: 8 PASS, 0 FAIL, 0 SKIP.

Activation remains NO-GO: AGENTS.md explicitly requires complete suite, production build and clean-worktree validation for critical changes; touchline-release-preflight requires full tests and build before deployment. Parent confirms there is no current global build approval; prior broad suite had capacity failures and skips. Focused adapter tests do not replace those gates. No Edge deployment, secret/Vault mutation, invocation or cron registration was performed. Production untouched; Vercel builds consumed: 0.

An isolated worktree preparation at `../qa-avatar-scheduler-20261102` stalled before completion and its owned Git processes were interrupted; that partial worktree is NOT release authority. Do not deploy from it. Next owner step: resolve release gates and package/commit exact scheduler manifest with existing configuration helper, then execute gate-OFF/auth smoke/gate-ON/single-run/cron/two-cycle protocol above.
