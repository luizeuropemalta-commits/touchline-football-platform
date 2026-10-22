-- A migrated collection and the legacy TC checkout must never fund two rosters.
-- No backfill, deletion or flag activation. Existing non-migrated accounts keep
-- the installed checkout, including its price, wallet, supply and replay rules.
begin;
set local lock_timeout='5s';
do $migration$
declare
  definition text;
  marker text;
begin
  definition:=pg_get_functiondef('public.checkout_touchline_market_cart(uuid,uuid[],text)'::regprocedure);
  marker:=E'begin\n';
  if strpos(definition,marker)=0 or strpos(definition,'from public.clubowner_credit_ledger')=0 then
    raise exception 'CLUB_LEGACY_CHECKOUT_SOURCE_MISMATCH';
  end if;
  definition:=replace(definition,marker,$guard$begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-club-ownership:' || requested_user_id::text,0));
  if exists(select 1 from public.touchline_club_collections owned
    join public.touchline_fantasy_configs config on config.season_id=owned.season_id
    where owned.user_id=requested_user_id and config.status='active' and config.competition_key='england') then
    raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED';
  end if;
$guard$);
  execute definition;

  -- Coach-first's old endpoint is also writable; it must not create a free
  -- second coach alongside the already-funded collection coach. Scoring and
  -- historical point reconciliation functions are deliberately unchanged.
  definition:=pg_get_functiondef('public.touchline_hire_coach_contract(uuid,text,uuid,text)'::regprocedure);
  marker:=E'begin\n';
  if strpos(definition,marker)=0 or strpos(definition,'insert into public.touchline_coach_contracts')=0 then
    raise exception 'CLUB_LEGACY_COACH_SOURCE_MISMATCH';
  end if;
  definition:=replace(definition,marker,$guard$begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-club-ownership:' || p_user_id::text,0));
  if exists(select 1 from public.touchline_club_collections owned
    join public.touchline_fantasy_configs config on config.season_id=owned.season_id
    where owned.user_id=p_user_id and config.status='active' and config.competition_key='england') then
    raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED';
  end if;
$guard$);
  execute definition;

  definition:=pg_get_functiondef('public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)'::regprocedure);
  marker:='perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text';
  if strpos(definition,marker)=0 then raise exception 'CLUB_INITIALIZE_MUTEX_SOURCE_MISMATCH'; end if;
  -- The window/subscription locks installed previously remain first. Checkout
  -- does not take either; both paths acquire this mutex before any ownership write.
  definition:=replace(definition,marker,
    'perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''touchline-club-ownership:'' || p_user_id::text,0));' || E'\n  ' || marker);
  marker:='from public.touchline_card_contracts where user_id=p_user_id and season_id=p_season_id and status=''active''';
  if strpos(definition,marker)=0 then raise exception 'CLUB_INITIALIZE_LEGACY_SOURCE_MISMATCH'; end if;
  -- Legacy checkout has no season binding. An unscoped active contract cannot
  -- be mistaken for harmless historical ownership when starting a new wallet.
  definition:=replace(definition,marker,
    'from public.touchline_card_contracts where user_id=p_user_id and (season_id=p_season_id or season_id is null) and status=''active''');
  execute definition;
end;
$migration$;
commit;
