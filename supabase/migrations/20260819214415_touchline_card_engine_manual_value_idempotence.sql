-- An unchanged manual valuation is a no-op, not a new valuation event.
-- The automatic Card Engine source continues to use the publication-only
-- path; a genuine manual value change delegates to the preserved value command.
begin;
create or replace function public.touchline_apply_manual_card_publication(
  p_player_id uuid, p_membership_id uuid, p_competition_id uuid,
  p_effective_season text, p_market_value_eur bigint, p_calculated_tier text,
  p_nominal_price_gbp integer, p_policy_version text, p_publication_status text,
  p_last_reviewed_at timestamptz, p_internal_note text, p_internal_source text, p_actor_id uuid
) returns table (publication_id uuid, publication_status text, calculated_tier text, nominal_price_gbp integer, player_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_value public.football_player_market_values%rowtype;
  v_publication public.touchline_card_publications%rowtype;
begin
  if p_internal_source = 'touchline_card_engine_auto_publication' then
    return query select * from public.touchline_apply_derived_card_publication(
      p_player_id, p_membership_id, p_competition_id, p_effective_season,
      p_market_value_eur, p_calculated_tier, p_nominal_price_gbp, p_policy_version,
      p_publication_status, p_last_reviewed_at, p_internal_note, p_internal_source, p_actor_id
    );
  end if;
  select * into v_value from public.football_player_market_values as value
   where value.player_id = p_player_id for update;
  select * into v_publication from public.touchline_card_publications as publication
   where publication.player_id = p_player_id for update;
  if found and v_value.status = 'verified' and v_value.confidence = 'verified'
     and v_value.market_value_eur = p_market_value_eur
     and v_value.verified_season is not distinct from p_effective_season
     and v_publication.id is not null
     and v_publication.current_membership_id = p_membership_id
     and v_publication.competition_id = p_competition_id
     and v_publication.publication_status = p_publication_status
     and v_publication.calculated_tier = p_calculated_tier
     and coalesce(v_publication.calculated_nominal_price_gbp, v_publication.calculated_price_tc) = p_nominal_price_gbp then
    return query select v_publication.id, v_publication.publication_status,
      v_publication.calculated_tier,
      coalesce(v_publication.calculated_nominal_price_gbp, v_publication.calculated_price_tc),
      v_publication.player_id;
    return;
  end if;
  return query select * from public.touchline_apply_manual_card_publication_with_market_value(
    p_player_id, p_membership_id, p_competition_id, p_effective_season,
    p_market_value_eur, p_calculated_tier, p_nominal_price_gbp, p_policy_version,
    p_publication_status, p_last_reviewed_at, p_internal_note, p_internal_source, p_actor_id
  );
end;
$$;
revoke all on function public.touchline_apply_manual_card_publication(uuid, uuid, uuid, text, bigint, text, integer, text, text, timestamptz, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_apply_manual_card_publication(uuid, uuid, uuid, text, bigint, text, integer, text, text, timestamptz, text, text, uuid)
  to service_role;
commit;
