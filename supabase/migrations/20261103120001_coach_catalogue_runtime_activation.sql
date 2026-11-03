-- Runtime switch with an explicit OFF receipt. Errors or missing configuration
-- never mean legacy mode. No gate, appointment, publication or wallet changes.
begin;
set local lock_timeout='5s';
create function touchline_coaches_private.read_catalogue_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare enabled boolean;
begin
  select public_enabled into strict enabled from touchline_coaches_private.configuration where singleton;
  if enabled is false then return jsonb_build_object('mode','legacy'); end if;
  return jsonb_build_object('mode','published','catalogue',touchline_coaches_private.read_catalogue());
end;
$$;
create function public.touchline_read_coach_catalogue_state() returns jsonb
language sql stable security invoker set search_path='' as $$
  select touchline_coaches_private.read_catalogue_state()
$$;
revoke all on function touchline_coaches_private.read_catalogue_state(),public.touchline_read_coach_catalogue_state() from public,anon,authenticated;
grant execute on function touchline_coaches_private.read_catalogue_state(),public.touchline_read_coach_catalogue_state() to service_role;
commit;
