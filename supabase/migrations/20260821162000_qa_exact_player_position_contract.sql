-- QA-only exact Sportmonks position contract.
-- Broad and detailed provider roles are persisted separately. The existing
-- position columns remain the exact/effective role consumed by TouchLine.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.football_players
  add column if not exists provider_position text,
  add column if not exists provider_position_id text,
  add column if not exists detailed_position text,
  add column if not exists detailed_position_id text;

alter table public.football_squad_members
  add column if not exists position_id text,
  add column if not exists provider_position text,
  add column if not exists provider_position_id text,
  add column if not exists detailed_position text,
  add column if not exists detailed_position_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_players_provider_position_id_format'
      and conrelid = 'public.football_players'::regclass
  ) then
    alter table public.football_players
      add constraint football_players_provider_position_id_format
      check (provider_position_id is null or provider_position_id ~ '^[0-9]{1,20}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_players_detailed_position_id_format'
      and conrelid = 'public.football_players'::regclass
  ) then
    alter table public.football_players
      add constraint football_players_detailed_position_id_format
      check (detailed_position_id is null or detailed_position_id ~ '^[0-9]{1,20}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_squad_members_provider_position_id_format'
      and conrelid = 'public.football_squad_members'::regclass
  ) then
    alter table public.football_squad_members
      add constraint football_squad_members_provider_position_id_format
      check (provider_position_id is null or provider_position_id ~ '^[0-9]{1,20}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_squad_members_detailed_position_id_format'
      and conrelid = 'public.football_squad_members'::regclass
  ) then
    alter table public.football_squad_members
      add constraint football_squad_members_detailed_position_id_format
      check (detailed_position_id is null or detailed_position_id ~ '^[0-9]{1,20}$') not valid;
  end if;
end $$;

alter table public.football_players validate constraint football_players_provider_position_id_format;
alter table public.football_players validate constraint football_players_detailed_position_id_format;
alter table public.football_squad_members validate constraint football_squad_members_provider_position_id_format;
alter table public.football_squad_members validate constraint football_squad_members_detailed_position_id_format;

comment on column public.football_players.provider_position is
  'Sportmonks broad parent role; never used as an exact Market quota.';
comment on column public.football_players.detailed_position is
  'Sportmonks detailed role. Null means DATA QUALITY pending, never guessed.';
comment on column public.football_squad_members.provider_position is
  'Membership-scoped Sportmonks broad parent role.';
comment on column public.football_squad_members.detailed_position is
  'Membership-scoped Sportmonks detailed role used by the TouchLine exact-position contract.';

-- The existing backup captures each row as JSONB, including these new fields.
-- Recompile rollback so it restores the exact-position contract as well.
create or replace function public.touchline_rollback_qa_twenty_club_roster(
  p_project_ref text,
  p_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_players integer;
  v_memberships integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select status into v_status
  from public.touchline_qa_twenty_club_roster_runs
  where run_id = p_run_id
  for update;

  if v_status = 'rolled_back' then
    return jsonb_build_object('status', 'already_rolled_back', 'run_id', p_run_id);
  end if;
  if v_status not in ('backed_up', 'applied') then
    raise exception 'TL_QA_TWENTY_CLUB_ROSTER_ROLLBACK_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;

  update public.touchline_qa_twenty_club_roster_runs set status = 'rolling_back' where run_id = p_run_id;

  update public.football_players current
  set current_club_id = nullif(before.payload->>'current_club_id', '')::uuid,
      name = before.payload->>'name',
      display_name = before.payload->>'display_name',
      nationality = nullif(before.payload->>'nationality', ''),
      country_id = nullif(before.payload->>'country_id', ''),
      provider_position = nullif(before.payload->>'provider_position', ''),
      provider_position_id = nullif(before.payload->>'provider_position_id', ''),
      detailed_position = nullif(before.payload->>'detailed_position', ''),
      detailed_position_id = nullif(before.payload->>'detailed_position_id', ''),
      position = nullif(before.payload->>'position', ''),
      position_id = nullif(before.payload->>'position_id', ''),
      market_value = nullif(before.payload->>'market_value', '')::numeric,
      market_value_currency = nullif(before.payload->>'market_value_currency', ''),
      source_updated_at = (before.payload->>'source_updated_at')::timestamptz
  from public.touchline_qa_twenty_club_roster_players_before before
  where before.run_id = p_run_id and current.id = before.player_id and current.provider = 'sportmonks';
  get diagnostics v_players = row_count;

  update public.football_squad_members current
  set competition_id = nullif(before.payload->>'competition_id', '')::uuid,
      jersey_number = nullif(before.payload->>'jersey_number', '')::integer,
      provider_position = nullif(before.payload->>'provider_position', ''),
      provider_position_id = nullif(before.payload->>'provider_position_id', ''),
      detailed_position = nullif(before.payload->>'detailed_position', ''),
      detailed_position_id = nullif(before.payload->>'detailed_position_id', ''),
      position = nullif(before.payload->>'position', ''),
      position_id = nullif(before.payload->>'position_id', ''),
      status = before.payload->>'status',
      source_updated_at = (before.payload->>'source_updated_at')::timestamptz
  from public.touchline_qa_twenty_club_roster_members_before before
  where before.run_id = p_run_id and current.id = before.membership_id and current.provider = 'sportmonks';
  get diagnostics v_memberships = row_count;

  update public.football_squad_members m
  set status = 'inactive', source_updated_at = clock_timestamp()
  where m.provider = 'sportmonks'
    and not exists (
      select 1 from public.touchline_qa_twenty_club_roster_members_before before
      where before.run_id = p_run_id and before.membership_id = m.id
    );
  update public.football_players p
  set current_club_id = null, source_updated_at = clock_timestamp()
  where p.provider = 'sportmonks'
    and not exists (
      select 1 from public.touchline_qa_twenty_club_roster_players_before before
      where before.run_id = p_run_id and before.player_id = p.id
    );

  update public.touchline_qa_twenty_club_roster_runs
  set status = 'rolled_back',
      rolled_back_at = clock_timestamp(),
      observed_counts = observed_counts || jsonb_build_object(
        'players_restored', v_players,
        'memberships_restored', v_memberships
      )
  where run_id = p_run_id;

  return jsonb_build_object(
    'status', 'rolled_back', 'run_id', p_run_id,
    'players_restored', v_players, 'memberships_restored', v_memberships
  );
end;
$$;

revoke all on function public.touchline_rollback_qa_twenty_club_roster(text, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_rollback_qa_twenty_club_roster(text, uuid)
  to service_role;

commit;
