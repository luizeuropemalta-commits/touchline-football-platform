-- Owner-authorised local market-value staging import: Manchester City, 2026/27.
--
-- This migration is an unapplied local artifact. It must run only after the
-- SQL-incident gate is closed and an authorised application review approves it.
-- It does not fetch, scrape or call a football provider. The supplied external
-- IDs and URLs are retained only in protected import audit rows; they are not
-- canonical player identity and are never copied into provider-specific fields.
--
-- The source staging file does not supply player names or a valuation date.
-- Its 2026-08-07 path date is stored below as artifact provenance only, not as
-- an asserted valuation date. The one blank-value row remains pending and is
-- deliberately excluded from current-value and history writes.

begin;
set local lock_timeout = '5s';

create temporary table touchline_manchester_city_market_value_seed (
  player_id uuid primary key,
  external_player_id text,
  market_value_eur bigint,
  currency char(3),
  import_status text not null check (import_status in ('verified', 'pending')),
  source_url text,
  source_artifact_date date not null,
  check (
    (import_status = 'verified' and market_value_eur is not null and market_value_eur >= 0 and currency = 'EUR')
    or (import_status = 'pending' and market_value_eur is null and currency is null)
  )
) on commit drop;

insert into touchline_manchester_city_market_value_seed (
  player_id,
  external_player_id,
  market_value_eur,
  currency,
  import_status,
  source_url,
  source_artifact_date
)
values
  ('ea8079b5-f1f1-4201-8928-3eec2b98d08b'::uuid, '37623459', 42300000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('c61a7390-0ccb-4567-89b1-0f62adeaca92'::uuid, '10990678', 64000000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('d48fa855-206c-42c7-b9db-71d0569e7cc8'::uuid, '37639080', 16000000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('268685d1-c715-49e0-8ab0-90485a6d3810'::uuid, '332047', 57100000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('a1e3b920-4b73-4588-bd08-ff19e70a74fc'::uuid, '154421', 154300000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('9c2eea1d-4ed0-4a38-a8d3-dd0e5752b452'::uuid, '129771', 42500000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('e3906c9b-0e32-421f-a8cb-f1d7af61ddd2'::uuid, '30446925', 2500000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('8f38cb37-6496-4422-8033-e980138a80dc'::uuid, '1116', 18000000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('9358c4f1-a86e-4580-a538-0d6ac654d327'::uuid, '28575686', 29500000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('3af0a8b8-0595-4101-ad7a-928cbe6997e8'::uuid, '23697990', 70300000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('9117295d-f534-4c07-b7a7-39455f3e3b4b'::uuid, '37740614', 13300000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('9ee81e2b-7218-48b0-93e5-38908b4b7b9d'::uuid, '24838234', 1700000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('45e41ef3-9385-402a-b2ff-b1edbfa9658c'::uuid, '24838191', 68200000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('0d2cb088-046b-4a1e-87e3-a63e458c2ce3'::uuid, '37717875', 11400000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('44525bd4-b1da-4d80-b1db-6c31c6657910'::uuid, '3354', 8000000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('6ba8d898-6e3f-45f2-b0fa-f5095f312c52'::uuid, '4536500', 63100000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('44191b0d-fe81-4cbe-8fc4-c860960e07c8'::uuid, '3268', 700000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('10b2033e-3d24-4c8b-bd33-a8aea439759e'::uuid, '73147', 10800000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('b2d49a4b-49de-4f4b-b74c-dca64f6d84a4'::uuid, '21781428', 47200000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('de5a40e5-8062-4a41-a595-a00ba65233c9'::uuid, '37548599', 1700000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('e5c8f3bf-6d1e-441c-9ff3-c6618d21329b'::uuid, '23269737', 48100000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('2e3a4b7c-0e5c-47cc-a097-501053c5de0f'::uuid, '37562487', 51700000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('9924b908-0b3f-477f-b0ad-790b5e7c9b97'::uuid, '294000', 55000000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('57974f08-0635-4f3d-9e9a-6d3d59f821c5'::uuid, '336133', 69500000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('4ed708b9-4b9c-444f-bfc1-f5af7afa59cb'::uuid, '13590962', 43100000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('87539e31-c753-44e5-a4c3-4941d0a2dbc3'::uuid, '21072805', 63600000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('018a4561-1c5b-4136-962a-1db113ba37e0'::uuid, '37459073', 41200000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('9fedae9a-d671-470e-90f1-79301811ff6f'::uuid, '186910', 65800000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('1929ff54-aa80-4fdc-9ab7-62e8ffe67bec'::uuid, '162536', 46700000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('cd8d70b2-7676-4d34-9955-783cc14650b6'::uuid, '37527169', 49900000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('97e23bfa-d0bc-47d9-b41a-50a8180a6971'::uuid, '3156873', 55700000, 'EUR', 'verified', 'https://www.footballtransfers.com/en/teams/uk/man-city/squad', date '2026-08-07'),
  ('b5d80b41-b77c-4459-9dc3-5d56d35e3e86'::uuid, '37689559', null, null, 'pending', null, date '2026-08-07');

create temporary table touchline_manchester_city_market_value_resolved on commit drop as
select
  seed.player_id,
  seed.external_player_id,
  seed.market_value_eur,
  seed.currency,
  seed.import_status,
  seed.source_url,
  seed.source_artifact_date,
  player.provider_player_id,
  player.name as player_name,
  club.id as club_id,
  club.competition_id
from touchline_manchester_city_market_value_seed as seed
join public.football_players as player
  on player.id = seed.player_id
join public.football_clubs as club
  on club.id = player.current_club_id
join public.football_squad_members as membership
  on membership.player_id = player.id
 and membership.club_id = club.id
 and membership.status = 'active'
where club.name = 'Manchester City'
  and club.provider_team_id = '9';

do $$
declare
  expected_count integer;
  resolved_count integer;
  resolved_club_count integer;
  verified_count integer;
  pending_count integer;
begin
  select count(*) into expected_count
    from touchline_manchester_city_market_value_seed;
  select count(*) into resolved_count
    from touchline_manchester_city_market_value_resolved;
  select count(distinct club_id) into resolved_club_count
    from touchline_manchester_city_market_value_resolved;
  select count(*) into verified_count
    from touchline_manchester_city_market_value_resolved
   where import_status = 'verified';
  select count(*) into pending_count
    from touchline_manchester_city_market_value_resolved
   where import_status = 'pending';

  if expected_count <> 32
     or resolved_count <> expected_count
     or resolved_club_count <> 1
     or verified_count <> 31
     or pending_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'TL_MANCHESTER_CITY_MANUAL_VALUE_IDENTITY_OR_COUNT_MISMATCH';
  end if;
end;
$$;

create temporary table touchline_manchester_city_market_value_previous on commit drop as
select
  current_value.player_id,
  current_value.market_value as previous_market_value,
  current_value.currency as previous_currency,
  current_value.market_value_eur as previous_market_value_eur,
  current_value.verified_season as previous_verified_season,
  current_value.status as previous_status,
  current_value.confidence as previous_confidence
from public.football_player_market_values as current_value
join touchline_manchester_city_market_value_resolved as resolved
  on resolved.player_id = current_value.player_id
where resolved.import_status = 'verified';

create temporary table touchline_manchester_city_market_value_context (
  import_run_id uuid not null,
  job_run_id uuid not null,
  verified_at timestamptz not null
) on commit drop;

with import_run as (
  insert into public.football_market_value_import_runs (
    scope,
    competition_id,
    club_id,
    verified_season,
    source,
    status,
    total_rows,
    started_at
  )
  select
    'club',
    (select competition_id from touchline_manchester_city_market_value_resolved limit 1),
    (select club_id from touchline_manchester_city_market_value_resolved limit 1),
    '2026/27',
    'manual_approval',
    'running',
    count(*),
    now()
  from touchline_manchester_city_market_value_seed
  returning id
), job_run as (
  insert into public.football_market_value_job_runs (
    job_key,
    import_run_id,
    competition_id,
    verified_season,
    source_import_file,
    status,
    players_scanned,
    started_at
  )
  select
    'manual_emergency_player_import',
    import_run.id,
    (select competition_id from touchline_manchester_city_market_value_resolved limit 1),
    '2026/27',
    'manchester-city-2026-27-staging.csv',
    'running',
    (select count(*) from touchline_manchester_city_market_value_seed),
    now()
  from import_run
  returning id, import_run_id
)
insert into touchline_manchester_city_market_value_context (import_run_id, job_run_id, verified_at)
select job_run.import_run_id, job_run.id, now()
from job_run;

insert into public.football_player_market_values (
  player_id,
  market_value,
  currency,
  market_value_eur,
  last_verified,
  verified_season,
  source,
  confidence,
  status
)
select
  resolved.player_id,
  resolved.market_value_eur,
  resolved.currency,
  resolved.market_value_eur,
  context.verified_at,
  '2026/27',
  'manual_approval',
  'verified',
  'verified'
from touchline_manchester_city_market_value_resolved as resolved
cross join touchline_manchester_city_market_value_context as context
where resolved.import_status = 'verified'
on conflict (player_id) do update
set market_value = excluded.market_value,
    currency = excluded.currency,
    market_value_eur = excluded.market_value_eur,
    last_verified = excluded.last_verified,
    verified_season = excluded.verified_season,
    source = excluded.source,
    confidence = excluded.confidence,
    status = excluded.status;

insert into public.football_player_market_value_history (
  player_id,
  market_value,
  currency,
  market_value_eur,
  verified_season,
  verified_date,
  source,
  confidence
)
select
  resolved.player_id,
  resolved.market_value_eur,
  resolved.currency,
  resolved.market_value_eur,
  '2026/27',
  context.verified_at,
  'manual_approval',
  'verified'
from touchline_manchester_city_market_value_resolved as resolved
cross join touchline_manchester_city_market_value_context as context
left join touchline_manchester_city_market_value_previous as previous
  on previous.player_id = resolved.player_id
where resolved.import_status = 'verified'
  and (
    previous.player_id is null
    or previous.previous_market_value_eur is distinct from resolved.market_value_eur
    or previous.previous_verified_season is distinct from '2026/27'
    or previous.previous_status is distinct from 'verified'
    or previous.previous_confidence is distinct from 'verified'
  );

insert into public.football_market_value_import_items (
  import_run_id,
  player_id,
  external_player_id,
  source_url,
  market_value,
  currency,
  market_value_eur,
  status,
  failure_code
)
select
  context.import_run_id,
  resolved.player_id,
  resolved.external_player_id,
  resolved.source_url,
  case when resolved.import_status = 'verified' then resolved.market_value_eur else null end,
  case when resolved.import_status = 'verified' then resolved.currency else null end,
  case when resolved.import_status = 'verified' then resolved.market_value_eur else null end,
  case when resolved.import_status = 'verified' then 'imported' else 'pending' end,
  case when resolved.import_status = 'pending' then 'TL_OWNER_VALUE_MISSING' else null end
from touchline_manchester_city_market_value_resolved as resolved
cross join touchline_manchester_city_market_value_context as context;

update public.football_market_value_import_runs
set status = 'completed',
    inserted_rows = (
      select count(*)
      from touchline_manchester_city_market_value_resolved
      where import_status = 'verified'
    ),
    unchanged_rows = (
      select count(*)
      from touchline_manchester_city_market_value_resolved as resolved
      join touchline_manchester_city_market_value_previous as previous
        on previous.player_id = resolved.player_id
      where resolved.import_status = 'verified'
        and previous.previous_market_value_eur is not distinct from resolved.market_value_eur
        and previous.previous_verified_season is not distinct from '2026/27'
        and previous.previous_status is not distinct from 'verified'
        and previous.previous_confidence is not distinct from 'verified'
    ),
    pending_rows = (
      select count(*)
      from touchline_manchester_city_market_value_resolved
      where import_status = 'pending'
    ),
    failed_rows = 0,
    completed_at = now()
where id = (select import_run_id from touchline_manchester_city_market_value_context);

update public.football_market_value_job_runs
set status = 'completed',
    new_players = (
      select count(*)
      from touchline_manchester_city_market_value_resolved as resolved
      left join touchline_manchester_city_market_value_previous as previous
        on previous.player_id = resolved.player_id
      where resolved.import_status = 'verified'
        and previous.player_id is null
    ),
    changed_values = (
      select count(*)
      from touchline_manchester_city_market_value_resolved as resolved
      left join touchline_manchester_city_market_value_previous as previous
        on previous.player_id = resolved.player_id
      where resolved.import_status = 'verified'
        and (
          previous.player_id is null
          or previous.previous_market_value_eur is distinct from resolved.market_value_eur
          or previous.previous_verified_season is distinct from '2026/27'
          or previous.previous_status is distinct from 'verified'
          or previous.previous_confidence is distinct from 'verified'
        )
    ),
    unchanged_values = (
      select count(*)
      from touchline_manchester_city_market_value_resolved as resolved
      join touchline_manchester_city_market_value_previous as previous
        on previous.player_id = resolved.player_id
      where resolved.import_status = 'verified'
        and previous.previous_market_value_eur is not distinct from resolved.market_value_eur
        and previous.previous_verified_season is not distinct from '2026/27'
        and previous.previous_status is not distinct from 'verified'
        and previous.previous_confidence is not distinct from 'verified'
    ),
    pending_records = (
      select count(*)
      from touchline_manchester_city_market_value_resolved
      where import_status = 'pending'
    ),
    mapping_conflicts = 0,
    failures = 0,
    approved_records = (
      select count(*)
      from touchline_manchester_city_market_value_resolved
      where import_status = 'verified'
    ),
    completed_at = now()
where id = (select job_run_id from touchline_manchester_city_market_value_context);

commit;
