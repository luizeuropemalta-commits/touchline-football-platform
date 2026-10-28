-- QA only; intentionally not an automatic migration. Installs a PAUSED job.
-- Requires exact release/schema smoke before separate authorized activation.
begin;
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
do $install$
declare job_id bigint; job_active boolean;
 command text := $command$
 do $invoke$
 declare token text; total bigint;
 begin
  perform public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
  select count(*),min(decrypted_secret) into total,token from vault.decrypted_secrets where name='touchline_qa_company_alert_job_secret';
  if total<>1 or token is null or length(token) not between 32 and 512 then raise exception 'Company alert scheduler secret unavailable'; end if;
  perform net.http_post(
   url:='https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/internal/company-finance/alerts/run',
   headers:=jsonb_build_object('Content-Type','application/json','x-touchline-job-secret',token),
   body:=jsonb_build_object('runId',gen_random_uuid(),'today',(clock_timestamp() at time zone 'UTC')::date,'horizonDays',30),
   timeout_milliseconds:=50000);
 end $invoke$;
 $command$;
begin
 if to_regprocedure('public.touchline_company_generate_admin_alerts(uuid,date,integer)') is null then raise exception 'Company alert migration required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('touchline-qa-company-alert-scheduler-install',0));
 if (select count(*) from cron.job where jobname='touchline-qa-company-alerts')>1 then raise exception 'Duplicate company alert scheduler'; end if;
 select jobid,active into job_id,job_active from cron.job where jobname='touchline-qa-company-alerts';
 if job_active then raise exception 'Pause active company alert scheduler before replacement'; end if;
 if job_id is null then job_id:=cron.schedule('touchline-qa-company-alerts','20 7 * * *',command); end if;
 perform cron.alter_job(job_id:=job_id,schedule:='20 7 * * *',command:=command,active:=false);
end $install$;
commit;
-- Vault token must match TOUCHLINE_COMPANY_ALERT_JOB_SECRET, server only.
-- SQL company alert gate stays OFF. No email/push/bank execution.
