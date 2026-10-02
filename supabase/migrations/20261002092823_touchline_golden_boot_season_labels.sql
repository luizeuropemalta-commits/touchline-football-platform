-- Formatting-only equivalence for canonical adjacent-year season labels.
-- No row updates. Keep the existing function identity, owner, ACL and invoker
-- boundary; all publication, membership and provenance predicates stay intact.
create or replace function public.touchline_golden_boot_bindings_valid(p_comp uuid,p_season uuid,p_label text,p_leaders jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
  select
    (select count(*)=1 from public.football_competitions c
      where c.id=p_comp and c.provider='sportmonks' and c.provider_competition_id='8')
    and (select count(*)=1 and bool_and(s.id=p_season and public.touchline_golden_boot_editorial_season(s.name)=p_label)
      from public.football_seasons s where s.competition_id=p_comp and s.provider='sportmonks' and s.is_current)
    and jsonb_typeof(p_leaders)='array' and jsonb_array_length(p_leaders) between 1 and 500
    and (select count(distinct x->>'player_id')=count(*) and count(distinct x->>'provider_player_id')=count(*)
      from jsonb_array_elements(p_leaders) x)
    and not exists (
      select 1 from jsonb_array_elements(p_leaders) x where not exists (
        select 1 from public.football_players p
        join public.football_clubs c on c.id=p.current_club_id
        join public.football_squad_members m on m.id=(x->>'membership_id')::uuid and m.player_id=p.id and m.club_id=c.id
        join public.touchline_card_publications pub on pub.player_id=p.id and pub.current_membership_id=m.id
        join public.football_player_market_values v on v.player_id=p.id
        where p.id=(x->>'player_id')::uuid and p.provider='sportmonks' and p.provider_player_id=x->>'provider_player_id'
          and c.id=(x->>'club_id')::uuid and c.provider='sportmonks' and c.provider_team_id=x->>'provider_team_id'
          and c.competition_id=p_comp and m.provider='sportmonks' and m.competition_id=p_comp and m.status='active'
          and (select count(*) from public.football_squad_members mm where mm.player_id=p.id
            and mm.provider='sportmonks' and mm.competition_id=p_comp and mm.status='active')=1
          and pub.competition_id=p_comp and public.touchline_golden_boot_editorial_season(pub.effective_season)=p_label and pub.publication_status='published'
          and pub.last_reviewed_at is not null and pub.calculated_tier is not null and pub.calculated_nominal_price_gbp>=0
          and public.touchline_golden_boot_editorial_season(v.verified_season)=p_label and v.market_value_eur>=0
          and ((v.status='verified' and v.confidence='verified') or
            (v.status='provisional' and v.confidence='provisional' and v.source='touchline_card_engine_provisional'
              and v.market_value_eur=1000000 and pub.internal_source='touchline_card_engine_provisional_defaults'
              and exists(select 1 from public.touchline_card_editorial_overrides o where o.player_id=p.id
                and o.field_key='marketValueEur' and o.status='provisional'
                and o.provenance_status='PROVISIONAL_MISSING_MARKET_VALUE'
                and (o.effective_value='1000000'::jsonb or o.effective_value->'value'='1000000'::jsonb)
                and o.last_verification_at is not null and o.next_verification_at is not null)))
      )
    )
$$;
