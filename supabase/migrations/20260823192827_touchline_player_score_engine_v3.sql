-- TouchLine QA-only V3 rating settlement layer. V2 remains retained audit
-- history; V3 has its own canonical player/fixture/version identity.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.football_player_season_statistics
  alter column scoring_version set default 'player_scoring_v2';

update public.football_player_season_statistics
  set scoring_version = 'player_scoring_v2'
  where scoring_version is null;

alter table public.football_player_season_statistics
  alter column scoring_version set not null,
  drop constraint if exists football_player_season_statis_football_player_id_competitio_key,
  drop constraint if exists football_player_season_statistics_scoring_version_check,
  add constraint football_player_season_statistics_scoring_version_check
    check (scoring_version in ('player_scoring_v2', 'player_scoring_v3')),
  add constraint football_player_season_statistics_player_competition_season_scoring_version_key
    unique (football_player_id, competition_id, season_id, scoring_version);

alter table public.touchline_card_ranking_snapshots
  drop constraint if exists touchline_card_ranking_scoring_version_check,
  add constraint touchline_card_ranking_scoring_version_check
    check (scoring_version is null or scoring_version in ('player_scoring_v1', 'player_scoring_v2', 'player_scoring_v3'));

create table if not exists public.touchline_player_fixture_score_settlements (
  id uuid primary key default gen_random_uuid(),
  football_player_id uuid not null references public.football_players(id) on delete cascade,
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  competition_id uuid references public.football_competitions(id) on delete set null,
  season_id uuid references public.football_seasons(id) on delete set null,
  club_id uuid references public.football_clubs(id) on delete set null,
  scoring_version text not null check (scoring_version = 'player_scoring_v3'),
  appearance_status text not null check (appearance_status in ('started', 'substitute', 'unused', 'absent', 'unavailable')),
  minutes_played integer check (minutes_played is null or minutes_played >= 0),
  rating numeric(5,2) check (rating is null or (rating >= 0 and rating <= 10)),
  touchline_points integer check (touchline_points is null or touchline_points between -1 and 12),
  touchline_points_breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(touchline_points_breakdown) = 'array'),
  statistics_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(statistics_payload) = 'object'),
  scoring_coverage_status text not null check (scoring_coverage_status in ('complete', 'unavailable')),
  ranking_coverage_status text not null check (ranking_coverage_status in ('complete', 'complete_for_scoring', 'blocking_partial', 'unavailable')),
  missing_scoring_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_scoring_facts) = 'array'),
  settlement_status text not null check (settlement_status in ('provisional', 'final')),
  source_synced_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (football_player_id, fixture_id, scoring_version)
);

create index if not exists touchline_player_fixture_score_settlements_season_player_idx
  on public.touchline_player_fixture_score_settlements (season_id, football_player_id, fixture_id);
create index if not exists touchline_player_fixture_score_settlements_fixture_version_idx
  on public.touchline_player_fixture_score_settlements (fixture_id, scoring_version);

drop trigger if exists touchline_player_fixture_score_settlements_updated on public.touchline_player_fixture_score_settlements;
create trigger touchline_player_fixture_score_settlements_updated
  before update on public.touchline_player_fixture_score_settlements
  for each row execute function public.touch_updated_at();

alter table public.touchline_player_fixture_score_settlements enable row level security;
alter table public.touchline_player_fixture_score_settlements force row level security;
revoke all privileges on table public.touchline_player_fixture_score_settlements from public, anon, authenticated;
grant select, insert, update, delete on table public.touchline_player_fixture_score_settlements to service_role;

create or replace function public.publish_touchline_card_ranking_snapshot(
  requested_snapshot_id text,
  requested_league_key text,
  requested_published_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.touchline_card_ranking_snapshots%rowtype;
  calculated_total_score_points integer;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_RANKING_ADMIN_REQUIRED';
  end if;
  select * into candidate from public.touchline_card_ranking_snapshots
    where snapshot_id = requested_snapshot_id and league_key = requested_league_key for update;
  if not found then raise exception using errcode = 'P0001', message = 'TL_RANKING_SNAPSHOT_NOT_FOUND'; end if;
  if candidate.status <> 'audited' or candidate.source <> 'sportmonks-audited' then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_NOT_AUDITED';
  end if;
  if candidate.scoring_version <> 'player_scoring_v3'
     or candidate.coverage_status not in ('complete','complete_for_scoring')
     or jsonb_typeof(candidate.fixture_ids) is distinct from 'array'
     or jsonb_typeof(candidate.expected_fixture_ids) is distinct from 'array'
     or jsonb_array_length(candidate.fixture_ids) = 0
     or candidate.fixture_ids is distinct from candidate.expected_fixture_ids then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_FIXTURE_COVERAGE_INCOMPLETE';
  end if;
  if jsonb_typeof(candidate.ranking_payload -> 'players') is distinct from 'array'
     or jsonb_typeof(candidate.selection_payload -> 'players') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_PAYLOAD_INVALID';
  end if;
  begin
    select coalesce(sum((player ->> 'touchlinePoints')::integer), 0)::integer
      into calculated_total_score_points
      from jsonb_array_elements(candidate.ranking_payload -> 'players') as player;
  exception when others then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_POINT_SUM_INVALID';
  end;
  if calculated_total_score_points is distinct from candidate.total_score_points
     or candidate.actual_player_count is distinct from candidate.expected_player_count
     or candidate.actual_player_count is distinct from jsonb_array_length(candidate.ranking_payload -> 'players')
     or coalesce(candidate.checksum, '') = ''
     or (candidate.audit_report ->> 'passed')::boolean is not true
     or (candidate.selection_payload ->> 'complete')::boolean is not true
     or candidate.selection_payload ->> 'sourceSnapshotId' is distinct from candidate.snapshot_id
     or jsonb_array_length(candidate.selection_payload -> 'players') is distinct from 11 then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_PUBLICATION_BARRIER_FAILED';
  end if;
  if requested_published_at is null or candidate.audited_at is null or requested_published_at < candidate.audited_at then
    raise exception using errcode = '22023', message = 'TL_RANKING_PUBLICATION_TIME_INVALID';
  end if;
  update public.touchline_card_ranking_snapshots set status = 'published', published_at = requested_published_at
    where snapshot_id = candidate.snapshot_id;
  insert into public.touchline_card_ranking_active_snapshots (league_key, snapshot_id, activated_at, updated_at)
  values (requested_league_key, candidate.snapshot_id, requested_published_at, clock_timestamp())
  on conflict (league_key) do update set snapshot_id = excluded.snapshot_id, activated_at = excluded.activated_at, updated_at = excluded.updated_at
  where public.touchline_card_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;
  return candidate.snapshot_id;
end;
$$;

revoke all on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) to service_role;

comment on table public.touchline_player_fixture_score_settlements is
  'QA server-only V3 rating-based player settlements. One canonical row per TouchLine player, fixture and score-engine version.';
commit;
