-- The Card Engine owns presentation completeness.  Publication is deliberately
-- derived: when the real provider/player inputs and an approved market value
-- are complete, this command creates or refreshes the protected publication
-- in the *same transaction* as its editorial overrides and audit entry.
begin;
set local lock_timeout = '5s';

create or replace function public.touchline_apply_card_editorial_review(
  p_player_id uuid,
  p_field_overrides jsonb,
  p_provider_country_code3 text,
  p_has_club_asset boolean,
  p_actor_id uuid
)
returns table (
  card_state text,
  missing_fields text[],
  publication_id uuid,
  publication_status text,
  calculated_tier text,
  nominal_price_gbp integer,
  overrides_changed boolean,
  publication_synced boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.football_players%rowtype;
  v_membership public.football_squad_members%rowtype;
  v_market_value public.football_player_market_values%rowtype;
  v_publication public.touchline_card_publications%rowtype;
  v_provider_display_name text;
  v_provider_position text;
  v_provider_shirt_number integer;
  v_provider_country_code3 text;
  v_prior jsonb := '{}'::jsonb;
  v_next jsonb := '{}'::jsonb;
  v_effective_before jsonb;
  v_effective_after jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_missing text[] := '{}'::text[];
  v_before_state text;
  v_after_state text;
  v_tier text;
  v_price integer;
  v_command record;
  v_should_sync boolean := false;
  v_overrides_changed boolean := false;
  v_publication_synced boolean := false;
  v_field text;
  v_requested jsonb;
begin
  if p_player_id is null or p_actor_id is null
     or jsonb_typeof(p_field_overrides) <> 'object' then
    raise exception using errcode = '22023', message = 'TL_CARD_REVIEW_COMMAND_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_field_overrides) as key
    where key not in ('displayName', 'shirtNumber', 'countryCode3', 'position')
  ) then
    raise exception using errcode = '22023', message = 'TL_CARD_REVIEW_FIELD_NOT_ALLOWED';
  end if;

  select * into v_player from public.football_players
   where id = p_player_id for update;
  if not found or v_player.current_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_CARD_REVIEW_PLAYER_NOT_CANONICAL';
  end if;
  select * into v_membership from public.football_squad_members
   where player_id = p_player_id and club_id = v_player.current_club_id
     and provider = 'sportmonks' and status = 'active'
   for update;
  if not found or (select count(*) from public.football_squad_members
    where player_id = p_player_id and provider = 'sportmonks' and status = 'active') <> 1 then
    raise exception using errcode = 'P0001', message = 'TL_CARD_REVIEW_MEMBERSHIP_NOT_UNIQUE';
  end if;
  if not exists (select 1 from public.football_competitions
    where id = v_membership.competition_id and provider = 'sportmonks'
      and provider_competition_id = '8') then
    raise exception using errcode = 'P0001', message = 'TL_CARD_REVIEW_COMPETITION_NOT_PREMIER_LEAGUE';
  end if;

  select * into v_market_value from public.football_player_market_values
   where player_id = p_player_id for update;
  select * into v_publication from public.touchline_card_publications
   where player_id = p_player_id for update;

  v_provider_display_name := nullif(trim(coalesce(v_player.display_name, v_player.name)), '');
  v_provider_position := nullif(trim(coalesce(v_membership.position, v_player.position)), '');
  v_provider_shirt_number := v_membership.jersey_number;
  v_provider_country_code3 := nullif(upper(trim(coalesce(p_provider_country_code3, ''))), '');
  if v_provider_country_code3 !~ '^[A-Z]{3}$' then v_provider_country_code3 := null; end if;

  select coalesce(jsonb_object_agg(field_key, touchline_override), '{}'::jsonb)
    into v_prior
    from public.touchline_card_editorial_overrides
   where player_id = p_player_id and status = 'approved'
     and field_key in ('displayName', 'shirtNumber', 'countryCode3', 'position');
  v_next := v_prior;
  foreach v_field in array array['displayName', 'shirtNumber', 'countryCode3', 'position'] loop
    if p_field_overrides ? v_field then
      v_requested := p_field_overrides -> v_field;
      if v_field in ('displayName', 'position') then
        if jsonb_typeof(v_requested) not in ('string', 'null') then
          raise exception using errcode = '22023', message = 'TL_CARD_REVIEW_FIELD_INVALID';
        end if;
      elsif v_field = 'countryCode3' then
        if jsonb_typeof(v_requested) not in ('string', 'null')
          or (jsonb_typeof(v_requested) = 'string' and upper(trim(v_requested #>> '{}')) !~ '^[A-Z]{3}$') then
          raise exception using errcode = '22023', message = 'TL_CARD_REVIEW_COUNTRY_INVALID';
        end if;
      elsif v_field = 'shirtNumber' then
        if jsonb_typeof(v_requested) not in ('number', 'string', 'null')
          or (jsonb_typeof(v_requested) <> 'null' and (v_requested #>> '{}') !~ '^[0-9]+$')
          or (jsonb_typeof(v_requested) <> 'null' and ((v_requested #>> '{}')::integer < 1 or (v_requested #>> '{}')::integer > 999)) then
          raise exception using errcode = '22023', message = 'TL_CARD_REVIEW_SHIRT_INVALID';
        end if;
      end if;
      v_next := jsonb_set(v_next, array[v_field], jsonb_build_object('value', case when jsonb_typeof(v_requested) = 'null' then null else v_requested #>> '{}' end), true);
    end if;
  end loop;

  v_effective_before := jsonb_build_object(
    'displayName', coalesce(nullif(trim(v_prior #>> '{displayName,value}'), ''), v_provider_display_name),
    'shirtNumber', coalesce(nullif(v_prior #>> '{shirtNumber,value}', '')::integer, v_provider_shirt_number),
    'countryCode3', coalesce(nullif(upper(trim(v_prior #>> '{countryCode3,value}')), ''), v_provider_country_code3),
    'position', coalesce(nullif(trim(v_prior #>> '{position,value}'), ''), v_provider_position)
  );
  v_effective_after := jsonb_build_object(
    'displayName', coalesce(nullif(trim(v_next #>> '{displayName,value}'), ''), v_provider_display_name),
    'shirtNumber', coalesce(nullif(v_next #>> '{shirtNumber,value}', '')::integer, v_provider_shirt_number),
    'countryCode3', coalesce(nullif(upper(trim(v_next #>> '{countryCode3,value}')), ''), v_provider_country_code3),
    'position', coalesce(nullif(trim(v_next #>> '{position,value}'), ''), v_provider_position)
  );

  foreach v_field in array array['displayName', 'shirtNumber', 'countryCode3', 'position'] loop
    if (v_prior -> v_field) is distinct from (v_next -> v_field) then
      v_changed_fields := array_append(v_changed_fields, v_field);
      insert into public.touchline_card_editorial_overrides(
        player_id, field_key, provider_value, touchline_override, effective_value,
        status, approved_by, approved_at, version
      ) values (
        p_player_id, v_field,
        jsonb_build_object('value', case v_field
          when 'displayName' then v_provider_display_name
          when 'shirtNumber' then v_provider_shirt_number::text
          when 'countryCode3' then v_provider_country_code3
          else v_provider_position end),
        v_next -> v_field, jsonb_build_object('value', v_effective_after ->> v_field),
        'approved', p_actor_id, clock_timestamp(), 1
      ) on conflict (player_id, field_key) do update set
        provider_value = excluded.provider_value,
        touchline_override = excluded.touchline_override,
        effective_value = excluded.effective_value,
        status = 'approved', approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        version = public.touchline_card_editorial_overrides.version + 1;
    end if;
  end loop;
  v_overrides_changed := cardinality(v_changed_fields) > 0;

  if nullif(trim(v_effective_after ->> 'displayName'), '') is null then v_missing := array_append(v_missing, 'display_name'); end if;
  if coalesce((v_effective_after ->> 'shirtNumber')::integer, 0) < 1 then v_missing := array_append(v_missing, 'shirt_number'); end if;
  if coalesce(v_effective_after ->> 'countryCode3', '') !~ '^[A-Z]{3}$' then v_missing := array_append(v_missing, 'nationality'); end if;
  if nullif(trim(v_effective_after ->> 'position'), '') is null then v_missing := array_append(v_missing, 'position'); end if;
  if v_market_value.id is null or v_market_value.status <> 'verified' or v_market_value.confidence <> 'verified'
      or v_market_value.market_value_eur is null or v_market_value.market_value_eur < 0
      or nullif(trim(v_market_value.verified_season), '') is null then v_missing := array_append(v_missing, 'market_value'); end if;
  if coalesce(p_has_club_asset, false) is not true then v_missing := array_append(v_missing, 'club_asset'); end if;
  v_before_state := case when cardinality(v_missing) = 0 then 'COMPLETE' else 'REVIEW_REQUIRED' end;

  if cardinality(v_missing) = 0 then
    v_tier := case
      when v_market_value.market_value_eur < 6000000 then 'ruby-red'
      when v_market_value.market_value_eur < 10000000 then 'sapphire-blue'
      when v_market_value.market_value_eur < 20000000 then 'amethyst-purple'
      when v_market_value.market_value_eur < 35000000 then 'radiant-gold'
      when v_market_value.market_value_eur < 50000000 then 'emerald-green'
      when v_market_value.market_value_eur < 70000000 then 'clear-diamond'
      else 'diamond-gold' end;
    v_price := case v_tier
      when 'ruby-red' then 0 when 'sapphire-blue' then 1 when 'amethyst-purple' then 2
      when 'radiant-gold' then 4 when 'emerald-green' then 7 when 'clear-diamond' then 10 else 15 end;
    v_should_sync := v_publication.id is null
      or v_publication.publication_status is distinct from 'published'
      or v_publication.current_membership_id is distinct from v_membership.id
      or v_publication.market_value_id is distinct from v_market_value.id
      or v_publication.effective_season is distinct from v_market_value.verified_season
      or v_publication.calculated_tier is distinct from v_tier
      or coalesce(v_publication.calculated_nominal_price_gbp, v_publication.calculated_price_tc) is distinct from v_price;
    if v_should_sync then
      select * into v_command from public.touchline_apply_derived_card_publication(
        p_player_id, v_membership.id, v_membership.competition_id,
        v_market_value.verified_season, v_market_value.market_value_eur,
        v_tier, v_price, '2026-07-premier-v1', 'published', clock_timestamp(),
        'Card Engine automatic publication from complete editorial inputs.',
        'touchline_card_engine_auto_publication', p_actor_id
      );
      v_publication_synced := true;
    end if;
  end if;

  v_after_state := case when cardinality(v_missing) = 0 then 'COMPLETE' else 'REVIEW_REQUIRED' end;
  if v_overrides_changed or v_publication_synced then
    insert into public.touchline_card_editorial_override_audit(
      player_id, changed_fields, provider_before, override_before, override_after,
      effective_before, effective_after, card_state_before, card_state_after, actor_id
    ) values (
      p_player_id,
      case when v_publication_synced then v_changed_fields || array['publication'] else v_changed_fields end,
      jsonb_build_object('displayName', v_provider_display_name, 'shirtNumber', v_provider_shirt_number,
        'countryCode3', v_provider_country_code3, 'position', v_provider_position),
      v_prior, v_next, v_effective_before, v_effective_after,
      v_before_state, v_after_state, p_actor_id
    );
  end if;
  if v_publication_synced then
    return query select v_after_state, v_missing, v_command.publication_id, v_command.publication_status,
      v_command.calculated_tier, v_command.nominal_price_gbp, v_overrides_changed, true;
  else
    return query select v_after_state, v_missing, v_publication.id, v_publication.publication_status,
      v_publication.calculated_tier, coalesce(v_publication.calculated_nominal_price_gbp, v_publication.calculated_price_tc), v_overrides_changed, false;
  end if;
end;
$$;

revoke all on function public.touchline_apply_card_editorial_review(uuid, jsonb, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_apply_card_editorial_review(uuid, jsonb, text, boolean, uuid)
  to service_role;

comment on function public.touchline_apply_card_editorial_review(uuid, jsonb, text, boolean, uuid) is
  'QA Card Engine command: saves approved presentation overrides and automatically publishes only when real required inputs are complete. Any publication failure rolls back the full command.';
commit;
