-- Recompile the publication-only command with every membership field qualified:
-- its OUT parameter `player_id` must never shadow the locked membership row.
begin;
create or replace function public.touchline_apply_derived_card_publication(
  p_player_id uuid, p_membership_id uuid, p_competition_id uuid,
  p_effective_season text, p_market_value_eur bigint, p_calculated_tier text,
  p_nominal_price_gbp integer, p_policy_version text, p_publication_status text,
  p_last_reviewed_at timestamptz, p_internal_note text, p_internal_source text, p_actor_id uuid
) returns table (publication_id uuid, publication_status text, calculated_tier text, nominal_price_gbp integer, player_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_player public.football_players%rowtype;
  v_membership public.football_squad_members%rowtype;
  v_market_value public.football_player_market_values%rowtype;
  v_previous_publication public.touchline_card_publications%rowtype;
  v_publication public.touchline_card_publications%rowtype;
  v_before_state jsonb;
  v_action text;
begin
  if p_player_id is null or p_membership_id is null or p_competition_id is null
     or p_actor_id is null or p_last_reviewed_at is null
     or p_market_value_eur is null or p_market_value_eur < 0
     or p_nominal_price_gbp is null or p_nominal_price_gbp < 0
     or p_calculated_tier is null
     or length(trim(coalesce(p_effective_season, ''))) = 0
     or length(trim(coalesce(p_policy_version, ''))) = 0
     or p_internal_source <> 'touchline_card_engine_auto_publication'
     or p_publication_status <> 'published'
     or p_nominal_price_gbp <> (case p_calculated_tier
       when 'ruby-red' then 0 when 'sapphire-blue' then 1
       when 'amethyst-purple' then 2 when 'radiant-gold' then 4
       when 'emerald-green' then 7 when 'clear-diamond' then 10
       when 'diamond-gold' then 15 else -1 end) then
    raise exception using errcode = '22023', message = 'TL_DERIVED_PUBLICATION_COMMAND_INVALID';
  end if;
  select * into v_player from public.football_players as player where player.id = p_player_id for update;
  if not found or v_player.current_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_DERIVED_PUBLICATION_PLAYER_NOT_CANONICAL';
  end if;
  select * into v_membership from public.football_squad_members as membership
   where membership.id = p_membership_id and membership.player_id = p_player_id
     and membership.club_id = v_player.current_club_id and membership.competition_id = p_competition_id
     and membership.provider = 'sportmonks' and membership.status = 'active' for update;
  if not found or (select count(*) from public.football_squad_members as active_membership
    where active_membership.player_id = p_player_id and active_membership.provider = 'sportmonks'
      and active_membership.status = 'active') <> 1 then
    raise exception using errcode = 'P0001', message = 'TL_DERIVED_PUBLICATION_MEMBERSHIP_NOT_UNIQUE';
  end if;
  if not exists (select 1 from public.football_competitions as competition
    where competition.id = p_competition_id and competition.provider = 'sportmonks'
      and competition.provider_competition_id = '8') then
    raise exception using errcode = 'P0001', message = 'TL_DERIVED_PUBLICATION_COMPETITION_NOT_PREMIER_LEAGUE';
  end if;
  select * into v_market_value from public.football_player_market_values as value
   where value.player_id = p_player_id for update;
  if not found or v_market_value.status <> 'verified' or v_market_value.confidence <> 'verified'
     or v_market_value.market_value_eur is null or v_market_value.market_value_eur <> p_market_value_eur
     or v_market_value.verified_season is distinct from p_effective_season then
    raise exception using errcode = 'P0001', message = 'TL_DERIVED_PUBLICATION_MARKET_VALUE_NOT_VERIFIED';
  end if;
  if p_calculated_tier <> (case
    when v_market_value.market_value_eur < 6000000 then 'ruby-red'
    when v_market_value.market_value_eur < 10000000 then 'sapphire-blue'
    when v_market_value.market_value_eur < 20000000 then 'amethyst-purple'
    when v_market_value.market_value_eur < 35000000 then 'radiant-gold'
    when v_market_value.market_value_eur < 50000000 then 'emerald-green'
    when v_market_value.market_value_eur < 70000000 then 'clear-diamond'
    else 'diamond-gold' end) then
    raise exception using errcode = '22023', message = 'TL_DERIVED_PUBLICATION_TIER_MISMATCH';
  end if;
  select * into v_previous_publication from public.touchline_card_publications as publication
   where publication.player_id = p_player_id for update;
  v_before_state := jsonb_build_object('publication', case when v_previous_publication.id is null then null else to_jsonb(v_previous_publication) end, 'market_value', to_jsonb(v_market_value));
  insert into public.touchline_card_publications (
    player_id, current_membership_id, competition_id, effective_season, market_value_id,
    publication_status, calculated_tier, calculated_price_tc, calculated_nominal_price_gbp,
    policy_version, last_reviewed_at, published_at, unpublished_at, internal_note, internal_source,
    created_by, updated_by, version
  ) values (
    p_player_id, p_membership_id, p_competition_id, p_effective_season, v_market_value.id,
    'published', p_calculated_tier, p_nominal_price_gbp, p_nominal_price_gbp, p_policy_version,
    p_last_reviewed_at, clock_timestamp(), null, nullif(trim(coalesce(p_internal_note, '')), ''),
    p_internal_source, p_actor_id, p_actor_id, 1
  ) on conflict on constraint touchline_card_publications_player_id_key do update set
    current_membership_id = excluded.current_membership_id, competition_id = excluded.competition_id,
    effective_season = excluded.effective_season, market_value_id = excluded.market_value_id,
    publication_status = excluded.publication_status, calculated_tier = excluded.calculated_tier,
    calculated_price_tc = excluded.calculated_price_tc, calculated_nominal_price_gbp = excluded.calculated_nominal_price_gbp,
    policy_version = excluded.policy_version, last_reviewed_at = excluded.last_reviewed_at,
    published_at = excluded.published_at, unpublished_at = excluded.unpublished_at,
    internal_note = excluded.internal_note, internal_source = excluded.internal_source,
    updated_by = excluded.updated_by, version = public.touchline_card_publications.version + 1
  returning * into v_publication;
  v_action := case when v_previous_publication.id is null then 'published' else 'reviewed' end;
  insert into public.touchline_card_publication_history (
    publication_id, player_id, provider_player_id, action, previous_market_value_eur, new_market_value_eur,
    currency, previous_tier, new_tier, nominal_price_tc, nominal_price_gbp, before_state, after_state, actor_id
  ) values (
    v_publication.id, p_player_id, v_player.provider_player_id, v_action,
    v_market_value.market_value_eur, v_market_value.market_value_eur, 'EUR',
    v_previous_publication.calculated_tier, p_calculated_tier, p_nominal_price_gbp, p_nominal_price_gbp,
    v_before_state, jsonb_build_object('publication', to_jsonb(v_publication), 'market_value', to_jsonb(v_market_value)), p_actor_id
  );
  return query select v_publication.id, v_publication.publication_status, v_publication.calculated_tier, v_publication.calculated_nominal_price_gbp, v_publication.player_id;
end;
$$;
revoke all on function public.touchline_apply_derived_card_publication(uuid, uuid, uuid, text, bigint, text, integer, text, text, timestamptz, text, text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_apply_derived_card_publication(uuid, uuid, uuid, text, bigint, text, integer, text, text, timestamptz, text, text, uuid) to service_role;
commit;
