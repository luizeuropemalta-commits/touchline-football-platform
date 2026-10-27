-- Owner reconfirmed 25 Oct 2026: Hull, Coventry, Ipswich, Bournemouth,
-- Sunderland (Sportmonks 3), Everton (13). Only XI club eligibility changes.
-- No balance, budget, entitlement, contract, historical receipt or collection write.
begin;
set local lock_timeout = '5s';
do $migration$
declare
  target record;
  function_oid oid;
  definition text;
  patched text;
  owner_before oid;
  acl_before aclitem[];
  config_before text[];
  security_before boolean;
  old_count integer;
  new_count integer;
begin
  for target in select * from (values
    ('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)',
     'array[''22'',''117'',''116'',''52'']::text[]',
     'array[''22'',''117'',''116'',''52'',''3'',''13'']::text[]'),
    ('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)',
     'array[''22'',''117'',''116'',''52'']::text[]',
     'array[''22'',''117'',''116'',''52'',''3'',''13'']::text[]'),
    ('public.touchline_fantasy_enroll_beta(uuid,text)',
     'jsonb_build_array(''22'',''117'',''116'',''52'')',
     'jsonb_build_array(''22'',''117'',''116'',''52'',''3'',''13'')')
  ) as replacements(signature, old_value, new_value)
  loop
    function_oid := to_regprocedure(target.signature);
    if function_oid is null then raise exception 'TL_BETA_SIX_CLUB_SOURCE_MISSING'; end if;
    select pg_get_functiondef(oid), proowner, proacl, proconfig, prosecdef
      into definition, owner_before, acl_before, config_before, security_before
      from pg_proc where oid = function_oid;
    old_count := (length(definition) - length(replace(definition, target.old_value, ''))) / length(target.old_value);
    new_count := (length(definition) - length(replace(definition, target.new_value, ''))) / length(target.new_value);
    if old_count = 0 and new_count = 1 then continue; end if;
    if old_count <> 1 or new_count <> 0 then raise exception 'TL_BETA_SIX_CLUB_SOURCE_MISMATCH'; end if;
    patched := replace(definition, target.old_value, target.new_value);
    execute patched;
    if not exists(select 1 from pg_proc where oid = function_oid
      and proowner = owner_before and proacl is not distinct from acl_before
      and proconfig is not distinct from config_before and prosecdef = security_before
      and pg_get_functiondef(oid) = patched) then
      raise exception 'TL_BETA_SIX_CLUB_FUNCTION_DRIFT';
    end if;
  end loop;
end;
$migration$;
commit;
