\set ON_ERROR_STOP on
do $$
declare
  v_competition uuid := gen_random_uuid();
  v_home uuid := gen_random_uuid();
  v_away uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_manual uuid := gen_random_uuid();
  v_persisted timestamptz := '2026-09-01T10:00:00Z';
  v_facts jsonb;
  v_version integer;
  v_updated integer;
begin
  insert into public.football_competitions(id,provider,provider_competition_id,name)
    values(v_competition,'sportmonks','8','Premier League');
  insert into public.football_clubs(id,provider,provider_team_id,competition_id,name,logo_url)
    values(v_home,'sportmonks','15',v_competition,'Aston Villa','/villa.png'),
          (v_away,'sportmonks','19',v_competition,'Arsenal','/arsenal.png');
  insert into public.football_players(id,provider,provider_player_id,current_club_id,name,display_name,nationality,position)
    values(v_player,'sportmonks','1000',v_home,'Player One','Player One','England','Defender'),
          (v_manual,'sportmonks','1001',v_home,'Manual Player','Manual Player','England','Midfielder');
  insert into public.football_squad_members(provider,club_id,player_id,competition_id,jersey_number,position,status)
    values('sportmonks',v_home,v_player,v_competition,null,'Defender','active'),
          ('sportmonks',v_home,v_manual,v_competition,null,'Midfielder','active');

  perform * from public.touchline_card_engine_ensure_provisional_defaults(
    v_player,'2026-27','2026-09-01T10:00:00Z','2026-09-02T10:00:00Z',
    '[{"kind":"CANONICAL_ROSTER","reference":"shadow-player-1000","observedAt":"2026-09-01T10:00:00.000Z"}]'::jsonb
  );
  if not exists(select 1 from public.football_player_market_values where player_id=v_player
    and market_value_eur=1000000 and status='provisional' and confidence='provisional') then
    raise exception 'SHADOW_PROVISIONAL_MARKET_DEFAULT_MISSING';
  end if;
  if not exists(select 1 from public.touchline_card_editorial_overrides where player_id=v_player
    and field_key='shirtNumber' and status='provisional' and effective_value='0'::jsonb
    and provenance_status='PROVISIONAL_MISSING_SHIRT') then
    raise exception 'SHADOW_PROVISIONAL_SHIRT_DEFAULT_MISSING';
  end if;
  if not exists(select 1 from public.touchline_card_publications where player_id=v_player
    and publication_status='published' and calculated_tier='ruby-red'
    and internal_source='touchline_card_engine_provisional_defaults') then
    raise exception 'SHADOW_PROVISIONAL_PUBLICATION_MISSING';
  end if;
  select version into v_version from public.touchline_card_publications where player_id=v_player;
  perform * from public.touchline_card_engine_ensure_provisional_defaults(
    v_player,'2026-27','2026-09-01T11:00:00Z','2026-09-02T11:00:00Z',
    '[{"kind":"CANONICAL_ROSTER","reference":"shadow-player-1000","observedAt":"2026-09-01T11:00:00.000Z"}]'::jsonb
  );
  if (select version from public.touchline_card_publications where player_id=v_player) <> v_version then
    raise exception 'SHADOW_IDEMPOTENT_CHECK_CHURNED_PUBLICATION';
  end if;

  insert into public.football_player_market_values(player_id,market_value,currency,market_value_eur,last_verified,verified_season,source,confidence,status)
    values(v_manual,28000000,'EUR',28000000,'2026-09-01T09:00:00Z','2026-27','owner_editorial_override','verified','verified');
  insert into public.touchline_card_editorial_overrides(player_id,field_key,provider_value,touchline_override,effective_value,status,approved_at)
    values(v_manual,'shirtNumber',null,'33'::jsonb,'33'::jsonb,'approved','2026-09-01T09:00:00Z'),
          (v_manual,'marketValueEur',null,'28000000'::jsonb,'28000000'::jsonb,'approved','2026-09-01T09:00:00Z');
  perform * from public.touchline_card_engine_ensure_provisional_defaults(
    v_manual,'2026-27','2026-09-01T10:00:00Z','2026-09-02T10:00:00Z',
    '[{"kind":"OWNER_REVIEW","reference":"shadow-owner-approved","observedAt":"2026-09-01T10:00:00.000Z"}]'::jsonb
  );
  if (select effective_value from public.touchline_card_editorial_overrides where player_id=v_manual and field_key='shirtNumber') <> '33'::jsonb
     or (select market_value_eur from public.football_player_market_values where player_id=v_manual) <> 28000000 then
    raise exception 'SHADOW_APPROVED_MANUAL_VALUE_OVERWRITTEN';
  end if;

  select jsonb_agg(jsonb_build_object(
    'playerId',player_id,'teamId',team_id,'jerseyNumber',shirt,'role',role,
    'formationPosition',formation_position
  ) order by team_id, role, player_id) into v_facts
  from (
    select case when team_id='15' and n=1 then '1000' else (team_id::integer*1000+n)::text end player_id,
      team_id, case when team_id='15' and n=1 then 21 else n end shirt,
      case when n<=11 then 'STARTER' else 'SUBSTITUTE' end role,
      case when n<=11 then n else null end formation_position
    from (values('15'),('19')) teams(team_id) cross join generate_series(1,20) n
  ) facts;
  insert into public.football_fantasy_fixture_feeds(provider,provider_fixture_id,lineups_payload,last_synced_at)
    select 'sportmonks','19722192',jsonb_agg(jsonb_build_object(
      'playerId',fact->>'playerId','teamId',fact->>'teamId','jerseyNumber',(fact->>'jerseyNumber')::integer,
      'isStarter',fact->>'role'='STARTER','isSubstitute',fact->>'role'='SUBSTITUTE',
      'formationPosition',fact->'formationPosition'
    )),v_persisted from jsonb_array_elements(v_facts) fact;
  select updated_players into v_updated from public.touchline_card_engine_reconcile_official_lineup_shirts('19722192',v_persisted,v_facts);
  if v_updated <> 1
     or (select jersey_number from public.football_squad_members where player_id=v_player) <> 21
     or not exists(select 1 from public.touchline_card_editorial_overrides where player_id=v_player
       and field_key='shirtNumber' and status='reverted' and provenance_status='CANONICAL_LINEUP_RESOLVED') then
    raise exception 'SHADOW_OFFICIAL_LINEUP_DID_NOT_RESOLVE_EXACT_ZERO';
  end if;

  perform * from public.touchline_card_engine_resolve_provisional_market_value(
    v_player,'2026-27',22000000,'2026-09-01T12:00:00Z','licensed-shadow-value-1000'
  );
  if not exists(select 1 from public.football_player_market_values where player_id=v_player
    and market_value_eur=22000000 and status='verified' and confidence='verified')
     or not exists(select 1 from public.touchline_card_publications where player_id=v_player
       and calculated_tier='radiant-gold' and internal_source='touchline_card_engine_verified_inputs') then
    raise exception 'SHADOW_TRUSTED_VALUE_DID_NOT_REPLACE_EXACT_FALLBACK';
  end if;

  begin
    perform * from public.touchline_card_engine_resolve_provisional_market_value(
      v_manual,'2026-27',30000000,'2026-09-01T12:00:00Z','must-not-replace-approved'
    );
    raise exception 'SHADOW_APPROVED_MANUAL_MARKET_VALUE_REPLACED';
  exception when raise_exception then
    if sqlerrm = 'SHADOW_APPROVED_MANUAL_MARKET_VALUE_REPLACED' then raise; end if;
  end;

  if has_function_privilege('authenticated','public.touchline_card_engine_ensure_provisional_defaults(uuid,text,timestamptz,timestamptz,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.touchline_card_engine_ensure_provisional_defaults(uuid,text,timestamptz,timestamptz,jsonb)','EXECUTE') then
    raise exception 'SHADOW_FUNCTION_GRANTS_INVALID';
  end if;
end;
$$;

select json_build_object(
  'provisionalDefaults', (select count(*) from public.touchline_card_editorial_audit_events where event_type='provisional_defaulted'),
  'provisionalResolved', (select count(*) from public.touchline_card_editorial_audit_events where event_type='provisional_resolved'),
  'publishedCards', (select count(*) from public.touchline_card_publications where publication_status='published')
);
