-- OPERATOR ONLY. Not a migration. No action is selected by this file.
-- Read the adjacent runbook before invoking in the verified retained project.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog;
do $operator$
declare
  action text := current_setting('touchline.operator.action', true);
  qa cron.job%rowtype;
  prod cron.job%rowtype;
  new_job_id bigint;
  production_command constant text := $job$
do $tick$
declare bearer text;
begin
  if (select count(*) from vault.decrypted_secrets where name = 'touchline_production_live_sync_secret') <> 1 then
    raise exception 'TL_PRODUCTION_SYNC_SECRET_INVALID';
  end if;
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'touchline_production_live_sync_secret';
  if bearer is null or length(bearer) < 32 or bearer ~ '[[:space:]]' then
    raise exception 'TL_PRODUCTION_SYNC_SECRET_INVALID';
  end if;
  perform net.http_post(
    url := 'https://touchline.com.br/api/football-data/live-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || bearer),
    body := '{}'::jsonb, timeout_milliseconds := 50000);
end $tick$;
$job$;
begin
  if action is null or action not in ('pause-qa','prepare','activate','disable-production') then
    raise exception 'TL_SCHEDULER_ACTION_REQUIRED';
  end if;
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'TL_SCHEDULER_OPERATOR_REQUIRED';
  end if;
  -- Observed control-system identity, not a caller-supplied project assertion.
  -- Physical clones can share this identity: control-plane check remains mandatory.
  if (select system_identifier::text from pg_catalog.pg_control_system()) is distinct from '7666007964130682852'
     or not exists (select 1 from public.football_seasons where id = '1e83121b-b778-459b-b9a0-7cf1eaff5729'::uuid) then
    raise exception 'TL_SCHEDULER_TARGET_MISMATCH';
  end if;
  -- Managed pg_cron permits SELECT plus its official mutation APIs, not a
  -- strong table lock. Serialize cooperating operator invocations separately
  -- from the writer lease so emergency pause remains possible during a run.
  -- This does not lock out Dashboard/direct cron API edits: freeze those first.
  if not pg_try_advisory_xact_lock(hashtextextended('touchline-live-sync:scheduler-operator',0)) then
    raise exception 'TL_SCHEDULER_OPERATOR_BUSY';
  end if;
  if (select count(*) from cron.job where jobname = 'touchline-qa-live-sync') <> 1
     or (select count(*) from cron.job where jobname = 'touchline-production-live-sync') > 1
     or exists (select 1 from cron.job where
       (jobname ilike '%live%sync%' or command ilike '%live-sync%' or command ilike '%live_sync%')
       and jobname not in ('touchline-qa-live-sync','touchline-production-live-sync')) then
    raise exception 'TL_SCHEDULER_JOB_INVENTORY';
  end if;
  select * into qa from cron.job where jobname = 'touchline-qa-live-sync';
  select * into prod from cron.job where jobname = 'touchline-production-live-sync';
  if qa.database <> current_database() or qa.username <> 'postgres'
     or (prod.jobid is not null and (prod.database <> current_database() or prod.username <> 'postgres')) then
    raise exception 'TL_SCHEDULER_JOB_OWNER';
  end if;
  -- Pause/rollback never unschedule, delete history or terminate a live request.
  if action = 'pause-qa' then
    perform cron.alter_job(qa.jobid, active := false);
  elsif action = 'disable-production' then
    if prod.jobid is null then raise exception 'TL_SCHEDULER_PRODUCTION_MISSING'; end if;
    perform cron.alter_job(prod.jobid, active := false);
  else
    if qa.active then raise exception 'TL_SCHEDULER_QA_ACTIVE'; end if;
    if prod.active then raise exception 'TL_SCHEDULER_PRODUCTION_ACTIVE'; end if;
    -- Same lock as the installed writer lease; never fabricate/acquire a run.
    if not pg_try_advisory_xact_lock(hashtextextended('touchline-live-sync:sportmonks:live_scores',0)) then
      raise exception 'TL_SCHEDULER_WRITER_ACTIVE';
    end if;
    if exists (select 1 from cron.job_run_details where jobid in (qa.jobid,prod.jobid)
       and status in ('starting','running','connecting','sending'))
       or exists (select 1 from public.football_data_sync_runs
         where provider='sportmonks' and sync_type='live_scores' and status='running') then
      raise exception 'TL_SCHEDULER_WRITER_ACTIVE';
    end if;
    if (select count(*) from vault.decrypted_secrets where name='touchline_production_live_sync_secret') <> 1
       or not exists (select 1 from vault.decrypted_secrets where name='touchline_production_live_sync_secret'
         and length(decrypted_secret)>=32 and decrypted_secret !~ '[[:space:]]') then
      raise exception 'TL_SCHEDULER_SECRET_INVALID';
    end if;
    if prod.jobid is not null and (prod.command is distinct from production_command or prod.schedule <> '* * * * *') then
      raise exception 'TL_SCHEDULER_PRODUCTION_DRIFT';
    end if;
    if action = 'prepare' and prod.jobid is null then
      new_job_id := cron.schedule('touchline-production-live-sync','* * * * *',production_command);
      perform cron.alter_job(new_job_id, active := false);
      if not exists(select 1 from cron.job where jobid=new_job_id and not active) then
        raise exception 'TL_SCHEDULER_DISABLE_FAILED';
      end if;
    elsif action = 'activate' then
      if prod.jobid is null then raise exception 'TL_SCHEDULER_PRODUCTION_MISSING'; end if;
      perform cron.alter_job(prod.jobid, active := true);
    end if;
  end if;
  perform set_config('touchline.operator.action','',false);
end $operator$;
commit;
