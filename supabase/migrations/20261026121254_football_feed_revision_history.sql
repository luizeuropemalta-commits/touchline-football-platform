-- Normalized imported data, NOT archived raw Sportmonks HTTP responses.
-- Existing baselines prove only what was stored before this trigger observed it.
create table public.football_feed_revisions (
  id bigint generated always as identity primary key,
  feed_id uuid not null,
  provider text not null,
  provider_fixture_id text not null,
  origin text not null check (origin in ('existing_baseline', 'observed_import')),
  source_synced_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  payload jsonb not null
);
create index football_feed_revisions_lookup on public.football_feed_revisions
  (provider, provider_fixture_id, id desc);
create index football_feed_revisions_feed on public.football_feed_revisions (feed_id);
alter table public.football_feed_revisions enable row level security;
revoke all on public.football_feed_revisions from public, anon, authenticated, service_role;
grant select on public.football_feed_revisions to service_role;
revoke all on sequence public.football_feed_revisions_id_seq from public, anon, authenticated, service_role;

create or replace function public.touchline_capture_feed_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  previous_payload jsonb;
  next_payload jsonb;
begin
  next_payload := jsonb_build_object('fixture', new.fixture_payload, 'lineups', new.lineups_payload,
    'formations', new.formations_payload, 'sidelined', new.sidelined_payload, 'events', new.events_payload);
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.provider is distinct from old.provider
      or new.provider_fixture_id is distinct from old.provider_fixture_id then
      raise exception 'FEED_IDENTITY_IMMUTABLE';
    end if;
    previous_payload := jsonb_build_object('fixture', old.fixture_payload, 'lineups', old.lineups_payload,
      'formations', old.formations_payload, 'sidelined', old.sidelined_payload, 'events', old.events_payload);
    if not exists (select 1 from public.football_feed_revisions where feed_id = old.id) then
      insert into public.football_feed_revisions (feed_id,provider,provider_fixture_id,origin,source_synced_at,payload)
      values (old.id,old.provider,old.provider_fixture_id,'existing_baseline',old.last_synced_at,previous_payload);
    end if;
    if previous_payload = next_payload then return new; end if;
  end if;
  insert into public.football_feed_revisions (feed_id,provider,provider_fixture_id,origin,source_synced_at,payload)
  values (new.id,new.provider,new.provider_fixture_id,'observed_import',new.last_synced_at,next_payload);
  return new;
end;
$$;
revoke all on function public.touchline_capture_feed_revision() from public, anon, authenticated, service_role;
create trigger touchline_capture_feed_revision after insert or update
  on public.football_fantasy_fixture_feeds for each row
  execute function public.touchline_capture_feed_revision();

create or replace function public.touchline_protect_feed_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'FEED_REVISION_IMMUTABLE';
end;
$$;
revoke all on function public.touchline_protect_feed_revision() from public, anon, authenticated, service_role;
create trigger touchline_protect_feed_revision before update or delete
  on public.football_feed_revisions for each row execute function public.touchline_protect_feed_revision();
create trigger touchline_protect_feed_revision_truncate before truncate
  on public.football_feed_revisions for each statement execute function public.touchline_protect_feed_revision();
comment on table public.football_feed_revisions is
  'Private append-only normalized import history. Not raw provider responses. Baselines are previously stored values, not proof of original provider delivery.';

-- Operational retry metadata is separate from immutable imported evidence.
-- The existing global live-sync lease serializes attempts; unsuccessful imports
-- must not update feed freshness just to yield the queue.
create table public.football_postmatch_check_attempts (
  provider text not null,
  provider_fixture_id text not null,
  attempted_at timestamptz not null,
  primary key (provider, provider_fixture_id)
);
alter table public.football_postmatch_check_attempts enable row level security;
revoke all on public.football_postmatch_check_attempts from public, anon, authenticated, service_role;
grant select, insert, update on public.football_postmatch_check_attempts to service_role;
