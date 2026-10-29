-- Seasonal payments use the collection budget even before the first coach is
-- selected. A legacy purchase must not create another ownership path then.
-- Preserve installed receipts, prices, contracts, ACLs and lock ordering.
begin;
set local lock_timeout = '5s';

do $boundary$
declare
  change record;
  target regprocedure;
  source text;
  patched text;
  guard text;
  owner_before oid;
  acl_before aclitem[];
  config_before text[];
  definer_before boolean;
begin
  for change in select * from (values
    ('public.checkout_touchline_market_cart(uuid,uuid[],text)',
     E'  perform id\n    from public.touchline_card_inventory', 'requested_user_id'),
    ('public.touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid)',
     E'  select * into v_existing from public.touchline_coach_contracts\n  where user_id = p_user_id and status = ''active'' for update;', 'p_user_id')
  ) as changes(signature, marker, user_parameter) loop
    target := to_regprocedure(change.signature);
    if target is null then raise exception 'SEASON_LEGACY_BOUNDARY_SOURCE_MISSING: %', change.signature; end if;
    select pg_get_functiondef(oid), proowner, proacl, proconfig, prosecdef
      into source, owner_before, acl_before, config_before, definer_before
      from pg_proc where oid = target;
    if (length(source) - length(replace(source, change.marker, ''))) / length(change.marker) <> 1
      or strpos(source, 'touchline-club-ownership:') = 0
      or strpos(source, 'for update;') = 0
      or strpos(source, 'for update;') > strpos(source, change.marker)
      or strpos(source, 'idempotentReplay') = 0
      or strpos(source, 'idempotentReplay') > strpos(source, change.marker) then
      raise exception 'SEASON_LEGACY_BOUNDARY_SOURCE_MISMATCH: %', change.signature;
    end if;
    -- The existing ownership/users locks remain in place. In particular, do
    -- not acquire the subscription mutex here: that would invert bootstrap's
    -- subscription -> ownership ordering. Seasonal writers serialize through
    -- the same users row before updating this entitlement.
    -- Place after exact durable replay, before any fresh purchase/hire branch.
    guard := format($check$  if exists (
    select 1 from public.touchline_fantasy_entitlements e
    where e.user_id = %s and e.entitlement_key = 'fantasy_access'
      and e.metadata->>'seasonTestOrderId' is not null
  ) then
    raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED';
  end if;

$check$, change.user_parameter);
    patched := replace(source, change.marker, guard || change.marker);
    execute patched;
    if not exists (
      select 1 from pg_proc where oid = target and proowner = owner_before
        and proacl is not distinct from acl_before and proconfig is not distinct from config_before
        and prosecdef = definer_before and pg_get_functiondef(oid) = patched
    ) then raise exception 'SEASON_LEGACY_BOUNDARY_FUNCTION_DRIFT'; end if;
  end loop;
end $boundary$;

commit;
