-- All-or-nothing application command for the reviewed owner-approved
-- 2026/27 Premier League publication manifest. This is additive and keeps
-- the public publication gate off: every accepted row is only
-- `ready_to_publish` until a separately reviewed cutover.

begin;
set local lock_timeout = '5s';

alter table public.touchline_card_publication_batches
  add column if not exists manifest_fingerprint_sha256 char(64),
  add column if not exists manifest_payload jsonb,
  add column if not exists applied_at timestamptz;

create unique index if not exists touchline_card_publication_batches_manifest_fingerprint_key
  on public.touchline_card_publication_batches(manifest_fingerprint_sha256)
  where manifest_fingerprint_sha256 is not null;

-- Immutable links to the original preparation-history row give the full batch
-- one rollback source of truth. They are never exposed to public readers.
create table if not exists public.touchline_card_publication_batch_rows (
  batch_id uuid not null references public.touchline_card_publication_batches(id) on delete restrict,
  player_id uuid not null references public.football_players(id) on delete restrict,
  publication_id uuid not null references public.touchline_card_publications(id) on delete restrict,
  preparation_history_id uuid not null references public.touchline_card_publication_history(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (batch_id, player_id),
  unique (batch_id, publication_id),
  unique (preparation_history_id)
);
alter table public.touchline_card_publication_batch_rows enable row level security;
revoke all on public.touchline_card_publication_batch_rows from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_card_publication_batch_rows to service_role;

create or replace function public.touchline_apply_owner_approved_533_card_publications(
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
  v_result record;
  v_effective_season text;
  v_competition_id uuid;
  v_rows_count integer;
  v_preparation_history_id uuid;
  v_replay boolean := false;
begin
  if p_actor_id is null
     or p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or coalesce(p_manifest_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_BATCH_COMMAND_INVALID';
  end if;

  v_rows_count := jsonb_array_length(p_rows);
  if v_rows_count <> 533 then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_BATCH_COUNT_INVALID';
  end if;

  -- Serialize only this immutable manifest. A retry may return the exact
  -- previous result but a different payload cannot reuse its fingerprint.
  perform pg_advisory_xact_lock(hashtext('touchline-owner-approved-533:' || p_manifest_fingerprint_sha256));
  select * into v_batch
    from public.touchline_card_publication_batches
   where manifest_fingerprint_sha256 = p_manifest_fingerprint_sha256
   for update;
  if found then
    if v_batch.manifest_payload is distinct from p_rows then
      raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_BATCH_FINGERPRINT_REUSED';
    end if;
    if v_batch.status <> 'review' or v_batch.ready_rows <> 533 then
      raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_BATCH_REPLAY_INVALID';
    end if;
    return query select v_batch.id, v_batch.status, v_batch.ready_rows, true;
    return;
  end if;

  -- Validate the whole manifest before any call that can write. JSON rows are
  -- deliberately typed here, so malformed UUID/timestamp/numeric input aborts
  -- this transaction before the batch row or a player value can persist.
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
        or row."canonicalPlayerId" is null
        or row."canonicalClubId" is null
        or row."canonicalMembershipId" is null
        or row."canonicalCompetitionId" is null
        or row."providerTeamId" !~ '^[0-9]+$'
        or row."providerPlayerId" !~ '^[0-9]+$'
        or row."manualMarketValueEur" is null or row."manualMarketValueEur" < 0
        or row.currency <> 'EUR'
        or row."calculatedTier" not in ('ruby-red','sapphire-blue','amethyst-purple','radiant-gold','emerald-green','clear-diamond','diamond-gold')
        or row."canonicalNominalPriceGbp" is null or row."canonicalNominalPriceGbp" < 0
        or nullif(trim(row."policyVersion"), '') is null
        or nullif(trim(row."effectiveSeason"), '') is null
        or row."lastReviewedAt" is null
        or row."publicationAction" <> 'ready_to_publish'
        or row."sourceUpdatedAt" is null
        or nullif(row."sourceUpdatedAt" ->> 'player', '') is null
        or nullif(row."sourceUpdatedAt" ->> 'club', '') is null
        or nullif(row."sourceUpdatedAt" ->> 'membership', '') is null
        or nullif(row."sourceUpdatedAt" ->> 'competition', '') is null
  ) then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_BATCH_ROW_INVALID';
  end if;

  if (select count(distinct row."rowIdempotencyKeySha256") from jsonb_to_recordset(p_rows) as row("rowIdempotencyKeySha256" text)) <> 533
     or (select count(distinct row."canonicalPlayerId") from jsonb_to_recordset(p_rows) as row("canonicalPlayerId" text)) <> 533
     or (select count(distinct row."canonicalMembershipId") from jsonb_to_recordset(p_rows) as row("canonicalMembershipId" text)) <> 533
     or (select count(distinct row."providerTeamId" || ':' || row."providerPlayerId") from jsonb_to_recordset(p_rows) as row("providerTeamId" text, "providerPlayerId" text)) <> 533 then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_BATCH_DUPLICATE';
  end if;

  select min(row."effectiveSeason"), min(row."canonicalCompetitionId")::uuid
    into v_effective_season, v_competition_id
    from jsonb_to_recordset(p_rows) as row("effectiveSeason" text, "canonicalCompetitionId" text);
  if (select count(distinct row."effectiveSeason") from jsonb_to_recordset(p_rows) as row("effectiveSeason" text)) <> 1
     or (select count(distinct row."canonicalCompetitionId") from jsonb_to_recordset(p_rows) as row("canonicalCompetitionId" text)) <> 1 then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_BATCH_SCOPE_INVALID';
  end if;

  -- Re-read the exact canonical identity and freshness fence for every row.
  -- This rejects roster moves, duplicate active memberships, and a changed
  -- canonical export before a single manual value is written.
  if exists (
    select 1
      from jsonb_to_recordset(p_rows) as row(
        "canonicalPlayerId" uuid,
        "canonicalClubId" uuid,
        "canonicalMembershipId" uuid,
        "canonicalCompetitionId" uuid,
        "providerTeamId" text,
        "providerPlayerId" text,
        "sourceUpdatedAt" jsonb
      )
      left join public.football_players as player on player.id = row."canonicalPlayerId"
      left join public.football_clubs as club on club.id = row."canonicalClubId"
      left join public.football_squad_members as membership on membership.id = row."canonicalMembershipId"
      left join public.football_competitions as competition on competition.id = row."canonicalCompetitionId"
     where player.id is null
        or club.id is null
        or membership.id is null
        or competition.id is null
        or player.provider <> 'sportmonks'
        or player.provider_player_id <> row."providerPlayerId"
        or player.current_club_id <> club.id
        or club.provider <> 'sportmonks'
        or club.provider_team_id <> row."providerTeamId"
        or club.competition_id <> competition.id
        or membership.player_id <> player.id
        or membership.club_id <> club.id
        or membership.competition_id <> competition.id
        or membership.provider <> 'sportmonks'
        or membership.status <> 'active'
        or competition.provider <> 'sportmonks'
        or competition.provider_competition_id <> '8'
        or player.source_updated_at <> (row."sourceUpdatedAt" ->> 'player')::timestamptz
        or club.source_updated_at <> (row."sourceUpdatedAt" ->> 'club')::timestamptz
        or membership.source_updated_at <> (row."sourceUpdatedAt" ->> 'membership')::timestamptz
        or competition.source_updated_at <> (row."sourceUpdatedAt" ->> 'competition')::timestamptz
        or (select count(*) from public.football_squad_members as active_membership
             where active_membership.player_id = player.id
               and active_membership.provider = 'sportmonks'
               and active_membership.status = 'active') <> 1
  ) then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_BATCH_CANONICAL_FENCE_FAILED';
  end if;

  insert into public.touchline_card_publication_batches (
    scope, competition_id, effective_season, currency, status,
    rows_received, ready_rows, review_rows, manifest_fingerprint_sha256,
    manifest_payload, applied_at, created_by
  ) values (
    'competition', v_competition_id, v_effective_season, 'EUR', 'review',
    533, 533, 0, p_manifest_fingerprint_sha256, p_rows, clock_timestamp(), p_actor_id
  ) returning * into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    select * into v_result
      from public.touchline_apply_manual_card_publication(
        (v_row ->> 'canonicalPlayerId')::uuid,
        (v_row ->> 'canonicalMembershipId')::uuid,
        (v_row ->> 'canonicalCompetitionId')::uuid,
        v_row ->> 'effectiveSeason',
        (v_row ->> 'manualMarketValueEur')::bigint,
        v_row ->> 'calculatedTier',
        (v_row ->> 'canonicalNominalPriceGbp')::integer,
        v_row ->> 'policyVersion',
        'ready_to_publish',
        (v_row ->> 'lastReviewedAt')::timestamptz,
        null,
        'owner-approved-2026-08-09',
        p_actor_id
      );
    update public.touchline_card_publications
       set current_batch_id = v_batch.id,
           updated_by = p_actor_id
     where id = v_result.publication_id
       and publication_status = 'ready_to_publish';
    if not found then
      raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_BATCH_PUBLICATION_ASSIGNMENT_FAILED';
    end if;
    select history.id into v_preparation_history_id
      from public.touchline_card_publication_history as history
     where history.publication_id = v_result.publication_id
       and history.action = 'ready_to_publish'
       and history.actor_id = p_actor_id
     order by history.created_at desc
     limit 1
     for update;
    if v_preparation_history_id is null then
      raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_BATCH_HISTORY_LINK_MISSING';
    end if;
    insert into public.touchline_card_publication_batch_rows (
      batch_id, player_id, publication_id, preparation_history_id
    ) values (
      v_batch.id, v_result.player_id, v_result.publication_id, v_preparation_history_id
    );
  end loop;

  if (select count(*) from public.touchline_card_publication_batch_rows as batch_row where batch_row.batch_id = v_batch.id) <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_BATCH_HISTORY_LINK_COUNT_INVALID';
  end if;

  return query select v_batch.id, v_batch.status, v_batch.ready_rows, false;
end;
$$;

-- Cutover is deliberately a second command. It can only promote the exact
-- complete, review-prepared 533-row batch; it never creates a player/value
-- and cannot publish a partial club or a different fingerprint.
create or replace function public.touchline_publish_owner_approved_533_card_publications(
  p_manifest_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (
  batch_id uuid,
  batch_status text,
  published_rows integer,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.touchline_card_publication_batches%rowtype;
  v_ready_count integer;
begin
  if p_actor_id is null
     or coalesce(p_manifest_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_PUBLISH_COMMAND_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('touchline-owner-approved-533:' || p_manifest_fingerprint_sha256));
  select * into v_batch
    from public.touchline_card_publication_batches
   where manifest_fingerprint_sha256 = p_manifest_fingerprint_sha256
   for update;
  if not found or v_batch.rows_received <> 533 or v_batch.ready_rows <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_PUBLISH_BATCH_NOT_READY';
  end if;
  if v_batch.status = 'published' then
    return query select v_batch.id, v_batch.status, v_batch.ready_rows, true;
    return;
  end if;
  if v_batch.status <> 'review' then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_PUBLISH_BATCH_STATE_INVALID';
  end if;

  select count(*) into v_ready_count
    from public.touchline_card_publications as publication
    join public.football_player_market_values as value on value.id = publication.market_value_id
    join public.football_players as player on player.id = publication.player_id
    join public.football_squad_members as membership on membership.id = publication.current_membership_id
   where publication.current_batch_id = v_batch.id
     and publication.publication_status = 'ready_to_publish'
     and publication.competition_id = v_batch.competition_id
     and value.player_id = publication.player_id
     and value.status = 'verified'
     and value.confidence = 'verified'
     and player.current_club_id = membership.club_id
     and membership.player_id = publication.player_id
     and membership.competition_id = publication.competition_id
     and membership.provider = 'sportmonks'
     and membership.status = 'active';
  if v_ready_count <> 533
     or (select count(*) from public.touchline_card_publication_batch_rows as batch_row where batch_row.batch_id = v_batch.id) <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_PUBLISH_CANONICAL_FENCE_FAILED';
  end if;

  with before_rows as (
    select publication.*, value.market_value_eur, value.currency, player.provider_player_id
      from public.touchline_card_publications as publication
      join public.football_player_market_values as value on value.id = publication.market_value_id
      join public.football_players as player on player.id = publication.player_id
     where publication.current_batch_id = v_batch.id
       and publication.publication_status = 'ready_to_publish'
     for update
  ), published_card_rows as (
    update public.touchline_card_publications as publication
       set publication_status = 'published',
           published_at = clock_timestamp(),
           unpublished_at = null,
           updated_by = p_actor_id,
           version = publication.version + 1
      from before_rows
     where publication.id = before_rows.id
    returning publication.*
  )
  insert into public.touchline_card_publication_history (
    publication_id, batch_id, player_id, provider_player_id, action,
    previous_market_value_eur, new_market_value_eur, currency,
    previous_tier, new_tier, nominal_price_tc, nominal_price_gbp,
    before_state, after_state, actor_id
  )
  select published_card_rows.id, v_batch.id, published_card_rows.player_id,
    before_rows.provider_player_id, 'published',
    before_rows.market_value_eur, before_rows.market_value_eur, before_rows.currency,
    before_rows.calculated_tier, published_card_rows.calculated_tier,
    published_card_rows.calculated_price_tc, published_card_rows.calculated_nominal_price_gbp,
    jsonb_build_object(
      'publication', to_jsonb(before_rows),
      'market_value', jsonb_build_object(
        'player_id', before_rows.player_id,
        'market_value_eur', before_rows.market_value_eur,
        'currency', before_rows.currency
      )
    ),
    jsonb_build_object(
      'publication', to_jsonb(published_card_rows),
      'market_value', jsonb_build_object(
        'player_id', before_rows.player_id,
        'market_value_eur', before_rows.market_value_eur,
        'currency', before_rows.currency
      )
    ),
    p_actor_id
  from published_card_rows
  join before_rows on before_rows.id = published_card_rows.id;

  update public.touchline_card_publication_batches
     set status = 'published',
         published_at = clock_timestamp()
   where id = v_batch.id;

  return query select v_batch.id, 'published'::text, 533, false;
end;
$$;

-- A batch rollback delegates to the already-reviewed per-player revert using
-- the original preparation-history links. If any canonical membership fence
-- has changed, the surrounding transaction aborts and no player is reverted
-- halfway through.
create or replace function public.touchline_revert_owner_approved_533_card_publications(
  p_manifest_fingerprint_sha256 text,
  p_actor_id uuid
)
returns table (
  batch_id uuid,
  batch_status text,
  reverted_rows integer,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.touchline_card_publication_batches%rowtype;
  v_row record;
  v_link_count integer;
begin
  if p_actor_id is null
     or coalesce(p_manifest_fingerprint_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'TL_OWNER_APPROVED_533_REVERT_COMMAND_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('touchline-owner-approved-533:' || p_manifest_fingerprint_sha256));
  select * into v_batch
    from public.touchline_card_publication_batches
   where manifest_fingerprint_sha256 = p_manifest_fingerprint_sha256
   for update;
  if not found or v_batch.rows_received <> 533 or v_batch.ready_rows <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_REVERT_BATCH_NOT_READY';
  end if;
  if v_batch.status = 'reverted' then
    return query select v_batch.id, v_batch.status, 533, true;
    return;
  end if;
  if v_batch.status not in ('review', 'published') then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_REVERT_BATCH_STATE_INVALID';
  end if;
  select count(*) into v_link_count
    from public.touchline_card_publication_batch_rows as batch_row
   where batch_row.batch_id = v_batch.id;
  if v_link_count <> 533 then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_APPROVED_533_REVERT_HISTORY_LINK_COUNT_INVALID';
  end if;

  for v_row in
    select preparation_history_id
      from public.touchline_card_publication_batch_rows as batch_row
     where batch_row.batch_id = v_batch.id
     order by batch_row.player_id
  loop
    perform * from public.touchline_revert_manual_card_publication(
      v_row.preparation_history_id,
      p_actor_id
    );
  end loop;

  update public.touchline_card_publication_batches
     set status = 'reverted',
         published_at = null
   where id = v_batch.id;
  return query select v_batch.id, 'reverted'::text, 533, false;
end;
$$;

revoke all on function public.touchline_apply_owner_approved_533_card_publications(jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_apply_owner_approved_533_card_publications(jsonb, text, uuid)
  to service_role;

revoke all on function public.touchline_publish_owner_approved_533_card_publications(text, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_publish_owner_approved_533_card_publications(text, uuid)
  to service_role;

revoke all on function public.touchline_revert_owner_approved_533_card_publications(text, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_revert_owner_approved_533_card_publications(text, uuid)
  to service_role;

commit;
