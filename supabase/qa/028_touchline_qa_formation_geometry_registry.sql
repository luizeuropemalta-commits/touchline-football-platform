-- QA ONLY: canonical 2D formation geometry registry.
-- This migration is structurally fenced to TouchLine Development QA and must
-- never be moved into the Production migration chain.
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create table if not exists public.touchline_formation_geometry_versions (
  id uuid primary key default gen_random_uuid(),
  formation_code text not null check (formation_code ~ '^[1-5](-[1-5]){2,3}$'),
  geometry_version integer not null check (geometry_version >= 1),
  status text not null check (status in ('published', 'superseded')),
  geometry jsonb not null,
  validation_report jsonb not null,
  change_reason text not null check (char_length(change_reason) between 1 and 240),
  actor_kind text not null check (actor_kind in ('system', 'owner')),
  actor_id uuid null,
  supersedes_version integer null check (supersedes_version is null or supersedes_version >= 1),
  rollback_of_version integer null check (rollback_of_version is null or rollback_of_version >= 1),
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  unique (formation_code, geometry_version),
  check ((actor_kind = 'system' and actor_id is null) or (actor_kind = 'owner' and actor_id is not null))
);

create unique index if not exists touchline_formation_geometry_one_published_idx
  on public.touchline_formation_geometry_versions (formation_code)
  where status = 'published';

create index if not exists touchline_formation_geometry_history_idx
  on public.touchline_formation_geometry_versions (formation_code, geometry_version desc);

alter table public.touchline_formation_geometry_versions enable row level security;
revoke all privileges on table public.touchline_formation_geometry_versions from public, anon, authenticated;
grant select, insert, update on table public.touchline_formation_geometry_versions to service_role;

comment on table public.touchline_formation_geometry_versions is
  'QA-only versioned 2D formation calibration. Browser roles have no direct access; owner-gated server reads/writes expose allowlisted geometry only. Arena camera calibration is explicitly out of scope.';

create or replace function public.touchline_formation_geometry_payload_is_valid(
  p_formation_code text,
  p_geometry jsonb,
  p_validation_report jsonb
) returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_valid boolean := false;
begin
  select
    p_formation_code ~ '^[1-5](-[1-5]){2,3}$'
    and jsonb_typeof(p_geometry) = 'object'
    and p_geometry ->> 'formationCode' = p_formation_code
    and p_geometry ->> 'schemaVersion' = '1'
    and jsonb_typeof(p_geometry -> 'slots') = 'array'
    and jsonb_array_length(p_geometry -> 'slots') = 11
    and not exists (
      select 1
      from jsonb_array_elements(p_geometry -> 'slots') with ordinality as slot(value, ordinal)
      where jsonb_typeof(slot.value) <> 'object'
         or coalesce(slot.value ->> 'id', '') !~ '^[A-Z][A-Z0-9]{0,4}$'
         or coalesce((slot.value ->> 'x')::numeric, -1) < 0
         or coalesce((slot.value ->> 'x')::numeric, 101) > 100
         or coalesce((slot.value ->> 'y')::numeric, -1) < 0
         or coalesce((slot.value ->> 'y')::numeric, 101) > 100
         or coalesce(slot.value ->> 'role', '') not in ('goalkeeper', 'defender', 'midfielder', 'forward')
         or coalesce((slot.value ->> 'priority')::integer, 0) <> slot.ordinal
         or jsonb_typeof(slot.value -> 'allowedPositions') <> 'array'
         or jsonb_array_length(slot.value -> 'allowedPositions') = 0
    )
    and (
      select count(distinct slot.value ->> 'id') = 11
      from jsonb_array_elements(p_geometry -> 'slots') as slot(value)
    )
    and jsonb_typeof(p_validation_report) = 'object'
    and p_validation_report ->> 'publishable' = 'true'
    and p_validation_report ->> 'formationCode' = p_formation_code
    and p_validation_report ->> 'slotCount' = '11'
  into v_valid;
  return coalesce(v_valid, false);
exception when others then
  -- Invalid JSON scalar types must fail closed instead of aborting a request.
  return false;
end;
$$;

revoke all on function public.touchline_formation_geometry_payload_is_valid(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.touchline_formation_geometry_payload_is_valid(text, jsonb, jsonb) to service_role;

alter table public.touchline_formation_geometry_versions
  drop constraint if exists touchline_formation_geometry_payload_check;
alter table public.touchline_formation_geometry_versions
  add constraint touchline_formation_geometry_payload_check
  check (public.touchline_formation_geometry_payload_is_valid(formation_code, geometry, validation_report));

create or replace function public.touchline_publish_formation_geometry(
  p_formation_code text,
  p_geometry jsonb,
  p_validation_report jsonb,
  p_actor_id uuid,
  p_change_reason text,
  p_rollback_of_version integer default null
) returns table (
  id uuid,
  formation_code text,
  geometry_version integer,
  status text,
  geometry jsonb,
  validation_report jsonb,
  change_reason text,
  created_at timestamptz,
  published_at timestamptz,
  supersedes_version integer,
  rollback_of_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_version integer;
  v_next_version integer;
  v_reason text := nullif(btrim(p_change_reason), '');
begin
  if p_actor_id is null or v_reason is null or char_length(v_reason) > 240 then
    raise exception 'TL_FORMATION_GEOMETRY_ACTOR_REASON_REQUIRED';
  end if;
  if not public.touchline_formation_geometry_payload_is_valid(p_formation_code, p_geometry, p_validation_report) then
    raise exception 'TL_FORMATION_GEOMETRY_INVALID';
  end if;
  if p_rollback_of_version is not null and not exists (
    select 1 from public.touchline_formation_geometry_versions history
    where history.formation_code = p_formation_code
      and history.geometry_version = p_rollback_of_version
  ) then
    raise exception 'TL_FORMATION_GEOMETRY_ROLLBACK_TARGET_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-formation:' || p_formation_code, 0));
  select max(version.geometry_version) into v_previous_version
  from public.touchline_formation_geometry_versions version
  where version.formation_code = p_formation_code;
  v_next_version := coalesce(v_previous_version, 0) + 1;

  update public.touchline_formation_geometry_versions version
     set status = 'superseded'
   where version.formation_code = p_formation_code
     and version.status = 'published';

  return query
  insert into public.touchline_formation_geometry_versions (
    formation_code, geometry_version, status, geometry, validation_report,
    change_reason, actor_kind, actor_id, supersedes_version, rollback_of_version
  ) values (
    p_formation_code, v_next_version, 'published', p_geometry, p_validation_report,
    v_reason, 'owner', p_actor_id, v_previous_version, p_rollback_of_version
  )
  returning
    touchline_formation_geometry_versions.id,
    touchline_formation_geometry_versions.formation_code,
    touchline_formation_geometry_versions.geometry_version,
    touchline_formation_geometry_versions.status,
    touchline_formation_geometry_versions.geometry,
    touchline_formation_geometry_versions.validation_report,
    touchline_formation_geometry_versions.change_reason,
    touchline_formation_geometry_versions.created_at,
    touchline_formation_geometry_versions.published_at,
    touchline_formation_geometry_versions.supersedes_version,
    touchline_formation_geometry_versions.rollback_of_version;
end;
$$;

revoke all on function public.touchline_publish_formation_geometry(text, jsonb, jsonb, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.touchline_publish_formation_geometry(text, jsonb, jsonb, uuid, text, integer) to service_role;

create or replace function public.touchline_rollback_formation_geometry(
  p_formation_code text,
  p_target_version integer,
  p_actor_id uuid,
  p_change_reason text
) returns table (
  id uuid,
  formation_code text,
  geometry_version integer,
  status text,
  geometry jsonb,
  validation_report jsonb,
  change_reason text,
  created_at timestamptz,
  published_at timestamptz,
  supersedes_version integer,
  rollback_of_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.touchline_formation_geometry_versions%rowtype;
begin
  select history.* into v_target
  from public.touchline_formation_geometry_versions history
  where history.formation_code = p_formation_code
    and history.geometry_version = p_target_version;
  if not found then
    raise exception 'TL_FORMATION_GEOMETRY_ROLLBACK_TARGET_NOT_FOUND';
  end if;
  return query select * from public.touchline_publish_formation_geometry(
    p_formation_code,
    v_target.geometry,
    v_target.validation_report,
    p_actor_id,
    p_change_reason,
    p_target_version
  );
end;
$$;

revoke all on function public.touchline_rollback_formation_geometry(text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.touchline_rollback_formation_geometry(text, integer, uuid, text) to service_role;

-- Initial versioned registry. Compact arrays are expanded deterministically so
-- the database and application share the exact named-slot contract.
with seeds(formation_code, slot_ids, xs, ys, roles) as (values
  ('4-3-3', array['GK','RB','RCB','LCB','LB','RCM','CM','LCM','RW','ST','LW'], array[8,36,36,36,36,64,64,64,92,92,92]::numeric[], array[50,17,39,61,83,25,50,75,18,50,82]::numeric[], array['goalkeeper','defender','defender','defender','defender','midfielder','midfielder','midfielder','forward','forward','forward']),
  ('4-4-2', array['GK','RB','RCB','LCB','LB','RM','RCM','LCM','LM','RST','LST'], array[8,36,36,36,36,64,64,64,64,92,92]::numeric[], array[50,17,39,61,83,17,39,61,83,38,62]::numeric[], array['goalkeeper','defender','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','forward','forward']),
  ('4-2-3-1', array['GK','RB','RCB','LCB','LB','RDM','LDM','RAM','CAM','LAM','ST'], array[8,29,29,29,29,50,50,71,71,71,92]::numeric[], array[50,17,39,61,83,34,66,20,50,80,50]::numeric[], array['goalkeeper','defender','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','midfielder','forward']),
  ('4-1-4-1', array['GK','RB','RCB','LCB','LB','DM','RM','RCM','LCM','LM','ST'], array[8,29,29,29,29,50,71,71,71,71,92]::numeric[], array[50,17,39,61,83,50,17,39,61,83,50]::numeric[], array['goalkeeper','defender','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','midfielder','forward']),
  ('4-5-1', array['GK','RB','RCB','LCB','LB','RM','RCM','CM','LCM','LM','ST'], array[8,36,36,36,36,72,58,58,58,72,92]::numeric[], array[50,17,39,61,83,16,27,50,73,84,50]::numeric[], array['goalkeeper','defender','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','midfielder','forward']),
  ('3-4-3', array['GK','RCB','CB','LCB','RWB','RCM','LCM','LWB','RW','ST','LW'], array[8,36,36,36,64,64,64,64,92,92,92]::numeric[], array[50,25,50,75,17,39,61,83,18,50,82]::numeric[], array['goalkeeper','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','forward','forward','forward']),
  ('3-5-2', array['GK','RCB','CB','LCB','RWB','RCM','CM','LCM','LWB','RST','LST'], array[8,36,36,36,50,66,66,66,50,92,92]::numeric[], array[50,25,50,75,16,27,50,73,84,38,62]::numeric[], array['goalkeeper','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','midfielder','forward','forward']),
  ('3-4-2-1', array['GK','RCB','CB','LCB','RWB','RCM','LCM','LWB','RAM','LAM','ST'], array[8,29,29,29,50,50,50,50,71,71,92]::numeric[], array[50,25,50,75,17,39,61,83,34,66,50]::numeric[], array['goalkeeper','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','midfielder','midfielder','forward']),
  ('5-2-3', array['GK','RWB','RCB','CB','LCB','LWB','RCM','LCM','RW','ST','LW'], array[8,50,30,30,30,50,64,64,92,92,92]::numeric[], array[50,16,27,50,73,84,36,64,18,50,82]::numeric[], array['goalkeeper','defender','defender','defender','defender','defender','midfielder','midfielder','forward','forward','forward']),
  ('5-3-2', array['GK','RWB','RCB','CB','LCB','LWB','RCM','CM','LCM','RST','LST'], array[8,50,30,30,30,50,64,64,64,92,92]::numeric[], array[50,16,27,50,73,84,25,50,75,38,62]::numeric[], array['goalkeeper','defender','defender','defender','defender','defender','midfielder','midfielder','midfielder','forward','forward']),
  ('5-4-1', array['GK','RWB','RCB','CB','LCB','LWB','RM','RCM','LCM','LM','ST'], array[8,50,30,30,30,50,72,64,64,72,92]::numeric[], array[50,16,27,50,73,84,17,39,61,83,50]::numeric[], array['goalkeeper','defender','defender','defender','defender','defender','midfielder','midfielder','midfielder','midfielder','forward'])
), expanded as (
  select seed.formation_code, item.ordinality::integer as priority,
    seed.slot_ids[item.ordinality] as slot_id,
    seed.xs[item.ordinality] as x,
    seed.ys[item.ordinality] as y,
    seed.roles[item.ordinality] as role,
    (row_number() over (partition by seed.formation_code, seed.roles[item.ordinality] order by item.ordinality) - 1)::integer as role_index
  from seeds seed
  cross join lateral generate_subscripts(seed.slot_ids, 1) with ordinality as item(subscript, ordinality)
), payloads as (
  select formation_code, jsonb_build_object(
    'schemaVersion', 1,
    'formationCode', formation_code,
    'slots', jsonb_agg(jsonb_build_object(
      'id', slot_id,
      'x', x,
      'y', y,
      'role', role,
      'roleIndex', role_index,
      'line', case when slot_id = 'GK' then 'goal' when slot_id like '%WB' then 'wing-back' when role = 'defender' then 'defence' when slot_id like '%DM' or slot_id = 'DM' then 'holding' when slot_id like '%AM' or slot_id = 'CAM' then 'attacking-midfield' when role = 'midfielder' then 'midfield' else 'attack' end,
      'side', case when slot_id like 'R%' then 'right' when slot_id like 'L%' then 'left' else 'centre' end,
      'priority', priority,
      'allowedPositions', case
        when slot_id = 'GK' then '["goalkeeper"]'::jsonb
        when slot_id in ('RB','RWB') then '["right-back"]'::jsonb
        when slot_id in ('LB','LWB') then '["left-back"]'::jsonb
        when slot_id like '%CB' or slot_id = 'CB' then '["centre-back"]'::jsonb
        when slot_id like '%DM' or slot_id = 'DM' then '["defensive-midfield","midfield"]'::jsonb
        when slot_id like '%ST' or slot_id = 'ST' then '["centre-forward","attacker"]'::jsonb
        when slot_id in ('RW','LW','RM','LM') then '["attacker","midfield"]'::jsonb
        when slot_id like '%AM' or slot_id = 'CAM' then '["midfield","attacker"]'::jsonb
        else '["midfield","defensive-midfield"]'::jsonb
      end
    ) order by priority)
  ) as geometry
  from expanded
  group by formation_code
)
insert into public.touchline_formation_geometry_versions (
  formation_code, geometry_version, status, geometry, validation_report,
  change_reason, actor_kind, actor_id
)
select
  payload.formation_code,
  1,
  'published',
  payload.geometry,
  jsonb_build_object(
    'publishable', true,
    'formationCode', payload.formation_code,
    'slotCount', 11,
    'issues', '[]'::jsonb,
    'checkedViewports', '["1920x1080","1440x900","1280x720","1024x768","844x390"]'::jsonb
  ),
  'Initial canonical QA calibration',
  'system',
  null
from payloads payload
on conflict (formation_code, geometry_version) do nothing;
