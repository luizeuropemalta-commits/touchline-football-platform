-- QA-only rollback. Retains canonical scores/history but disables the writer
-- and removes only the live metadata columns introduced by package 014.

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'touchline-qa-live-sync';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  delete from vault.secrets
  where name in ('touchline_qa_live_sync_url', 'touchline_qa_live_sync_secret');
end
$$;

drop function if exists public.touchline_configure_qa_live_scheduler(text, text, text);
drop index if exists public.football_fixtures_live_status_idx;
alter table public.football_fixtures drop constraint if exists football_fixtures_live_minute_check;
alter table public.football_fixtures drop constraint if exists football_fixtures_live_second_check;
alter table public.football_fixtures drop constraint if exists football_fixtures_events_count_check;
alter table public.football_fixtures drop column if exists provider_state_id;
alter table public.football_fixtures drop column if exists live_minute;
alter table public.football_fixtures drop column if exists live_second;
alter table public.football_fixtures drop column if exists live_period;
alter table public.football_fixtures drop column if exists events_count;
alter table public.football_fixtures drop column if exists provider_updated_at;
