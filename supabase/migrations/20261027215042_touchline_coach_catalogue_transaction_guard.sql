-- Forward-only guard; preserves installed pricing, market, ownership and replay.
-- Public catalogue remains OFF. No customer state or contract is backfilled.
begin;
set local lock_timeout='5s';
create function touchline_coaches_private.assert_hire(
 p_provider_id text,p_club_id uuid,p_tier text,p_revision integer,p_publication_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare cfg touchline_coaches_private.configuration;
begin
 -- Publisher uses FOR UPDATE on exactly this row. Hold this shared lock until
 -- the customer transaction commits, so validation and purchase are indivisible.
 select * into strict cfg from touchline_coaches_private.configuration where singleton for share;
 if not cfg.public_enabled then
   if p_revision is not null or p_publication_id is not null then raise exception 'CLUB_COACH_CATALOGUE_CHANGED'; end if;
   return; -- Explicit pre-activation legacy mode, unchanged.
 end if;
 if p_revision is distinct from cfg.revision or p_publication_id is null
   or not exists(select 1 from touchline_coaches_private.current_assignments a
      join touchline_coaches_private.identities i on i.id=a.coach_id
      join touchline_coaches_private.publications p on p.id=a.publication_id
      join public.football_clubs c on c.provider='sportmonks' and c.provider_team_id=a.team_id
      where i.provider_id=p_provider_id and p.id=p_publication_id
        and (p_club_id is null or c.id=p_club_id)
        and (p_tier is null or p.classification->>'tierKey'=p_tier)) then
   raise exception 'CLUB_COACH_CATALOGUE_CHANGED';
 end if;
end $$;
revoke all on function touchline_coaches_private.assert_hire(text,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function touchline_coaches_private.assert_hire(text,uuid,text,integer,uuid) to service_role;

do $guard$
declare definition text; marker text; signature text;
begin
 definition:=pg_get_functiondef('public.touchline_club_coach_lifecycle(uuid,uuid,jsonb,jsonb)'::regprocedure);
 marker:='    v_value:=case p_offer->>''tier''';
 if strpos(definition,marker)=0 then raise exception 'COACH_LIFECYCLE_GUARD_SOURCE_MISMATCH'; end if;
 definition:=replace(definition,marker,$injection$    perform touchline_coaches_private.assert_hire(p_offer->>'id',(p_offer->>'clubId')::uuid,p_offer->>'tier',
      (p_offer->>'catalogueRevision')::integer,(p_offer->>'cataloguePublicationId')::uuid);
$injection$||marker);
 execute definition;

 definition:=pg_get_functiondef('public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)'::regprocedure);
 if strpos(definition,'  v_state jsonb;')=0 or strpos(definition,E'begin\n')=0 or strpos(definition,'  v_budget := case p_plan')=0 then
   raise exception 'COACH_INITIALIZE_GUARD_SOURCE_MISMATCH'; end if;
 definition:=replace(definition,'  v_state jsonb;','  v_catalogue_offer jsonb:=p_coach;'||E'\n  v_state jsonb;');
 -- Metadata is only a concurrency proof, never part of the funded coach state.
 definition:=replace(definition,E'begin\n',E'begin\n  p_coach:=p_coach-array[''catalogueRevision'',''cataloguePublicationId''];\n');
 marker:='  v_budget := case p_plan';
 definition:=replace(definition,marker,$injection$  perform touchline_coaches_private.assert_hire(v_catalogue_offer->>'id',null,v_catalogue_offer->>'tier',
    (v_catalogue_offer->>'catalogueRevision')::integer,(v_catalogue_offer->>'cataloguePublicationId')::uuid);
$injection$||marker);
 execute definition;

 -- Preserve all installed legacy ownership checks and exact historical replay.
 -- The six-argument overload checks tokens only immediately before a new insert.
 definition:=pg_get_functiondef('public.touchline_hire_coach_contract(uuid,text,uuid,text)'::regprocedure);
 signature:='public.touchline_hire_coach_contract(p_user_id uuid, p_coach_provider_id text, p_club_id uuid, p_idempotency_key text)';
 marker:='  insert into public.touchline_coach_contracts (';
 if strpos(definition,signature)=0 or strpos(definition,marker)=0 then raise exception 'COACH_ARENA_GUARD_SOURCE_MISMATCH'; end if;
 definition:=replace(definition,signature,'public.touchline_hire_coach_contract(p_user_id uuid, p_coach_provider_id text, p_club_id uuid, p_idempotency_key text, p_catalogue_revision integer, p_publication_id uuid)');
 definition:=replace(definition,marker,$injection$  perform touchline_coaches_private.assert_hire(trim(p_coach_provider_id),p_club_id,null,p_catalogue_revision,p_publication_id);
$injection$||marker);
 execute definition;
end $guard$;
-- Existing callers cannot bypass the new check. With public gate ON, a fresh
-- legacy call without tokens is rejected; a previously committed replay survives.
create or replace function public.touchline_hire_coach_contract(p_user_id uuid,p_coach_provider_id text,p_club_id uuid,p_idempotency_key text)
returns jsonb language sql security invoker set search_path='' as $$
 select public.touchline_hire_coach_contract(p_user_id,p_coach_provider_id,p_club_id,p_idempotency_key,null::integer,null::uuid)
$$;
revoke all on function public.touchline_hire_coach_contract(uuid,text,uuid,text),public.touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_hire_coach_contract(uuid,text,uuid,text),public.touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid) to service_role;
commit;
