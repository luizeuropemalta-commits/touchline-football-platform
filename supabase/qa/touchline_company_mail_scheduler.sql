-- QA-only installation, deliberately PAUSED. No OAuth credentials are stored here.
begin;
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
do $install$
declare job_id bigint; job_active boolean;
 command text := $command$
 do $invoke$
 declare secret text; matches bigint;
 begin
  perform public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
  select count(*),min(decrypted_secret) into matches,secret from vault.decrypted_secrets where name='touchline_qa_company_mail_job_secret';
  if matches<>1 or secret is null or length(secret) not between 32 and 512 then raise exception 'Mail scheduler secret unavailable'; end if;
  perform net.http_post(
   url:='https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/internal/company-finance/mail/run',
   headers:=jsonb_build_object('Content-Type','application/json','x-touchline-job-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=50000);
 end $invoke$;
 $command$;
begin
 if to_regprocedure('public.touchline_company_enqueue_mail_scans()') is null then raise exception 'Mail migration required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('touchline-qa-company-mail-install',0));
 if (select count(*) from cron.job where jobname='touchline-qa-company-mail')>1 then raise exception 'Duplicate mail jobs'; end if;
 select jobid,active into job_id,job_active from cron.job where jobname='touchline-qa-company-mail';
 if job_active then raise exception 'Pause active mail job before replacement'; end if;
 if job_id is null then job_id:=cron.schedule('touchline-qa-company-mail','*/5 * * * *',command); end if;
 perform cron.alter_job(job_id:=job_id,schedule:='*/5 * * * *',command:=command,active:=false);
end $install$;
commit;
-- Activation additionally requires matching server secret, app job gate, explicit
-- business-mailbox allowlist/query, verified readonly OAuth and mailbox SQL gate.
