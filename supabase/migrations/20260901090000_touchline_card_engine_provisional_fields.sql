-- Card Engine provisional-field policy (QA candidate; unapplied remotely).
-- Extends the existing Card Engine tables/functions. It does not create a
-- second player, roster, valuation or publication pipeline.
begin;
set local lock_timeout = '5s';

alter table public.touchline_card_editorial_overrides
  add column if not exists provenance_status text,
  add column if not exists provisional_reason text,
  add column if not exists last_verification_at timestamptz,
  add column if not exists next_verification_at timestamptz,
  add column if not exists sources_consulted jsonb not null default '[]'::jsonb;

alter table public.touchline_card_editorial_overrides
  drop constraint if exists touchline_card_editorial_overrides_status_check;
alter table public.touchline_card_editorial_overrides
  add constraint touchline_card_editorial_overrides_status_check
  check (status in ('draft', 'review', 'approved', 'provisional', 'stale', 'reverted'));
alter table public.touchline_card_editorial_overrides
  add constraint touchline_card_editorial_overrides_provisional_check check (
    jsonb_typeof(sources_consulted) = 'array'
    and (next_verification_at is null or last_verification_at is null or next_verification_at > last_verification_at)
    and (
      status <> 'provisional'
      or (
        field_key in ('shirtNumber', 'marketValueEur')
        and provenance_status in ('PROVISIONAL_MISSING_SHIRT', 'PROVISIONAL_MISSING_MARKET_VALUE')
        and last_verification_at is not null
        and next_verification_at is not null
        and nullif(trim(provisional_reason), '') is not null
      )
    )
  );

create index if not exists touchline_card_editorial_provisional_queue_idx
  on public.touchline_card_editorial_overrides(status, next_verification_at, player_id)
  where status = 'provisional';

alter table public.football_player_market_values
  drop constraint if exists football_player_market_values_confidence_check;
alter table public.football_player_market_values
  add constraint football_player_market_values_confidence_check
  check (confidence in ('pending', 'provisional', 'reviewed', 'verified'));
alter table public.football_player_market_values
  drop constraint if exists football_player_market_values_status_check;
alter table public.football_player_market_values
  add constraint football_player_market_values_status_check
  check (status in ('pending', 'provisional', 'ready', 'verified', 'rejected', 'unavailable'));

alter table public.football_player_market_value_history
  drop constraint if exists football_player_market_value_history_confidence_check;
alter table public.football_player_market_value_history
  add constraint football_player_market_value_history_confidence_check
  check (confidence in ('provisional', 'reviewed', 'verified'));

alter table public.touchline_card_editorial_audit_events
  drop constraint if exists touchline_card_editorial_audit_events_event_type_check;
alter table public.touchline_card_editorial_audit_events
  add constraint touchline_card_editorial_audit_events_event_type_check
  check (event_type in (
    'batch_created', 'item_resolved', 'batch_approved', 'override_published',
    'market_value_published', 'batch_reverted', 'stale_detected',
    'provisional_defaulted', 'provisional_resolved'
  ));

create or replace function public.touchline_card_engine_ensure_provisional_defaults(
  p_player_id uuid,
  p_effective_season text,
  p_checked_at timestamptz,
  p_next_verification_at timestamptz,
  p_sources_consulted jsonb
) returns table(
  player_id uuid,
  shirt_number integer,
  market_value_eur bigint,
  shirt_provenance text,
  market_value_provenance text,
  publication_status text
) language plpgsql security definer set search_path = '' as $$
declare
  v_player public.football_players%rowtype;
  v_membership public.football_squad_members%rowtype;
  v_club public.football_clubs%rowtype;
  v_shirt public.touchline_card_editorial_overrides%rowtype;
  v_market_override public.touchline_card_editorial_overrides%rowtype;
  v_market public.football_player_market_values%rowtype;
  v_publication public.touchline_card_publications%rowtype;
  v_before jsonb;
  v_market_value bigint;
  v_tier text;
  v_price integer;
  v_shirt_number integer;
  v_approved_shirt_number integer;
  v_approved_market_value bigint;
  v_shirt_provenance text;
  v_market_provenance text;
  v_shirt_defaulted boolean := false;
  v_market_defaulted boolean := false;
  v_publication_changed boolean := false;
  v_publication_source text;
  v_publication_note text;
begin
  if p_player_id is null or coalesce(trim(p_effective_season), '') !~ '^\d{4}[-/]\d{2,4}$'
     or p_checked_at is null or p_next_verification_at is null
     or p_next_verification_at <= p_checked_at
     or jsonb_typeof(p_sources_consulted) <> 'array'
     or jsonb_array_length(p_sources_consulted) not between 1 and 8
     or exists (
       select 1 from jsonb_array_elements(p_sources_consulted) source
       where jsonb_typeof(source) <> 'object'
          or exists (select 1 from jsonb_object_keys(source) key
            where key not in ('kind', 'reference', 'observedAt'))
          or coalesce(source->>'kind', '') not in (
            'CANONICAL_ROSTER', 'OFFICIAL_LINEUP', 'OWNER_REVIEW', 'LICENSED_MARKET_VALUE'
          )
          or length(trim(coalesce(source->>'reference', ''))) not between 1 and 240
          or coalesce(source->>'observedAt', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
     ) then
    raise exception using errcode = '22023', message = 'TL_CARD_PROVISIONAL_COMMAND_INVALID';
  end if;
  select player.* into v_player from public.football_players player
   where player.id = p_player_id and player.provider = 'sportmonks' and player.provider_player_id ~ '^[0-9]{1,20}$'
   for update;
  if not found or v_player.current_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_PLAYER_NOT_CANONICAL';
  end if;
  select membership.* into v_membership from public.football_squad_members membership
   where membership.player_id = p_player_id and membership.club_id = v_player.current_club_id
     and membership.provider = 'sportmonks' and membership.status = 'active' for update;
  if not found or (select count(*) from public.football_squad_members membership
    where membership.player_id = p_player_id and membership.provider = 'sportmonks' and membership.status = 'active') <> 1 then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MEMBERSHIP_NOT_UNIQUE';
  end if;
  if not exists (select 1 from public.football_competitions
    where id = v_membership.competition_id and provider = 'sportmonks' and provider_competition_id = '8') then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_COMPETITION_INVALID';
  end if;
  select * into v_club from public.football_clubs where id = v_player.current_club_id;
  if nullif(trim(coalesce(v_player.display_name, v_player.name)), '') is null
     or nullif(trim(coalesce(v_membership.position, v_player.position)), '') is null
     or nullif(trim(coalesce(v_player.nationality, v_player.country_id)), '') is null
     or nullif(trim(coalesce(v_club.logo_url, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_OTHER_REQUIRED_FIELD_MISSING';
  end if;

  select override.* into v_shirt from public.touchline_card_editorial_overrides override
   where override.player_id = p_player_id and override.field_key = 'shirtNumber' for update;
  v_approved_shirt_number := case
    when v_shirt.status = 'approved'
      and jsonb_typeof(v_shirt.effective_value) = 'number'
      and (v_shirt.effective_value #>> '{}') ~ '^[1-9][0-9]{0,2}$'
      then (v_shirt.effective_value #>> '{}')::integer
    when v_shirt.status = 'approved'
      and jsonb_typeof(v_shirt.effective_value) = 'object'
      and coalesce(v_shirt.effective_value ->> 'value', '') ~ '^[1-9][0-9]{0,2}$'
      then (v_shirt.effective_value ->> 'value')::integer
    else null
  end;
  if v_approved_shirt_number is not null then
    v_shirt_number := v_approved_shirt_number;
  elsif coalesce(v_membership.jersey_number, 0) > 0 then
    v_shirt_number := v_membership.jersey_number;
  else
    v_shirt_number := 0;
    v_shirt_provenance := 'PROVISIONAL_MISSING_SHIRT';
    v_shirt_defaulted := v_shirt.id is null
      or v_shirt.status <> 'provisional'
      or v_shirt.provenance_status <> v_shirt_provenance;
    insert into public.touchline_card_editorial_overrides(
      player_id, field_key, provider_value, touchline_override, effective_value,
      status, provenance_status, provisional_reason, last_verification_at,
      next_verification_at, sources_consulted, version
    ) values (
      p_player_id, 'shirtNumber', to_jsonb(v_membership.jersey_number), '0'::jsonb, '0'::jsonb,
      'provisional', v_shirt_provenance, 'canonical_membership_has_no_positive_shirt',
      p_checked_at, p_next_verification_at, p_sources_consulted, 1
    ) on conflict on constraint touchline_card_editorial_overrides_player_id_field_key_key do update set
      provider_value = excluded.provider_value,
      touchline_override = excluded.touchline_override,
      effective_value = excluded.effective_value,
      status = 'provisional', provenance_status = excluded.provenance_status,
      provisional_reason = excluded.provisional_reason,
      last_verification_at = excluded.last_verification_at,
      next_verification_at = excluded.next_verification_at,
      sources_consulted = excluded.sources_consulted,
      version = public.touchline_card_editorial_overrides.version + 1
    where public.touchline_card_editorial_overrides.status <> 'approved';
    if not found then
      raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_APPROVED_SHIRT_PRESERVED';
    end if;
  end if;

  select override.* into v_market_override from public.touchline_card_editorial_overrides override
   where override.player_id = p_player_id and override.field_key = 'marketValueEur' for update;
  v_approved_market_value := case
    when v_market_override.status = 'approved'
      and jsonb_typeof(v_market_override.effective_value) = 'number'
      and (v_market_override.effective_value #>> '{}') ~ '^[0-9]{1,18}$'
      then (v_market_override.effective_value #>> '{}')::bigint
    when v_market_override.status = 'approved'
      and jsonb_typeof(v_market_override.effective_value) = 'object'
      and coalesce(v_market_override.effective_value ->> 'value', '') ~ '^[0-9]{1,18}$'
      then (v_market_override.effective_value ->> 'value')::bigint
    else null
  end;
  select value.* into v_market from public.football_player_market_values value where value.player_id = p_player_id for update;
  if v_market_override.id is not null and v_market_override.status = 'approved'
     and (v_approved_market_value is null or v_market.id is null
       or v_market.status <> 'verified' or v_market.confidence <> 'verified'
       or v_market.market_value_eur is distinct from v_approved_market_value) then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_APPROVED_MARKET_VALUE_MISMATCH';
  elsif v_market.id is not null and v_market.status = 'verified' and v_market.confidence = 'verified'
     and v_market.market_value_eur is not null and v_market.market_value_eur >= 0 then
    v_market_value := v_market.market_value_eur;
  elsif v_market.id is not null
     and v_market.status = 'provisional' and v_market.confidence = 'provisional'
     and v_market.source = 'touchline_card_engine_provisional'
     and v_market.market_value_eur = 1000000
     and v_market_override.status = 'provisional'
     and v_market_override.provenance_status = 'PROVISIONAL_MISSING_MARKET_VALUE' then
    v_market_value := 1000000;
    v_market_provenance := 'PROVISIONAL_MISSING_MARKET_VALUE';
    update public.touchline_card_editorial_overrides set
      last_verification_at = p_checked_at,
      next_verification_at = p_next_verification_at,
      sources_consulted = p_sources_consulted,
      version = version + 1
    where id = v_market_override.id and status = 'provisional';
  elsif v_market.id is null or (
    v_market.status in ('pending', 'rejected', 'unavailable')
    and v_market.confidence = 'pending'
    and (v_market_override.id is null or v_market_override.status in ('stale', 'reverted'))
  ) then
    v_market_value := 1000000;
    v_market_provenance := 'PROVISIONAL_MISSING_MARKET_VALUE';
    v_market_defaulted := true;
    insert into public.football_player_market_values(
      player_id, market_value, currency, market_value_eur, last_verified,
      verified_season, source, confidence, status
    ) values (
      p_player_id, v_market_value, 'EUR', v_market_value, null,
      trim(p_effective_season), 'touchline_card_engine_provisional', 'provisional', 'provisional'
    ) on conflict on constraint football_player_market_values_player_id_key do update set
      market_value = excluded.market_value, currency = excluded.currency,
      market_value_eur = excluded.market_value_eur, last_verified = null,
      verified_season = excluded.verified_season, source = excluded.source,
      confidence = excluded.confidence, status = excluded.status
    where public.football_player_market_values.status in ('pending', 'rejected', 'unavailable')
      and public.football_player_market_values.confidence = 'pending';
    if not found then
      raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MARKET_VALUE_CHANGED_DURING_WRITE';
    end if;
    select value.* into v_market from public.football_player_market_values value where value.player_id = p_player_id;
    insert into public.football_player_market_value_history(
      player_id, market_value, currency, market_value_eur, verified_season,
      verified_date, source, confidence
    ) values (
      p_player_id, v_market_value, 'EUR', v_market_value, trim(p_effective_season),
      p_checked_at, 'touchline_card_engine_provisional', 'provisional'
    );
    insert into public.touchline_card_editorial_overrides(
      player_id, field_key, provider_value, touchline_override, effective_value,
      status, provenance_status, provisional_reason, last_verification_at,
      next_verification_at, sources_consulted, version
    ) values (
      p_player_id, 'marketValueEur', null, to_jsonb(v_market_value), to_jsonb(v_market_value),
      'provisional', v_market_provenance, 'no_trusted_market_value_published',
      p_checked_at, p_next_verification_at, p_sources_consulted, 1
    ) on conflict on constraint touchline_card_editorial_overrides_player_id_field_key_key do update set
      touchline_override = excluded.touchline_override,
      effective_value = excluded.effective_value,
      status = 'provisional', provenance_status = excluded.provenance_status,
      provisional_reason = excluded.provisional_reason,
      last_verification_at = excluded.last_verification_at,
      next_verification_at = excluded.next_verification_at,
      sources_consulted = excluded.sources_consulted,
      version = public.touchline_card_editorial_overrides.version + 1
    where public.touchline_card_editorial_overrides.status in ('stale', 'reverted');
    if not found then
      raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MARKET_OVERRIDE_CHANGED_DURING_WRITE';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MARKET_VALUE_REVIEW_IN_PROGRESS';
  end if;

  v_tier := case when v_market_value < 6000000 then 'ruby-red' when v_market_value < 10000000 then 'sapphire-blue'
    when v_market_value < 20000000 then 'amethyst-purple' when v_market_value < 35000000 then 'radiant-gold'
    when v_market_value < 50000000 then 'emerald-green' when v_market_value < 70000000 then 'clear-diamond' else 'diamond-gold' end;
  v_price := case v_tier when 'ruby-red' then 0 when 'sapphire-blue' then 1 when 'amethyst-purple' then 2
    when 'radiant-gold' then 4 when 'emerald-green' then 7 when 'clear-diamond' then 10 else 15 end;
  v_publication_source := case
    when v_shirt_provenance is not null or v_market_provenance is not null
      then 'touchline_card_engine_provisional_defaults'
    else 'touchline_card_engine_verified_inputs'
  end;
  v_publication_note := case
    when v_publication_source = 'touchline_card_engine_provisional_defaults'
      then 'Card Engine provisional defaults; monitored until canonical values resolve.'
    else 'Card Engine canonical inputs verified; no provisional fallback remains.'
  end;
  select publication.* into v_publication from public.touchline_card_publications publication where publication.player_id = p_player_id for update;
  v_before := case when v_publication.id is null then null else to_jsonb(v_publication) end;
  insert into public.touchline_card_publications(
    player_id, current_membership_id, competition_id, effective_season, market_value_id,
    publication_status, calculated_tier, calculated_price_tc, calculated_nominal_price_gbp,
    policy_version, last_reviewed_at, published_at, internal_note, internal_source, version
  ) values (
    p_player_id, v_membership.id, v_membership.competition_id, trim(p_effective_season), v_market.id,
    'published', v_tier, v_price, v_price, '2026-07-premier-v1', p_checked_at, clock_timestamp(),
    v_publication_note, v_publication_source, 1
  ) on conflict on constraint touchline_card_publications_player_id_key do update set
    current_membership_id = excluded.current_membership_id,
    competition_id = excluded.competition_id,
    effective_season = excluded.effective_season,
    market_value_id = excluded.market_value_id,
    publication_status = excluded.publication_status,
    calculated_tier = excluded.calculated_tier,
    calculated_price_tc = excluded.calculated_price_tc,
    calculated_nominal_price_gbp = excluded.calculated_nominal_price_gbp,
    policy_version = excluded.policy_version,
    last_reviewed_at = excluded.last_reviewed_at,
    published_at = excluded.published_at,
    internal_note = excluded.internal_note,
    internal_source = excluded.internal_source,
    version = public.touchline_card_publications.version + 1
  where public.touchline_card_publications.current_membership_id is distinct from excluded.current_membership_id
     or public.touchline_card_publications.competition_id is distinct from excluded.competition_id
     or public.touchline_card_publications.effective_season is distinct from excluded.effective_season
     or public.touchline_card_publications.market_value_id is distinct from excluded.market_value_id
     or public.touchline_card_publications.publication_status is distinct from excluded.publication_status
     or public.touchline_card_publications.calculated_tier is distinct from excluded.calculated_tier
     or public.touchline_card_publications.calculated_price_tc is distinct from excluded.calculated_price_tc
     or public.touchline_card_publications.calculated_nominal_price_gbp is distinct from excluded.calculated_nominal_price_gbp
     or public.touchline_card_publications.policy_version is distinct from excluded.policy_version
     or public.touchline_card_publications.internal_note is distinct from excluded.internal_note
     or public.touchline_card_publications.internal_source is distinct from excluded.internal_source
  returning * into v_publication;
  v_publication_changed := found;
  if not v_publication_changed then
    select publication.* into v_publication from public.touchline_card_publications publication where publication.player_id = p_player_id;
  else
    insert into public.touchline_card_publication_history(
      publication_id, player_id, provider_player_id, action, previous_market_value_eur,
      new_market_value_eur, currency, previous_tier, new_tier, nominal_price_tc,
      nominal_price_gbp, before_state, after_state
    ) values (
      v_publication.id, p_player_id, v_player.provider_player_id,
      case when v_before is null then 'published' else 'reviewed' end,
      null, v_market_value, 'EUR', v_before ->> 'calculated_tier', v_tier, v_price, v_price,
      jsonb_build_object('publication', v_before),
      jsonb_build_object('publication', to_jsonb(v_publication), 'shirtProvenance', v_shirt_provenance,
        'marketValueProvenance', v_market_provenance)
    );
  end if;
  if v_shirt_defaulted or v_market_defaulted then
    insert into public.touchline_card_editorial_audit_events(player_id,event_type,effective_after)
    values(p_player_id,'provisional_defaulted',jsonb_build_object(
      'shirtNumber',v_shirt_number,'shirtProvenance',v_shirt_provenance,
      'marketValueEur',v_market_value,'marketValueProvenance',v_market_provenance,
      'checkedAt',p_checked_at,'nextVerificationAt',p_next_verification_at));
  end if;
  return query select p_player_id, v_shirt_number, v_market_value,
    v_shirt_provenance, v_market_provenance, v_publication.publication_status;
end;
$$;

create or replace function public.touchline_card_engine_resolve_provisional_market_value(
  p_player_id uuid,
  p_effective_season text,
  p_market_value_eur bigint,
  p_verified_at timestamptz,
  p_source_reference text
) returns table(
  player_id uuid,
  market_value_eur bigint,
  publication_status text,
  resolved boolean
) language plpgsql security definer set search_path = '' as $$
declare
  v_player public.football_players%rowtype;
  v_membership public.football_squad_members%rowtype;
  v_market public.football_player_market_values%rowtype;
  v_override public.touchline_card_editorial_overrides%rowtype;
  v_publication public.touchline_card_publications%rowtype;
  v_before_market jsonb;
  v_before_publication jsonb;
  v_tier text;
  v_price integer;
begin
  if p_player_id is null or coalesce(trim(p_effective_season), '') !~ '^\d{4}[-/]\d{2,4}$'
     or p_market_value_eur is null or p_market_value_eur < 0
     or p_verified_at is null
     or length(trim(coalesce(p_source_reference, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'TL_CARD_PROVISIONAL_MARKET_RESOLUTION_INVALID';
  end if;

  select player.* into v_player from public.football_players player
   where player.id = p_player_id and player.provider = 'sportmonks'
     and player.provider_player_id ~ '^[0-9]{1,20}$' for update;
  if not found or v_player.current_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_PLAYER_NOT_CANONICAL';
  end if;
  select membership.* into v_membership from public.football_squad_members membership
   where membership.player_id = p_player_id and membership.club_id = v_player.current_club_id
     and membership.provider = 'sportmonks' and membership.status = 'active' for update;
  if not found or (select count(*) from public.football_squad_members membership
    where membership.player_id = p_player_id and membership.provider = 'sportmonks' and membership.status = 'active') <> 1 then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MEMBERSHIP_NOT_UNIQUE';
  end if;
  if not exists (select 1 from public.football_competitions
    where id = v_membership.competition_id and provider = 'sportmonks'
      and provider_competition_id = '8') then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_COMPETITION_INVALID';
  end if;

  select value.* into v_market from public.football_player_market_values value
   where value.player_id = p_player_id for update;
  select override.* into v_override from public.touchline_card_editorial_overrides override
   where override.player_id = p_player_id and override.field_key = 'marketValueEur' for update;
  select publication.* into v_publication from public.touchline_card_publications publication
   where publication.player_id = p_player_id for update;

  if v_market.id is null or v_override.id is null or v_publication.id is null
     or v_market.status <> 'provisional' or v_market.confidence <> 'provisional'
     or v_market.source <> 'touchline_card_engine_provisional'
     or v_market.market_value_eur <> 1000000
     or v_market.verified_season is distinct from trim(p_effective_season)
     or v_override.status <> 'provisional'
     or v_override.provenance_status <> 'PROVISIONAL_MISSING_MARKET_VALUE'
     or not (
       (jsonb_typeof(v_override.effective_value) = 'number' and v_override.effective_value #>> '{}' = '1000000')
       or (jsonb_typeof(v_override.effective_value) = 'object' and v_override.effective_value ->> 'value' = '1000000')
     )
     or v_publication.market_value_id is distinct from v_market.id
     or v_publication.current_membership_id is distinct from v_membership.id
     or v_publication.internal_source <> 'touchline_card_engine_provisional_defaults' then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MARKET_FENCE_FAILED';
  end if;

  v_before_market := to_jsonb(v_market);
  v_before_publication := to_jsonb(v_publication);
  v_tier := case when p_market_value_eur < 6000000 then 'ruby-red' when p_market_value_eur < 10000000 then 'sapphire-blue'
    when p_market_value_eur < 20000000 then 'amethyst-purple' when p_market_value_eur < 35000000 then 'radiant-gold'
    when p_market_value_eur < 50000000 then 'emerald-green' when p_market_value_eur < 70000000 then 'clear-diamond' else 'diamond-gold' end;
  v_price := case v_tier when 'ruby-red' then 0 when 'sapphire-blue' then 1 when 'amethyst-purple' then 2
    when 'radiant-gold' then 4 when 'emerald-green' then 7 when 'clear-diamond' then 10 else 15 end;

  update public.football_player_market_values set
    market_value = p_market_value_eur,
    currency = 'EUR',
    market_value_eur = p_market_value_eur,
    last_verified = p_verified_at,
    verified_season = trim(p_effective_season),
    source = 'touchline_licensed_import',
    confidence = 'verified',
    status = 'verified'
  where id = v_market.id and status = 'provisional' and confidence = 'provisional';
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MARKET_WRITE_FENCE_FAILED';
  end if;

  insert into public.football_player_market_value_history(
    player_id, market_value, currency, market_value_eur, verified_season,
    verified_date, source, confidence
  ) values (
    p_player_id, p_market_value_eur, 'EUR', p_market_value_eur, trim(p_effective_season),
    p_verified_at, 'touchline_licensed_import', 'verified'
  );
  update public.touchline_card_editorial_overrides set
    provider_value = to_jsonb(p_market_value_eur),
    effective_value = to_jsonb(p_market_value_eur),
    status = 'reverted',
    provenance_status = 'LICENSED_MARKET_VALUE_RESOLVED',
    provisional_reason = null,
    last_verification_at = p_verified_at,
    next_verification_at = null,
    sources_consulted = jsonb_build_array(jsonb_build_object(
      'kind', 'LICENSED_MARKET_VALUE', 'reference', trim(p_source_reference), 'observedAt', p_verified_at
    )),
    version = version + 1
  where id = v_override.id and status = 'provisional';
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_MARKET_OVERRIDE_FENCE_FAILED';
  end if;

  update public.touchline_card_publications set
    calculated_tier = v_tier,
    calculated_price_tc = v_price,
    calculated_nominal_price_gbp = v_price,
    last_reviewed_at = p_verified_at,
    internal_note = case when exists (
      select 1 from public.touchline_card_editorial_overrides shirt
       where shirt.player_id = p_player_id and shirt.field_key = 'shirtNumber'
         and shirt.status = 'provisional' and shirt.provenance_status = 'PROVISIONAL_MISSING_SHIRT'
    ) then 'Verified Market Value; monitored provisional shirt number remains.'
      else 'Card Engine verified inputs; no provisional fallback remains.' end,
    internal_source = case when exists (
      select 1 from public.touchline_card_editorial_overrides shirt
       where shirt.player_id = p_player_id and shirt.field_key = 'shirtNumber'
         and shirt.status = 'provisional' and shirt.provenance_status = 'PROVISIONAL_MISSING_SHIRT'
    ) then 'touchline_card_engine_provisional_defaults'
      else 'touchline_card_engine_verified_inputs' end,
    version = version + 1
  where id = v_publication.id
    and internal_source = 'touchline_card_engine_provisional_defaults';
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PROVISIONAL_PUBLICATION_FENCE_FAILED';
  end if;
  select * into v_publication from public.touchline_card_publications where id = v_publication.id;

  insert into public.touchline_card_publication_history(
    publication_id, player_id, provider_player_id, action,
    previous_market_value_eur, new_market_value_eur, currency,
    previous_tier, new_tier, nominal_price_tc, nominal_price_gbp,
    before_state, after_state
  ) values (
    v_publication.id, p_player_id, v_player.provider_player_id, 'reviewed',
    1000000, p_market_value_eur, 'EUR', v_before_publication ->> 'calculated_tier',
    v_tier, v_price, v_price,
    jsonb_build_object('marketValue', v_before_market, 'publication', v_before_publication),
    jsonb_build_object('marketValueEur', p_market_value_eur, 'publication', to_jsonb(v_publication),
      'sourceReference', trim(p_source_reference))
  );
  insert into public.touchline_card_editorial_audit_events(
    player_id, event_type, effective_before, effective_after
  ) values (
    p_player_id, 'provisional_resolved',
    jsonb_build_object('marketValueEur', 1000000, 'provenance', 'PROVISIONAL_MISSING_MARKET_VALUE'),
    jsonb_build_object('marketValueEur', p_market_value_eur, 'provenance', 'LICENSED_MARKET_VALUE_RESOLVED',
      'verifiedAt', p_verified_at, 'sourceReference', trim(p_source_reference))
  );
  return query select p_player_id, p_market_value_eur, v_publication.publication_status, true;
end;
$$;

create or replace function public.touchline_card_engine_reconcile_official_lineup_shirts(
  p_provider_fixture_id text,
  p_persisted_at timestamptz,
  p_facts jsonb
) returns table(updated_players integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_feed public.football_fantasy_fixture_feeds%rowtype;
  v_fact jsonb;
  v_player public.football_players%rowtype;
  v_club public.football_clubs%rowtype;
  v_membership public.football_squad_members%rowtype;
  v_override public.touchline_card_editorial_overrides%rowtype;
  v_updated integer := 0;
begin
  if coalesce(p_provider_fixture_id,'') !~ '^[0-9]{1,20}$' or p_persisted_at is null
     or jsonb_typeof(p_facts) <> 'array' or jsonb_array_length(p_facts) <> 40 then
    raise exception using errcode = '22023', message = 'TL_CARD_LINEUP_SHIRT_FACTS_INVALID';
  end if;
  select * into v_feed from public.football_fantasy_fixture_feeds
   where provider='sportmonks' and provider_fixture_id=p_provider_fixture_id
     and last_synced_at=p_persisted_at for update;
  if not found then raise exception using errcode='P0001', message='TL_CARD_LINEUP_SNAPSHOT_FENCE_FAILED'; end if;
  if jsonb_typeof(v_feed.lineups_payload) <> 'array'
     or jsonb_array_length(v_feed.lineups_payload) <> 40
     or (select count(distinct fact->>'teamId') from jsonb_array_elements(p_facts) fact) <> 2
     or exists (select 1 from jsonb_array_elements(p_facts) fact
       where coalesce(fact->>'playerId','') !~ '^[0-9]{1,20}$'
          or coalesce(fact->>'teamId','') !~ '^[0-9]{1,20}$'
          or coalesce(fact->>'jerseyNumber','') !~ '^[1-9][0-9]{0,2}$'
          or coalesce(fact->>'role','') not in ('STARTER','SUBSTITUTE')
          or (fact->>'role'='STARTER' and coalesce(fact->>'formationPosition','') !~ '^([1-9]|1[01])$')
          or (fact->>'role'='SUBSTITUTE' and fact->>'formationPosition' is not null))
     or exists (select 1 from jsonb_array_elements(p_facts) fact
       group by fact->>'playerId' having count(*) <> 1)
     or exists (select 1 from (select fact->>'teamId' team_id,
          count(*) filter(where fact->>'role'='STARTER') starters,
          count(*) filter(where fact->>'role'='SUBSTITUTE') substitutes,
          count(distinct fact->>'formationPosition') filter(where fact->>'role'='STARTER') formation_positions
        from jsonb_array_elements(p_facts) fact group by fact->>'teamId') team
       where team.starters <> 11 or team.substitutes <> 9 or team.formation_positions <> 11)
     or exists (select 1 from jsonb_array_elements(p_facts) fact where not exists (
       select 1 from jsonb_array_elements(v_feed.lineups_payload) lineup
       where lineup->>'playerId'=fact->>'playerId' and lineup->>'teamId'=fact->>'teamId'
         and lineup->>'jerseyNumber'=fact->>'jerseyNumber'
         and ((fact->>'role'='STARTER' and lineup->>'isStarter'='true' and coalesce(lineup->>'isSubstitute','false')<>'true')
           or (fact->>'role'='SUBSTITUTE' and lineup->>'isSubstitute'='true' and coalesce(lineup->>'isStarter','false')<>'true'))
         and (fact->>'role'='SUBSTITUTE' or lineup->>'formationPosition'=fact->>'formationPosition')
     )) then
    raise exception using errcode='P0001', message='TL_CARD_LINEUP_CONTENT_FENCE_FAILED';
  end if;

  for v_fact in select value from jsonb_array_elements(p_facts) loop
    select * into v_player from public.football_players
     where provider='sportmonks' and provider_player_id=v_fact->>'playerId' for update;
    select * into v_club from public.football_clubs
     where provider='sportmonks' and provider_team_id=v_fact->>'teamId';
    if v_player.id is null or v_club.id is null or v_player.current_club_id is distinct from v_club.id then continue; end if;
    select * into v_membership from public.football_squad_members
     where player_id=v_player.id and club_id=v_club.id and provider='sportmonks' and status='active' for update;
    if v_membership.id is null or (select count(*) from public.football_squad_members
      where player_id=v_player.id and provider='sportmonks' and status='active') <> 1 then continue; end if;
    select * into v_override from public.touchline_card_editorial_overrides
     where player_id=v_player.id and field_key='shirtNumber' for update;
    if v_override.id is null or v_override.status <> 'provisional'
       or v_override.provenance_status <> 'PROVISIONAL_MISSING_SHIRT'
       or not (
         (jsonb_typeof(v_override.effective_value)='number' and v_override.effective_value #>> '{}'='0')
         or (jsonb_typeof(v_override.effective_value)='object' and v_override.effective_value->>'value'='0')
       ) then continue; end if;
    update public.football_squad_members set jersey_number=(v_fact->>'jerseyNumber')::integer,
      source_updated_at=greatest(source_updated_at,p_persisted_at)
      where id=v_membership.id and coalesce(jersey_number,0)=0;
    if not found then continue; end if;
    update public.touchline_card_editorial_overrides set status='reverted',
      provider_value=to_jsonb((v_fact->>'jerseyNumber')::integer),
      effective_value=to_jsonb((v_fact->>'jerseyNumber')::integer),
      provenance_status='CANONICAL_LINEUP_RESOLVED', provisional_reason=null,
      last_verification_at=p_persisted_at, next_verification_at=null,
      sources_consulted=jsonb_build_array(jsonb_build_object('kind','OFFICIAL_LINEUP','fixtureId',p_provider_fixture_id)),
      version=version+1 where id=v_override.id and status='provisional';
    insert into public.touchline_card_editorial_audit_events(player_id,event_type,effective_before,effective_after)
    values(v_player.id,'provisional_resolved',jsonb_build_object('shirtNumber',0,'provenance','PROVISIONAL_MISSING_SHIRT'),
      jsonb_build_object('shirtNumber',(v_fact->>'jerseyNumber')::integer,'fixtureId',p_provider_fixture_id,'observedAt',p_persisted_at));
    if exists (select 1 from public.football_player_market_values value
      where value.player_id = v_player.id and value.status = 'verified' and value.confidence = 'verified')
      and not exists (select 1 from public.touchline_card_editorial_overrides pending
        where pending.player_id = v_player.id and pending.status = 'provisional') then
      update public.touchline_card_publications set
        internal_note = 'Card Engine canonical inputs verified; no provisional fallback remains.',
        internal_source = 'touchline_card_engine_verified_inputs',
        last_reviewed_at = p_persisted_at,
        version = version + 1
      where player_id = v_player.id and internal_source = 'touchline_card_engine_provisional_defaults';
    end if;
    v_updated := v_updated + 1;
  end loop;
  return query select v_updated;
end;
$$;

revoke all on function public.touchline_card_engine_ensure_provisional_defaults(uuid,text,timestamptz,timestamptz,jsonb)
  from public, anon, authenticated;
revoke all on function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb)
  from public, anon, authenticated;
revoke all on function public.touchline_card_engine_resolve_provisional_market_value(uuid,text,bigint,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.touchline_card_engine_ensure_provisional_defaults(uuid,text,timestamptz,timestamptz,jsonb)
  to service_role;
grant execute on function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb)
  to service_role;
grant execute on function public.touchline_card_engine_resolve_provisional_market_value(uuid,text,bigint,timestamptz,text)
  to service_role;

comment on index public.touchline_card_editorial_provisional_queue_idx is
  'Card Engine monitored queue for provisional shirt/value fields ordered by next verification.';
comment on function public.touchline_card_engine_ensure_provisional_defaults(uuid,text,timestamptz,timestamptz,jsonb) is
  'Creates only explicit monitored Card Engine fallbacks (shirt 0, EUR 1m) without claiming either is official.';
comment on function public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb) is
  'Resolves only shirt 0/provisional after an exact persisted complete official lineup; approved manual overrides are untouched.';
comment on function public.touchline_card_engine_resolve_provisional_market_value(uuid,text,bigint,timestamptz,text) is
  'Replaces only the exact monitored EUR 1m fallback with a licensed verified value; approved manual values fail closed.';
commit;
