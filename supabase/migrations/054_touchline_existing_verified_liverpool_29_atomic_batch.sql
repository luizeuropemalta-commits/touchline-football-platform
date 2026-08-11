-- Atomic lifecycle publication for the existing verified Liverpool values.
--
-- This command is intentionally separate from the owner-approved 533 command.
-- It never inserts, updates, deletes, or reclassifies football_player_market_values:
-- it binds the exact pre-existing 29 verified Liverpool values to the protected
-- card-publication lifecycle after proving the canonical roster fence.

begin;
set local lock_timeout = '5s';

create or replace function public.touchline_apply_existing_verified_liverpool_29_card_publications(
  p_rows jsonb,
  p_manifest_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (
  batch_id uuid,
  batch_status text,
  applied_rows integer,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.touchline_card_publication_batches%rowtype;
  v_row jsonb;
  v_player public.football_players%rowtype;
  v_value public.football_player_market_values%rowtype;
  v_publication public.touchline_card_publications%rowtype;
  v_history_id uuid;
  v_rows_count integer;
  v_competition_id uuid;
  v_effective_season text;
begin
  if p_actor_id is null
     or p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or coalesce(p_manifest_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_LIVERPOOL_29_BATCH_COMMAND_INVALID';
  end if;
  v_rows_count := jsonb_array_length(p_rows);
  if v_rows_count <> 29 then
    raise exception using errcode = '22023', message = 'TL_LIVERPOOL_29_BATCH_COUNT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('touchline-existing-verified-liverpool-29:' || p_manifest_fingerprint_sha256));
  select * into v_batch
    from public.touchline_card_publication_batches
   where manifest_fingerprint_sha256 = p_manifest_fingerprint_sha256
   for update;
  if found then
    if v_batch.manifest_payload is distinct from p_rows then
      raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_BATCH_FINGERPRINT_REUSED';
    end if;
    if v_batch.rows_received <> 29 or v_batch.ready_rows <> 29 or v_batch.club_id is null then
      raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_BATCH_REPLAY_INVALID';
    end if;
    return query select v_batch.id, v_batch.status, v_batch.ready_rows, true;
    return;
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_rows) as row(
        "rowIdempotencyKeySha256" text,
        "canonicalPlayerId" text,
        "canonicalClubId" text,
        "canonicalMembershipId" text,
        "canonicalCompetitionId" text,
        "providerTeamId" text,
        "providerPlayerId" text,
        "manualMarketValueEur" bigint,
        currency text,
        "calculatedTier" text,
        "canonicalNominalPriceGbp" integer,
        "policyVersion" text,
        "effectiveSeason" text,
        "lastReviewedAt" timestamptz,
        "publicationAction" text,
        "sourceUpdatedAt" jsonb
      )
     where row."rowIdempotencyKeySha256" !~ '^[0-9a-f]{64}$'
        or row."canonicalPlayerId" is null or row."canonicalClubId" is null
        or row."canonicalMembershipId" is null or row."canonicalCompetitionId" is null
        or row."providerTeamId" <> '8' or row."providerPlayerId" !~ '^[0-9]+$'
        or row."manualMarketValueEur" is null or row."manualMarketValueEur" < 0
        or row.currency <> 'EUR'
        or row."calculatedTier" not in ('ruby-red','sapphire-blue','amethyst-purple','radiant-gold','emerald-green','clear-diamond','diamond-gold')
        or row."canonicalNominalPriceGbp" <> (case row."calculatedTier"
          when 'ruby-red' then 0 when 'sapphire-blue' then 1 when 'amethyst-purple' then 2
          when 'radiant-gold' then 4 when 'emerald-green' then 7 when 'clear-diamond' then 10
          when 'diamond-gold' then 15 else -1 end)
        or nullif(trim(row."policyVersion"), '') is null
        or nullif(trim(row."effectiveSeason"), '') is null
        or row."lastReviewedAt" is null or row."publicationAction" <> 'ready_to_publish'
        or row."sourceUpdatedAt" is null
        or nullif(row."sourceUpdatedAt" ->> 'player', '') is null
        or nullif(row."sourceUpdatedAt" ->> 'club', '') is null
        or nullif(row."sourceUpdatedAt" ->> 'membership', '') is null
        or nullif(row."sourceUpdatedAt" ->> 'competition', '') is null
  ) then
    raise exception using errcode = '22023', message = 'TL_LIVERPOOL_29_BATCH_ROW_INVALID';
  end if;

  if (select count(distinct row."rowIdempotencyKeySha256") from jsonb_to_recordset(p_rows) as row("rowIdempotencyKeySha256" text)) <> 29
     or (select count(distinct row."canonicalPlayerId") from jsonb_to_recordset(p_rows) as row("canonicalPlayerId" text)) <> 29
     or (select count(distinct row."canonicalMembershipId") from jsonb_to_recordset(p_rows) as row("canonicalMembershipId" text)) <> 29
     or (select count(distinct row."providerPlayerId") from jsonb_to_recordset(p_rows) as row("providerPlayerId" text)) <> 29
     or (select count(distinct row."canonicalClubId") from jsonb_to_recordset(p_rows) as row("canonicalClubId" text)) <> 1
     or (select count(distinct row."canonicalCompetitionId") from jsonb_to_recordset(p_rows) as row("canonicalCompetitionId" text)) <> 1
     or (select count(distinct row."effectiveSeason") from jsonb_to_recordset(p_rows) as row("effectiveSeason" text)) <> 1 then
    raise exception using errcode = '22023', message = 'TL_LIVERPOOL_29_BATCH_SCOPE_INVALID';
  end if;

  select min(row."canonicalCompetitionId")::uuid, min(row."effectiveSeason")
    into v_competition_id, v_effective_season
    from jsonb_to_recordset(p_rows) as row("canonicalCompetitionId" text, "effectiveSeason" text);

  -- This is the decisive fence. It matches the archival values and canonical
  -- identity exactly, including timestamp and policy/tier/price. No value row
  -- is written in this function.
  if exists (
    select 1
      from jsonb_to_recordset(p_rows) as row(
        "canonicalPlayerId" uuid, "canonicalClubId" uuid, "canonicalMembershipId" uuid,
        "canonicalCompetitionId" uuid, "providerTeamId" text, "providerPlayerId" text,
        "manualMarketValueEur" bigint, "calculatedTier" text, "canonicalNominalPriceGbp" integer,
        "effectiveSeason" text, "lastReviewedAt" timestamptz, "sourceUpdatedAt" jsonb
      )
      left join public.football_players as player on player.id = row."canonicalPlayerId"
      left join public.football_clubs as club on club.id = row."canonicalClubId"
      left join public.football_squad_members as membership on membership.id = row."canonicalMembershipId"
      left join public.football_competitions as competition on competition.id = row."canonicalCompetitionId"
      left join public.football_player_market_values as value on value.player_id = player.id
     where player.id is null or club.id is null or membership.id is null or competition.id is null or value.id is null
        or player.provider <> 'sportmonks' or player.provider_player_id <> row."providerPlayerId"
        or player.current_club_id <> club.id or club.provider <> 'sportmonks' or club.provider_team_id <> '8'
        or club.competition_id <> competition.id
        or membership.player_id <> player.id or membership.club_id <> club.id
        or membership.competition_id <> competition.id or membership.provider <> 'sportmonks' or membership.status <> 'active'
        or competition.provider <> 'sportmonks' or competition.provider_competition_id <> '8'
        or value.market_value_eur <> row."manualMarketValueEur" or value.currency <> 'EUR'
        or value.status <> 'verified' or value.confidence <> 'verified'
        or value.verified_season <> row."effectiveSeason" or value.last_verified <> row."lastReviewedAt"
        or row."calculatedTier" <> (case
          when value.market_value_eur < 6000000 then 'ruby-red' when value.market_value_eur < 10000000 then 'sapphire-blue'
          when value.market_value_eur < 20000000 then 'amethyst-purple' when value.market_value_eur < 35000000 then 'radiant-gold'
          when value.market_value_eur < 50000000 then 'emerald-green' when value.market_value_eur < 70000000 then 'clear-diamond'
          else 'diamond-gold' end)
        or player.source_updated_at <> (row."sourceUpdatedAt" ->> 'player')::timestamptz
        or club.source_updated_at <> (row."sourceUpdatedAt" ->> 'club')::timestamptz
        or membership.source_updated_at <> (row."sourceUpdatedAt" ->> 'membership')::timestamptz
        or competition.source_updated_at <> (row."sourceUpdatedAt" ->> 'competition')::timestamptz
        or (select count(*) from public.football_squad_members active_membership
             where active_membership.player_id = player.id and active_membership.provider = 'sportmonks'
               and active_membership.status = 'active') <> 1
        or exists (select 1 from public.touchline_card_publications prior where prior.player_id = player.id)
  ) then
    raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_BATCH_CANONICAL_FENCE_FAILED';
  end if;

  insert into public.touchline_card_publication_batches (
    scope, competition_id, club_id, effective_season, currency, status,
    rows_received, ready_rows, review_rows, manifest_fingerprint_sha256, manifest_payload, applied_at, created_by
  ) values (
    'club', v_competition_id,
    (select (value ->> 'canonicalClubId')::uuid from jsonb_array_elements(p_rows) limit 1),
    v_effective_season, 'EUR', 'review', 29, 29, 0, p_manifest_fingerprint_sha256, p_rows, clock_timestamp(), p_actor_id
  ) returning * into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    select * into v_player from public.football_players where id = (v_row ->> 'canonicalPlayerId')::uuid for update;
    select * into v_value from public.football_player_market_values where player_id = v_player.id for update;
    insert into public.touchline_card_publications (
      player_id, current_membership_id, competition_id, effective_season, market_value_id,
      publication_status, calculated_tier, calculated_price_tc, calculated_nominal_price_gbp,
      policy_version, last_reviewed_at, internal_source, current_batch_id, created_by, updated_by, version
    ) values (
      v_player.id, (v_row ->> 'canonicalMembershipId')::uuid, (v_row ->> 'canonicalCompetitionId')::uuid,
      v_row ->> 'effectiveSeason', v_value.id, 'ready_to_publish', v_row ->> 'calculatedTier',
      (v_row ->> 'canonicalNominalPriceGbp')::integer, (v_row ->> 'canonicalNominalPriceGbp')::integer,
      v_row ->> 'policyVersion', (v_row ->> 'lastReviewedAt')::timestamptz,
      'existing-liverpool-manual-approval', v_batch.id, p_actor_id, p_actor_id, 1
    ) returning * into v_publication;
    insert into public.touchline_card_publication_history (
      publication_id, batch_id, player_id, provider_player_id, action,
      previous_market_value_eur, new_market_value_eur, currency, previous_tier, new_tier,
      nominal_price_tc, nominal_price_gbp, before_state, after_state, actor_id
    ) values (
      v_publication.id, v_batch.id, v_player.id, v_player.provider_player_id, 'ready_to_publish',
      v_value.market_value_eur, v_value.market_value_eur, 'EUR', null, v_publication.calculated_tier,
      v_publication.calculated_price_tc, v_publication.calculated_nominal_price_gbp,
      jsonb_build_object('publication', null, 'market_value', to_jsonb(v_value)),
      jsonb_build_object('publication', to_jsonb(v_publication), 'market_value', to_jsonb(v_value)), p_actor_id
    ) returning id into v_history_id;
    insert into public.touchline_card_publication_batch_rows(batch_id, player_id, publication_id, preparation_history_id)
    values (v_batch.id, v_player.id, v_publication.id, v_history_id);
  end loop;
  if (select count(*) from public.touchline_card_publication_batch_rows as batch_row where batch_row.batch_id = v_batch.id) <> 29 then
    raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_BATCH_HISTORY_LINK_COUNT_INVALID';
  end if;
  return query select v_batch.id, v_batch.status, 29, false;
end;
$$;

create or replace function public.touchline_publish_existing_verified_liverpool_29_card_publications(
  p_manifest_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (batch_id uuid, batch_status text, published_rows integer, idempotent_replay boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_batch public.touchline_card_publication_batches%rowtype; v_ready_count integer;
begin
  if p_actor_id is null or coalesce(p_manifest_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_LIVERPOOL_29_PUBLISH_COMMAND_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('touchline-existing-verified-liverpool-29:' || p_manifest_fingerprint_sha256));
  select * into v_batch from public.touchline_card_publication_batches where manifest_fingerprint_sha256 = p_manifest_fingerprint_sha256 for update;
  if not found or v_batch.rows_received <> 29 or v_batch.ready_rows <> 29 or v_batch.club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_PUBLISH_BATCH_NOT_READY';
  end if;
  if v_batch.status = 'published' then return query select v_batch.id, v_batch.status, 29, true; return; end if;
  if v_batch.status <> 'review' then raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_PUBLISH_BATCH_STATE_INVALID'; end if;
  select count(*) into v_ready_count
    from public.touchline_card_publications publication
    join public.football_player_market_values value on value.id = publication.market_value_id
    join public.football_players player on player.id = publication.player_id
    join public.football_squad_members membership on membership.id = publication.current_membership_id
   where publication.current_batch_id = v_batch.id and publication.publication_status = 'ready_to_publish'
     and publication.competition_id = v_batch.competition_id and player.current_club_id = v_batch.club_id
     and membership.player_id = player.id and membership.club_id = v_batch.club_id and membership.status = 'active'
     and membership.provider = 'sportmonks' and value.status = 'verified' and value.confidence = 'verified';
  if v_ready_count <> 29 or (select count(*) from public.touchline_card_publication_batch_rows as batch_row where batch_row.batch_id = v_batch.id) <> 29 then
    raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_PUBLISH_CANONICAL_FENCE_FAILED';
  end if;
  with before_rows as (
    select publication.*, value.market_value_eur, value.currency, player.provider_player_id
      from public.touchline_card_publications publication
      join public.football_player_market_values value on value.id = publication.market_value_id
      join public.football_players player on player.id = publication.player_id
     where publication.current_batch_id = v_batch.id and publication.publication_status = 'ready_to_publish' for update
  ), published_card_rows as (
    update public.touchline_card_publications publication set publication_status = 'published', published_at = clock_timestamp(),
      unpublished_at = null, updated_by = p_actor_id, version = publication.version + 1
      from before_rows where publication.id = before_rows.id returning publication.*
  )
  insert into public.touchline_card_publication_history (
    publication_id, batch_id, player_id, provider_player_id, action, previous_market_value_eur, new_market_value_eur,
    currency, previous_tier, new_tier, nominal_price_tc, nominal_price_gbp, before_state, after_state, actor_id
  ) select published_card_rows.id, v_batch.id, published_card_rows.player_id, before_rows.provider_player_id, 'published',
    before_rows.market_value_eur, before_rows.market_value_eur, before_rows.currency, before_rows.calculated_tier,
    published_card_rows.calculated_tier, published_card_rows.calculated_price_tc, published_card_rows.calculated_nominal_price_gbp,
    jsonb_build_object('publication', to_jsonb(before_rows), 'market_value', jsonb_build_object('id', before_rows.market_value_id, 'market_value_eur', before_rows.market_value_eur, 'currency', before_rows.currency)),
    jsonb_build_object('publication', to_jsonb(published_card_rows), 'market_value', jsonb_build_object('id', before_rows.market_value_id, 'market_value_eur', before_rows.market_value_eur, 'currency', before_rows.currency)), p_actor_id
  from published_card_rows join before_rows on before_rows.id = published_card_rows.id;
  update public.touchline_card_publication_batches set status = 'published', published_at = clock_timestamp() where id = v_batch.id;
  return query select v_batch.id, 'published'::text, 29, false;
end;
$$;

-- Emergency rollback leaves the pre-existing verified Liverpool value intact.
-- It only unpublishes lifecycle records and is all-or-nothing.
create or replace function public.touchline_revert_existing_verified_liverpool_29_card_publications(
  p_manifest_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (batch_id uuid, batch_status text, reverted_rows integer, idempotent_replay boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_batch public.touchline_card_publication_batches%rowtype; v_count integer;
begin
  if p_actor_id is null or coalesce(p_manifest_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_LIVERPOOL_29_REVERT_COMMAND_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('touchline-existing-verified-liverpool-29:' || p_manifest_fingerprint_sha256));
  select * into v_batch from public.touchline_card_publication_batches where manifest_fingerprint_sha256 = p_manifest_fingerprint_sha256 for update;
  if not found or v_batch.rows_received <> 29 or v_batch.ready_rows <> 29 then
    raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_REVERT_BATCH_NOT_READY';
  end if;
  if v_batch.status = 'reverted' then return query select v_batch.id, v_batch.status, 29, true; return; end if;
  if v_batch.status not in ('review','published') then raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_REVERT_BATCH_STATE_INVALID'; end if;
  select count(*) into v_count from public.touchline_card_publication_batch_rows as batch_row where batch_row.batch_id = v_batch.id;
  if v_count <> 29 then raise exception using errcode = 'P0001', message = 'TL_LIVERPOOL_29_REVERT_HISTORY_LINK_COUNT_INVALID'; end if;
  with before_rows as (
    select publication.*, value.market_value_eur, value.currency, player.provider_player_id
      from public.touchline_card_publications publication
      join public.football_player_market_values value on value.id = publication.market_value_id
      join public.football_players player on player.id = publication.player_id
     where publication.current_batch_id = v_batch.id for update
  ), reverted_card_rows as (
    update public.touchline_card_publications publication set publication_status = 'market_value_required',
      calculated_tier = null, calculated_price_tc = null, calculated_nominal_price_gbp = null, policy_version = null,
      published_at = null, unpublished_at = clock_timestamp(), current_batch_id = null, updated_by = p_actor_id,
      version = publication.version + 1
      from before_rows where publication.id = before_rows.id returning publication.*
  )
  insert into public.touchline_card_publication_history (
    publication_id, batch_id, player_id, provider_player_id, action, previous_market_value_eur, new_market_value_eur,
    currency, previous_tier, new_tier, nominal_price_tc, nominal_price_gbp, before_state, after_state, actor_id
  ) select reverted_card_rows.id, v_batch.id, reverted_card_rows.player_id, before_rows.provider_player_id, 'reverted',
    before_rows.market_value_eur, before_rows.market_value_eur, before_rows.currency, before_rows.calculated_tier,
    null, null, null,
    jsonb_build_object('publication', to_jsonb(before_rows), 'market_value', jsonb_build_object('id', before_rows.market_value_id, 'market_value_eur', before_rows.market_value_eur, 'currency', before_rows.currency)),
    jsonb_build_object('publication', to_jsonb(reverted_card_rows), 'market_value', jsonb_build_object('id', before_rows.market_value_id, 'market_value_eur', before_rows.market_value_eur, 'currency', before_rows.currency)), p_actor_id
  from reverted_card_rows join before_rows on before_rows.id = reverted_card_rows.id;
  update public.touchline_card_publication_batches set status = 'reverted', published_at = null where id = v_batch.id;
  return query select v_batch.id, 'reverted'::text, 29, false;
end;
$$;

revoke all on function public.touchline_apply_existing_verified_liverpool_29_card_publications(jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_apply_existing_verified_liverpool_29_card_publications(jsonb, text, uuid) to service_role;
revoke all on function public.touchline_publish_existing_verified_liverpool_29_card_publications(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_publish_existing_verified_liverpool_29_card_publications(text, uuid) to service_role;
revoke all on function public.touchline_revert_existing_verified_liverpool_29_card_publications(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_revert_existing_verified_liverpool_29_card_publications(text, uuid) to service_role;

commit;
