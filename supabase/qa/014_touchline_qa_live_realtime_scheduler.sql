-- QA-only real-time football writer for TouchLine Live, Arena and Club Hub.
-- This file is intentionally outside supabase/migrations so a Production
-- migration runner cannot apply it implicitly.

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.football_fixtures add column if not exists provider_state_id text;
alter table public.football_fixtures add column if not exists live_minute integer;
alter table public.football_fixtures add column if not exists live_second integer;
alter table public.football_fixtures add column if not exists live_period text;
alter table public.football_fixtures add column if not exists events_count integer not null default 0;
alter table public.football_fixtures add column if not exists provider_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_fixtures_live_minute_check'
      and conrelid = 'public.football_fixtures'::regclass
  ) then
    alter table public.football_fixtures
      add constraint football_fixtures_live_minute_check
      check (live_minute is null or live_minute between 0 and 300);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_fixtures_live_second_check'
      and conrelid = 'public.football_fixtures'::regclass
  ) then
    alter table public.football_fixtures
      add constraint football_fixtures_live_second_check
      check (live_second is null or live_second between 0 and 59);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_fixtures_events_count_check'
      and conrelid = 'public.football_fixtures'::regclass
  ) then
    alter table public.football_fixtures
      add constraint football_fixtures_events_count_check
      check (events_count >= 0);
  end if;
end
$$;

create index if not exists football_fixtures_live_status_idx
  on public.football_fixtures (starts_at, status)
  where starts_at is not null;

revoke all privileges on table public.football_fixtures from public, anon, authenticated;
grant select, insert, update, delete on table public.football_fixtures to service_role;

create or replace function public.touchline_configure_qa_live_scheduler(
  p_project_ref text,
  p_url text,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_url_id uuid;
  v_secret_id uuid;
  v_job_id bigint;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_url <> 'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/football-data/live-sync' then
    raise exception 'The live scheduler URL must be the stable QA alias.';
  end if;
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'The live scheduler secret must contain at least 32 characters.';
  end if;

  select id into v_url_id from vault.secrets where name = 'touchline_qa_live_sync_url';
  if v_url_id is null then
    v_url_id := vault.create_secret(p_url, 'touchline_qa_live_sync_url', 'Stable QA live-sync endpoint');
  else
    perform vault.update_secret(v_url_id, p_url, 'touchline_qa_live_sync_url', 'Stable QA live-sync endpoint');
  end if;

  select id into v_secret_id from vault.secrets where name = 'touchline_qa_live_sync_secret';
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, 'touchline_qa_live_sync_secret', 'QA-only bearer for live scheduler');
  else
    perform vault.update_secret(v_secret_id, p_secret, 'touchline_qa_live_sync_secret', 'QA-only bearer for live scheduler');
  end if;

  select jobid into v_job_id from cron.job where jobname = 'touchline-qa-live-sync';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  v_job_id := cron.schedule(
    'touchline-qa-live-sync',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'touchline_qa_live_sync_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'touchline_qa_live_sync_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    $cron$
  );

  return jsonb_build_object('configured', true, 'job_id', v_job_id, 'schedule', '* * * * *');
end
$$;

revoke all on function public.touchline_configure_qa_live_scheduler(text, text, text)
  from public, anon, authenticated;
grant execute on function public.touchline_configure_qa_live_scheduler(text, text, text)
  to service_role;

comment on function public.touchline_configure_qa_live_scheduler(text, text, text) is
  'QA-only service-role command. Stores the scheduler bearer in Vault and invokes the stable QA alias once per minute; application cadence suppresses unnecessary provider calls.';
