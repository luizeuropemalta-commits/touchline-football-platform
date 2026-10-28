-- QA installation only, deliberately outside automatic migrations.
-- Installs PAUSED. Activation requires the exact QA release, worker SQL,
-- dedicated matching Vault/server secret, authenticated smoke and observed
-- provider quota/freshness proof. Does not activate or edit live-sync job 5.
begin;
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $install$
declare
  job_id bigint;
  job_active boolean;
  job_command text := $command$
    do $invoke$
    declare
      refresh_secret text;
      secret_count bigint;
    begin
      perform public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
      select count(*), min(decrypted_secret) into secret_count, refresh_secret
        from vault.decrypted_secrets where name='touchline_qa_roster_reconciliation_refresh_secret';
      if secret_count <> 1 or refresh_secret is null or length(refresh_secret) not between 32 and 512 then
        raise exception 'Roster scheduler secret unavailable';
      end if;
      perform net.http_post(
        url := 'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/football-data/roster-sync',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || refresh_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    end $invoke$;
  $command$;
begin
  if to_regprocedure('public.touchline_roster_action(text,jsonb,text,jsonb)') is null then
    raise exception 'Roster workflow migration required';
  end if;
  -- Serialize installers without holding an execution lease or touching data.
  perform pg_advisory_xact_lock(hashtextextended('touchline-qa-golden-boot-scheduler-install',0));
  if (select count(*) from cron.job where jobname='touchline-qa-roster-reconciliation') > 1 then
    raise exception 'Duplicate Roster scheduler jobs require review';
  end if;
  select jobid,active into job_id,job_active from cron.job where jobname='touchline-qa-roster-reconciliation';
  if job_active then raise exception 'Active Roster scheduler requires controlled pause before replacement'; end if;
  if job_id is null then
    job_id := cron.schedule('touchline-qa-roster-reconciliation','15 */6 * * *',job_command);
  end if;
  perform cron.alter_job(job_id := job_id, schedule := '15 */6 * * *', command := job_command, active := false);
end $install$;
commit;

-- Capture only; never decides, applies, publishes, or changes editorial prices.
-- Wire Vault secret to TOUCHLINE_ROSTER_CRON_SECRET in the authorized QA target.
-- Both SQL policy and TOUCHLINE_ROSTER_RECONCILIATION_ENABLED remain OFF.
-- 40 cold provider attempts per capture, plus bounded retries, each quota guarded.
-- A UTC six-hour request identity prevents repeat HTTP for an already claimed slot.
