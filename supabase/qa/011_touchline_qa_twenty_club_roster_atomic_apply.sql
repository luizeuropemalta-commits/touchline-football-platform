-- QA-only atomic replacement for the multi-request roster writer/blanket rollback.
-- Do not add this file to the general migrations or call it from Production.
-- Fetch and validate Sportmonks squads before invoking this single database RPC.
begin;
set local lock_timeout = '5s';

-- Separate from the legacy backup table: its rollback RPC must never accept
-- an atomic run, because this path has no broad pre-image to replay.
create table if not exists public.touchline_qa_atomic_roster_runs (
  run_id uuid primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  status text not null check (status = 'applied'),
  observed_counts jsonb not null,
  applied_at timestamptz not null default clock_timestamp()
);
alter table public.touchline_qa_atomic_roster_runs enable row level security;
revoke all on public.touchline_qa_atomic_roster_runs from public, anon, authenticated;
grant select, insert on public.touchline_qa_atomic_roster_runs to service_role;

create or replace function public.touchline_apply_qa_twenty_club_roster_atomic(
  p_project_ref text,
  p_run_id uuid,
  p_squads jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_expected_team_ids constant text[] := array[
    '11','116','117','13','14','15','18','19','20','22','236','3','51','52','6','63','71','78','8','9'
  ];
  v_team_ids text[] := '{}'::text[];
  v_provider_ids text[] := '{}'::text[];
  v_club jsonb;
  v_member jsonb;
  v_team_id text;
  v_provider_id text;
  v_name text;
  v_club_id uuid;
  v_competition_id uuid;
  v_player_id uuid;
  v_membership_id uuid;
  v_current_player_ids uuid[];
  v_jersey integer;
  v_revision timestamptz := clock_timestamp();
  v_players integer := 0;
  v_active integer;
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or p_run_id is null then
    raise exception 'TL_QA_ROSTER_ATOMIC_TARGET_INVALID';
  end if;
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_squads is null or jsonb_typeof(p_squads) <> 'array' then
    raise exception 'TL_QA_ROSTER_ATOMIC_PAYLOAD_INVALID';
  end if;
  if jsonb_array_length(p_squads) <> 20 then
    raise exception 'TL_QA_ROSTER_ATOMIC_CLUB_COUNT_INVALID';
  end if;

  -- Validate the complete payload before acquiring write locks or changing rows.
  for v_club in select value from jsonb_array_elements(p_squads) loop
    if jsonb_typeof(v_club) <> 'object' then
      raise exception 'TL_QA_ROSTER_ATOMIC_CLUB_INVALID';
    end if;
    v_team_id := v_club->>'teamId';
    if v_team_id is null or v_team_id !~ '^[0-9]{1,20}$' or v_team_id = any(v_team_ids) then
      raise exception 'TL_QA_ROSTER_ATOMIC_TEAM_ID_INVALID';
    end if;
    v_team_ids := array_append(v_team_ids, v_team_id);
    if jsonb_typeof(v_club->'members') is distinct from 'array' then
      raise exception 'TL_QA_ROSTER_ATOMIC_MEMBERS_INVALID';
    end if;
    if jsonb_array_length(v_club->'members') < 11 or jsonb_array_length(v_club->'members') > 100 then
      raise exception 'TL_QA_ROSTER_ATOMIC_SQUAD_SIZE_INVALID';
    end if;
    for v_member in select value from jsonb_array_elements(v_club->'members') loop
      if jsonb_typeof(v_member) <> 'object' then
        raise exception 'TL_QA_ROSTER_ATOMIC_MEMBER_INVALID';
      end if;
      v_provider_id := v_member->>'providerId';
      v_name := nullif(btrim(v_member->>'name'), '');
      if v_provider_id is null or v_provider_id !~ '^[0-9]{1,20}$'
        or v_provider_id = any(v_provider_ids) or v_name is null then
        raise exception 'TL_QA_ROSTER_ATOMIC_PLAYER_INVALID';
      end if;
      v_provider_ids := array_append(v_provider_ids, v_provider_id);
      if v_member->'shirtNumber' is not null and v_member->'shirtNumber' <> 'null'::jsonb then
        if jsonb_typeof(v_member->'shirtNumber') <> 'number'
          or (v_member->>'shirtNumber') !~ '^[0-9]{1,3}$'
          or (v_member->>'shirtNumber')::integer < 1 then
          raise exception 'TL_QA_ROSTER_ATOMIC_SHIRT_INVALID';
        end if;
      end if;
      v_players := v_players + 1;
    end loop;
  end loop;
  if (select array_agg(x order by x) from unnest(v_team_ids) x) is distinct from v_expected_team_ids
    or v_players < 220 then
    raise exception 'TL_QA_ROSTER_ATOMIC_SCOPE_INVALID';
  end if;

  -- A single RPC is a single PostgreSQL transaction. Any later exception rolls
  -- back all clubs and the audit receipt, without replaying a broad pre-image.
  perform pg_catalog.pg_advisory_xact_lock(900100, 20);
  if exists(select 1 from public.touchline_qa_atomic_roster_runs where run_id = p_run_id)
    or exists(select 1 from public.touchline_qa_twenty_club_roster_runs where run_id = p_run_id) then
    raise exception 'TL_QA_ROSTER_ATOMIC_RUN_REUSED';
  end if;
  -- Serialize all writers of these two QA football tables, including writers
  -- that do not take our advisory lock. Reads remain allowed. v_revision stays
  -- anchored before the wait, so a later binding must reject the whole batch.
  lock table public.football_players, public.football_squad_members
    in share row exclusive mode;
  -- Check external revisions before any club can write this run's revision.
  -- An origin processed earlier may legitimately deactivate a membership that
  -- the same batch later transfers; that internal revision is not a conflict.
  if exists (
    select 1 from public.football_players p
    where p.provider = 'sportmonks' and p.provider_player_id = any(v_provider_ids)
      and p.source_updated_at >= v_revision
  ) or exists (
    select 1 from public.football_squad_members m
      join public.football_players p on p.id = m.player_id
    where m.provider = 'sportmonks' and p.provider = 'sportmonks'
      and p.provider_player_id = any(v_provider_ids)
      and m.source_updated_at >= v_revision
  ) then
    raise exception 'TL_QA_ROSTER_ATOMIC_REVISION_CONFLICT';
  end if;
  for v_club in select value from jsonb_array_elements(p_squads) loop
    v_team_id := v_club->>'teamId';
    select id, competition_id into v_club_id, v_competition_id
      from public.football_clubs
      where provider = 'sportmonks' and provider_team_id = v_team_id
      for update;
    if v_club_id is null or v_competition_id is null then
      raise exception 'TL_QA_ROSTER_ATOMIC_CLUB_MISSING_%', v_team_id;
    end if;
    v_current_player_ids := '{}'::uuid[];
    for v_member in select value from jsonb_array_elements(v_club->'members') loop
      v_provider_id := v_member->>'providerId';
      v_name := btrim(v_member->>'name');
      v_jersey := nullif(v_member->>'shirtNumber', '')::integer;

      insert into public.football_players as p (
        provider, provider_player_id, current_club_id, name, display_name,
        nationality, country_id, provider_position, provider_position_id,
        detailed_position, detailed_position_id, position, position_id,
        source_updated_at
      ) values (
        'sportmonks', v_provider_id, v_club_id, v_name, v_name,
        nullif(v_member->>'nationality',''), nullif(v_member->>'countryId',''),
        nullif(v_member->>'broadPosition',''), nullif(v_member->>'broadPositionId',''),
        nullif(v_member->>'detailedPosition',''), nullif(v_member->>'detailedPositionId',''),
        nullif(v_member->>'position',''), nullif(v_member->>'positionId',''),
        v_revision
      ) on conflict (provider, provider_player_id) do update set
        current_club_id = excluded.current_club_id,
        name = excluded.name, display_name = excluded.display_name,
        nationality = coalesce(excluded.nationality, p.nationality),
        country_id = coalesce(excluded.country_id, p.country_id),
        provider_position = excluded.provider_position,
        provider_position_id = excluded.provider_position_id,
        detailed_position = excluded.detailed_position,
        detailed_position_id = excluded.detailed_position_id,
        position = excluded.position, position_id = excluded.position_id,
        source_updated_at = excluded.source_updated_at
      where p.source_updated_at is null or p.source_updated_at < excluded.source_updated_at
      returning id into v_player_id;
      if v_player_id is null then
        raise exception 'TL_QA_ROSTER_ATOMIC_REVISION_CONFLICT';
      end if;
      v_current_player_ids := array_append(v_current_player_ids, v_player_id);

      update public.football_squad_members
        set status = 'inactive', source_updated_at = v_revision
        where provider = 'sportmonks' and player_id = v_player_id
          and club_id <> v_club_id and status = 'active' and source_updated_at < v_revision;
      insert into public.football_squad_members as m (
        provider, club_id, player_id, competition_id, jersey_number,
        provider_position, provider_position_id, detailed_position, detailed_position_id,
        position, position_id, status, source_updated_at
      ) values (
        'sportmonks', v_club_id, v_player_id, v_competition_id, v_jersey,
        nullif(v_member->>'broadPosition',''), nullif(v_member->>'broadPositionId',''),
        nullif(v_member->>'detailedPosition',''), nullif(v_member->>'detailedPositionId',''),
        nullif(v_member->>'position',''), nullif(v_member->>'positionId',''),
        'active', v_revision
      ) on conflict (provider, club_id, player_id) do update set
        competition_id = excluded.competition_id,
        jersey_number = coalesce(excluded.jersey_number, m.jersey_number),
        provider_position = excluded.provider_position,
        provider_position_id = excluded.provider_position_id,
        detailed_position = excluded.detailed_position,
        detailed_position_id = excluded.detailed_position_id,
        position = excluded.position, position_id = excluded.position_id,
        status = 'active', source_updated_at = excluded.source_updated_at
      where m.source_updated_at is null or m.source_updated_at < excluded.source_updated_at
      returning id into v_membership_id;
      if v_membership_id is null then
        raise exception 'TL_QA_ROSTER_ATOMIC_REVISION_CONFLICT';
      end if;
    end loop;
    update public.football_squad_members
      set status = 'inactive', source_updated_at = v_revision
      where provider = 'sportmonks' and club_id = v_club_id and status = 'active'
        and not (player_id = any(v_current_player_ids)) and source_updated_at < v_revision;
    select count(*) into v_active from public.football_squad_members
      where provider = 'sportmonks' and club_id = v_club_id and status = 'active';
    if v_active is distinct from cardinality(v_current_player_ids) then
      raise exception 'TL_QA_ROSTER_ATOMIC_MEMBERSHIP_MISMATCH_%', v_team_id;
    end if;
  end loop;
  -- Clear only a departure established by this run. Never guess a destination,
  -- clear a player returned for another club, or overwrite a newer binding.
  update public.football_players p
    set current_club_id = null, source_updated_at = v_revision
    where p.provider = 'sportmonks'
      and not (p.provider_player_id = any(v_provider_ids))
      and p.source_updated_at < v_revision
      and exists (
        select 1 from public.football_squad_members m
        where m.provider = 'sportmonks' and m.player_id = p.id
          and m.club_id = p.current_club_id and m.status = 'inactive'
          and m.source_updated_at = v_revision
      )
      and not exists (
        select 1 from public.football_squad_members m
        where m.provider = 'sportmonks' and m.player_id = p.id and m.status = 'active'
      );
  insert into public.touchline_qa_atomic_roster_runs (
    run_id, project_ref, status, observed_counts, applied_at
  ) values (
    p_run_id, p_project_ref, 'applied',
    jsonb_build_object('clubs', 20, 'provider_players', v_players, 'atomic', true),
    clock_timestamp()
  );
  return jsonb_build_object('status','applied','run_id',p_run_id,'clubs',20,'provider_players',v_players);
end;
$$;

revoke all on function public.touchline_apply_qa_twenty_club_roster_atomic(text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_twenty_club_roster_atomic(text,uuid,jsonb)
  to service_role;
commit;
