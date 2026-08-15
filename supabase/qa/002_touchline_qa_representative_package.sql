-- QA-only staged representative package. Never add this file to supabase/migrations.
-- Payload chunks are inert until the exact QA-only apply function validates and consumes all of them.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_fixture_payload_chunks (
  run_id uuid not null references public.touchline_qa_fixture_runs(id) on delete restrict,
  payload_kind text not null check (payload_kind in ('clubs','players','memberships','publication_rows','inventory')),
  chunk_index integer not null check (chunk_index >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'array' and jsonb_array_length(payload) > 0),
  payload_hash_sha256 char(64) not null check (payload_hash_sha256 ~ '^[0-9a-f]{64}$'),
  payload_count integer not null check (payload_count > 0),
  created_at timestamptz not null default now(),
  primary key (run_id, payload_kind, chunk_index)
);
alter table public.touchline_qa_fixture_payload_chunks enable row level security;
revoke all on public.touchline_qa_fixture_payload_chunks from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_qa_fixture_payload_chunks to service_role;

create or replace function public.touchline_stage_representative_qa_chunk(
  p_project_ref text,
  p_run_id uuid,
  p_fixture_version text,
  p_source_fingerprint_sha256 text,
  p_package_fingerprint_sha256 text,
  p_expected_counts jsonb,
  p_payload_kind text,
  p_chunk_index integer,
  p_payload jsonb,
  p_payload_hash_sha256 text
)
returns table (run_id uuid, payload_kind text, chunk_index integer, payload_count integer, idempotent_replay boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.touchline_qa_fixture_payload_chunks%rowtype;
  v_run public.touchline_qa_fixture_runs%rowtype;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_run_id is null
     or nullif(trim(p_fixture_version), '') is null
     or coalesce(p_source_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_package_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_expected_counts) <> 'object'
     or p_payload_kind not in ('clubs','players','memberships','publication_rows','inventory')
     or p_chunk_index < 0
     or jsonb_typeof(p_payload) <> 'array'
     or jsonb_array_length(p_payload) = 0
     or coalesce(p_payload_hash_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_QA_FIXTURE_STAGE_COMMAND_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('touchline-representative-qa:' || p_run_id::text));
  insert into public.touchline_qa_fixture_runs (
    id, project_ref, fixture_version, source_fingerprint_sha256, package_fingerprint_sha256,
    status, expected_counts
  ) values (
    p_run_id, p_project_ref, p_fixture_version, p_source_fingerprint_sha256,
    p_package_fingerprint_sha256, 'planned', p_expected_counts
  ) on conflict (id) do nothing;
  select * into v_run from public.touchline_qa_fixture_runs where id = p_run_id for update;
  if v_run.project_ref <> p_project_ref
     or v_run.fixture_version <> p_fixture_version
     or v_run.source_fingerprint_sha256 <> p_source_fingerprint_sha256
     or v_run.package_fingerprint_sha256 <> p_package_fingerprint_sha256
     or v_run.expected_counts <> p_expected_counts
     or v_run.status <> 'planned' then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_STAGE_RUN_CONFLICT';
  end if;
  select * into v_existing from public.touchline_qa_fixture_payload_chunks
  where touchline_qa_fixture_payload_chunks.run_id = p_run_id
    and touchline_qa_fixture_payload_chunks.payload_kind = p_payload_kind
    and touchline_qa_fixture_payload_chunks.chunk_index = p_chunk_index
  for update;
  if found then
    if v_existing.payload is distinct from p_payload
       or v_existing.payload_hash_sha256 <> p_payload_hash_sha256
       or v_existing.payload_count <> jsonb_array_length(p_payload) then
      raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_STAGE_CHUNK_CONFLICT';
    end if;
    return query select p_run_id, p_payload_kind, p_chunk_index, v_existing.payload_count, true;
    return;
  end if;
  insert into public.touchline_qa_fixture_payload_chunks (
    run_id, payload_kind, chunk_index, payload, payload_hash_sha256, payload_count
  ) values (
    p_run_id, p_payload_kind, p_chunk_index, p_payload, p_payload_hash_sha256,
    jsonb_array_length(p_payload)
  );
  return query select p_run_id, p_payload_kind, p_chunk_index, jsonb_array_length(p_payload), false;
end;
$$;

create or replace function public.touchline_apply_representative_qa_package(
  p_project_ref text,
  p_run_id uuid,
  p_publication_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (run_id uuid, status text, observed_counts jsonb, idempotent_replay boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.touchline_qa_fixture_runs%rowtype;
  v_publication_rows jsonb;
  v_batch_id uuid;
  v_observed jsonb;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_run_id is null or p_actor_id is null or coalesce(p_publication_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_QA_FIXTURE_APPLY_COMMAND_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('touchline-representative-qa:' || p_run_id::text));
  select * into v_run from public.touchline_qa_fixture_runs where id = p_run_id for update;
  if not found or v_run.project_ref <> p_project_ref or v_run.status not in ('planned','applied') then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_APPLY_RUN_INVALID';
  end if;
  if v_run.status = 'applied' then
    return query select p_run_id, v_run.status, v_run.observed_counts, true;
    return;
  end if;
  if not exists (select 1 from public.users where id = p_actor_id) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ACTOR_MISSING';
  end if;
  if (select coalesce(sum(chunk.payload_count), 0) from public.touchline_qa_fixture_payload_chunks chunk where chunk.run_id = p_run_id and chunk.payload_kind = 'clubs') <> 20
     or (select coalesce(sum(chunk.payload_count), 0) from public.touchline_qa_fixture_payload_chunks chunk where chunk.run_id = p_run_id and chunk.payload_kind = 'players') <> 588
     or (select coalesce(sum(chunk.payload_count), 0) from public.touchline_qa_fixture_payload_chunks chunk where chunk.run_id = p_run_id and chunk.payload_kind = 'memberships') <> 588
     or (select coalesce(sum(chunk.payload_count), 0) from public.touchline_qa_fixture_payload_chunks chunk where chunk.run_id = p_run_id and chunk.payload_kind = 'publication_rows') <> 533
     or (select coalesce(sum(chunk.payload_count), 0) from public.touchline_qa_fixture_payload_chunks chunk where chunk.run_id = p_run_id and chunk.payload_kind = 'inventory') <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_APPLY_PAYLOAD_INCOMPLETE';
  end if;

  create temp table tl_qa_clubs on commit drop as
  select source.*, exists(select 1 from public.football_clubs current where current.id = source.id) as existed_before
  from public.touchline_qa_fixture_payload_chunks chunk
  cross join lateral jsonb_array_elements(chunk.payload) with ordinality item(value, ordinal)
  cross join lateral jsonb_to_record(item.value) as source(
    id uuid, provider text, "providerTeamId" text, "competitionId" uuid, name text, "sourceUpdatedAt" timestamptz
  ) where chunk.run_id = p_run_id and chunk.payload_kind = 'clubs';
  create temp table tl_qa_players on commit drop as
  select source.*, exists(select 1 from public.football_players current where current.id = source.id) as existed_before
  from public.touchline_qa_fixture_payload_chunks chunk
  cross join lateral jsonb_array_elements(chunk.payload) with ordinality item(value, ordinal)
  cross join lateral jsonb_to_record(item.value) as source(
    id uuid, provider text, "providerPlayerId" text, "currentClubId" uuid, name text, "displayName" text,
    position text, "sourceUpdatedAt" timestamptz
  ) where chunk.run_id = p_run_id and chunk.payload_kind = 'players';
  create temp table tl_qa_memberships on commit drop as
  select source.*, exists(select 1 from public.football_squad_members current where current.id = source.id) as existed_before
  from public.touchline_qa_fixture_payload_chunks chunk
  cross join lateral jsonb_array_elements(chunk.payload) with ordinality item(value, ordinal)
  cross join lateral jsonb_to_record(item.value) as source(
    id uuid, provider text, "clubId" uuid, "playerId" uuid, "competitionId" uuid,
    "jerseyNumber" integer, position text, status text, "sourceUpdatedAt" timestamptz
  ) where chunk.run_id = p_run_id and chunk.payload_kind = 'memberships';
  create temp table tl_qa_inventory on commit drop as
  select source.*, exists(select 1 from public.touchline_card_inventory current where current.player_id = source."playerId") as existed_before
  from public.touchline_qa_fixture_payload_chunks chunk
  cross join lateral jsonb_array_elements(chunk.payload) with ordinality item(value, ordinal)
  cross join lateral jsonb_to_record(item.value) as source(
    id uuid, "playerId" uuid, "clubId" uuid, "playerName" text, "clubName" text, tier text,
    "frameUrl" text, "cardTemplateUrl" text, "marketValueEur" bigint,
    "priceTableVersion" text, "publishedAt" timestamptz
  ) where chunk.run_id = p_run_id and chunk.payload_kind = 'inventory';
  select jsonb_agg(item.value order by chunk.chunk_index, item.ordinal)
  into v_publication_rows
  from public.touchline_qa_fixture_payload_chunks chunk
  cross join lateral jsonb_array_elements(chunk.payload) with ordinality item(value, ordinal)
  where chunk.run_id = p_run_id and chunk.payload_kind = 'publication_rows';

  if (select count(*) from tl_qa_clubs) <> 20
     or (select count(*) from tl_qa_players) <> 588
     or (select count(*) from tl_qa_memberships) <> 588
     or (select count(*) from tl_qa_inventory) <> 533
     or jsonb_array_length(v_publication_rows) <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_APPLY_TEMP_COUNTS_INVALID';
  end if;
  if not exists (
    select 1 from public.football_competitions where provider = 'sportmonks' and provider_competition_id = '8'
      and id = (select distinct "competitionId" from tl_qa_clubs)
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_COMPETITION_FENCE_FAILED';
  end if;
  if (select count(*) from public.touchline_card_inventory inventory
      join public.football_clubs club on club.id = inventory.club_id
      where club.provider = 'sportmonks' and club.provider_team_id = '8'
        and inventory.card_status = 'published' and inventory.sale_status = 'available') <> 29 then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_LIVERPOOL_BASELINE_INVALID';
  end if;
  if exists (
    select 1 from tl_qa_clubs expected join public.football_clubs current on current.id = expected.id
    where current.provider is distinct from expected.provider or current.provider_team_id is distinct from expected."providerTeamId"
       or current.competition_id is distinct from expected."competitionId" or current.name is distinct from expected.name
       or current.source_updated_at is distinct from expected."sourceUpdatedAt"
  ) or exists (
    select 1 from tl_qa_clubs expected join public.football_clubs current
      on current.provider = expected.provider and current.provider_team_id = expected."providerTeamId" where current.id <> expected.id
  ) then raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_CLUB_CONFLICT'; end if;
  if exists (
    select 1 from tl_qa_players expected join public.football_players current on current.id = expected.id
    where current.provider is distinct from expected.provider or current.provider_player_id is distinct from expected."providerPlayerId"
       or current.current_club_id is distinct from expected."currentClubId" or current.name is distinct from expected.name
       or current.display_name is distinct from expected."displayName" or current.source_updated_at is distinct from expected."sourceUpdatedAt"
  ) or exists (
    select 1 from tl_qa_players expected join public.football_players current
      on current.provider = expected.provider and current.provider_player_id = expected."providerPlayerId" where current.id <> expected.id
  ) then raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_PLAYER_CONFLICT'; end if;
  if exists (
    select 1 from tl_qa_memberships expected join public.football_squad_members current on current.id = expected.id
    where current.provider is distinct from expected.provider or current.club_id is distinct from expected."clubId"
       or current.player_id is distinct from expected."playerId" or current.competition_id is distinct from expected."competitionId"
       or current.status is distinct from expected.status or current.source_updated_at is distinct from expected."sourceUpdatedAt"
  ) then raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_MEMBERSHIP_CONFLICT'; end if;
  if exists (
    select 1 from tl_qa_inventory expected join public.touchline_card_inventory current on current.player_id = expected."playerId"
    where current.club_id is distinct from expected."clubId" or current.player_name is distinct from expected."playerName"
       or current.club_name is distinct from expected."clubName" or current.frame_color is distinct from expected.tier
       or current.frame_url is distinct from expected."frameUrl" or current.card_template_url is distinct from expected."cardTemplateUrl"
       or current.art_status <> 'ready' or current.card_status <> 'published' or current.sale_status <> 'available'
       or current.competition_tier is distinct from expected.tier or current.price_table_version is distinct from expected."priceTableVersion"
       or current.supply_limit <> 1000 or current.market_value_eur is distinct from expected."marketValueEur"
       or current.market_value_source is distinct from 'manual_approval'
  ) or exists (
    select 1 from tl_qa_inventory expected join public.touchline_card_inventory current on current.id = expected.id
    where current.player_id is distinct from expected."playerId"
  ) then raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_INVENTORY_CONFLICT'; end if;

  update public.touchline_qa_fixture_runs set status = 'applying' where id = p_run_id;
  insert into public.football_clubs (id, provider, provider_team_id, competition_id, name, source_updated_at)
  select id, provider, "providerTeamId", "competitionId", name, "sourceUpdatedAt" from tl_qa_clubs where not existed_before;
  insert into public.football_players (id, provider, provider_player_id, current_club_id, name, display_name, position, source_updated_at)
  select id, provider, "providerPlayerId", "currentClubId", name, "displayName", position, "sourceUpdatedAt" from tl_qa_players where not existed_before;
  insert into public.football_squad_members (id, provider, club_id, player_id, competition_id, jersey_number, position, status, source_updated_at)
  select membership.id, membership.provider, membership."clubId", membership."playerId", membership."competitionId",
    membership."jerseyNumber", membership.position, membership.status, membership."sourceUpdatedAt"
  from tl_qa_memberships membership where not membership.existed_before;

  insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership)
  select p_run_id, 'club', id, case when existed_before then 'preserved_canonical' else 'created_by_run' end from tl_qa_clubs on conflict do nothing;
  insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership)
  select p_run_id, 'player', id, case when existed_before then 'preserved_canonical' else 'created_by_run' end from tl_qa_players on conflict do nothing;
  insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership)
  select p_run_id, 'membership', id, case when existed_before then 'preserved_canonical' else 'created_by_run' end from tl_qa_memberships on conflict do nothing;

  if exists (
    select 1 from public.touchline_card_publication_batches
    where manifest_fingerprint_sha256 = p_publication_fingerprint_sha256 and manifest_payload is distinct from v_publication_rows
  ) then raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_PUBLICATION_BATCH_CONFLICT'; end if;
  if not exists (select 1 from public.touchline_card_publication_batches where manifest_fingerprint_sha256 = p_publication_fingerprint_sha256) then
    perform * from public.touchline_apply_owner_approved_533_card_publications(v_publication_rows, p_publication_fingerprint_sha256, p_actor_id);
  end if;
  perform * from public.touchline_publish_owner_approved_533_card_publications(p_publication_fingerprint_sha256, p_actor_id);
  select id into v_batch_id from public.touchline_card_publication_batches where manifest_fingerprint_sha256 = p_publication_fingerprint_sha256;

  insert into public.touchline_card_inventory (
    id, player_id, club_id, player_name, club_name, frame_color, frame_url, card_template_url,
    art_status, card_status, sale_status, published_at, metadata, created_by, updated_by,
    competition_tier, price_table_version, supply_limit, market_value_eur, market_value_updated_at, market_value_source
  ) select expected.id, expected."playerId", expected."clubId", expected."playerName", expected."clubName",
    expected.tier, expected."frameUrl", expected."cardTemplateUrl", 'ready', 'published', 'available', expected."publishedAt",
    jsonb_build_object('touchline_qa_fixture_version', v_run.fixture_version, 'qa_fixture_run_id', p_run_id),
    p_actor_id, p_actor_id, expected.tier, expected."priceTableVersion", 1000,
    expected."marketValueEur", expected."publishedAt", 'manual_approval'
  from tl_qa_inventory expected where not expected.existed_before;
  insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership, metadata)
  select p_run_id, 'inventory', current.id, case when expected.existed_before then 'preserved_canonical' else 'created_by_run' end,
    jsonb_build_object('player_id', expected."playerId")
  from tl_qa_inventory expected join public.touchline_card_inventory current on current.player_id = expected."playerId" on conflict do nothing;
  insert into public.touchline_qa_fixture_objects (run_id, object_kind, object_id, ownership, metadata)
  values (p_run_id, 'publication_batch', v_batch_id, 'created_by_run', jsonb_build_object('manifest_fingerprint_sha256', p_publication_fingerprint_sha256))
  on conflict do nothing;

  if (select count(*) from tl_qa_clubs expected join public.football_clubs current on current.id = expected.id) <> 20
     or (select count(*) from tl_qa_players expected join public.football_players current on current.id = expected.id) <> 588
     or (select count(*) from tl_qa_memberships expected join public.football_squad_members current on current.id = expected.id and current.status = 'active') <> 588
     or (select count(*) from tl_qa_inventory expected join public.touchline_card_inventory current on current.player_id = expected."playerId" and current.card_status = 'published') <> 533
     or (select count(*) from public.touchline_card_publications where publication_status = 'published') <> 562
     or (select count(*) from public.touchline_card_inventory where card_status = 'published' and sale_status = 'available') <> 562
     or (select count(distinct competition_tier) from public.touchline_card_inventory where card_status = 'published') <> 7 then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_FINAL_COUNTS_INVALID';
  end if;
  v_observed := jsonb_build_object(
    'clubs', 20, 'players', 588, 'memberships', 588, 'ownerApprovedCards', 533,
    'preservedLiverpoolCards', 29, 'publishedCards', 562, 'inventoryCards', 562, 'tiers', 7
  );
  update public.touchline_qa_fixture_runs
  set status = 'applied', observed_counts = v_observed, applied_at = coalesce(applied_at, clock_timestamp())
  where id = p_run_id;
  return query select p_run_id, 'applied'::text, v_observed, false;
end;
$$;

create or replace function public.touchline_rollback_representative_qa_package(
  p_project_ref text,
  p_run_id uuid,
  p_publication_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (run_id uuid, status text, idempotent_replay boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_run public.touchline_qa_fixture_runs%rowtype;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  perform pg_advisory_xact_lock(hashtext('touchline-representative-qa:' || p_run_id::text));
  select * into v_run from public.touchline_qa_fixture_runs where id = p_run_id for update;
  if not found or v_run.project_ref <> p_project_ref or v_run.status not in ('applied','rolled_back') then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ROLLBACK_RUN_INVALID';
  end if;
  if v_run.status = 'rolled_back' then return query select p_run_id, v_run.status, true; return; end if;
  if exists (
    select 1 from public.touchline_card_contracts contract join public.touchline_qa_fixture_objects object on object.object_id = contract.card_id
    where object.run_id = p_run_id and object.object_kind = 'inventory' and object.ownership = 'created_by_run'
  ) or exists (
    select 1 from public.touchline_market_order_items item join public.touchline_qa_fixture_objects object on object.object_id = item.card_id
    where object.run_id = p_run_id and object.object_kind = 'inventory' and object.ownership = 'created_by_run'
  ) then raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_ROLLBACK_DEPENDENCIES_EXIST'; end if;
  update public.touchline_qa_fixture_runs set status = 'rolling_back' where id = p_run_id;
  delete from public.touchline_card_inventory inventory using public.touchline_qa_fixture_objects object
  where object.run_id = p_run_id and object.object_kind = 'inventory' and object.ownership = 'created_by_run' and inventory.id = object.object_id;
  perform * from public.touchline_revert_owner_approved_533_card_publications(p_publication_fingerprint_sha256, p_actor_id);
  update public.touchline_qa_fixture_runs set status = 'rolled_back', rolled_back_at = clock_timestamp() where id = p_run_id;
  return query select p_run_id, 'rolled_back'::text, false;
end;
$$;

revoke all on function public.touchline_stage_representative_qa_chunk(text,uuid,text,text,text,jsonb,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.touchline_apply_representative_qa_package(text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.touchline_rollback_representative_qa_package(text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.touchline_stage_representative_qa_chunk(text,uuid,text,text,text,jsonb,text,integer,jsonb,text) to service_role;
grant execute on function public.touchline_apply_representative_qa_package(text,uuid,text,uuid) to service_role;
grant execute on function public.touchline_rollback_representative_qa_package(text,uuid,text,uuid) to service_role;

commit;
