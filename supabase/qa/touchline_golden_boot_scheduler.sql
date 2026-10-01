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
        from vault.decrypted_secrets where name='touchline_qa_golden_boot_refresh_secret';
      if secret_count <> 1 or refresh_secret is null or length(refresh_secret) not between 32 and 512 then
        raise exception 'GoldenBoot scheduler secret unavailable';
      end if;
      perform net.http_post(
        url := 'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/touchline-awards/golden-boot/refresh',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || refresh_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    end $invoke$;
  $command$;
begin
  if to_regprocedure('public.try_begin_touchline_golden_boot_worker(uuid,uuid,uuid)') is null
    or to_regprocedure('public.complete_touchline_golden_boot_worker(uuid,bigint,text,boolean,timestamp with time zone)') is null then
    raise exception 'GoldenBoot worker migration required';
  end if;
  -- Serialize installers without holding an execution lease or touching data.
  perform pg_advisory_xact_lock(hashtextextended('touchline-qa-golden-boot-scheduler-install',0));
  if (select count(*) from cron.job where jobname='touchline-qa-golden-boot-refresh') > 1 then
    raise exception 'Duplicate GoldenBoot scheduler jobs require review';
  end if;
  select jobid,active into job_id,job_active from cron.job where jobname='touchline-qa-golden-boot-refresh';
  if job_active then raise exception 'Active GoldenBoot scheduler requires controlled pause before replacement'; end if;
  if job_id is null then
    job_id := cron.schedule('touchline-qa-golden-boot-refresh','30 seconds',job_command);
  end if;
  perform cron.alter_job(job_id := job_id, schedule := '30 seconds', command := job_command, active := false);
end $install$;
commit;

-- This is a wake interval, not authorization for a provider call. Durable
-- worker admission controls due time/cooldown and denies concurrent owners.
-- 60s evidence validity is unchanged. Provider outage/unknown quota can leave
-- the award unavailable; never extend stale evidence to hide that condition.
