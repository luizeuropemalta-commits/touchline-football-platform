-- Hosted Supabase does not let postgres grant USAGE on auth to custom roles.
-- Keep the writer unprivileged. Only this private, read-only identity guard
-- crosses that boundary; it returns no Auth data and preserves subject checks.
create function touchline_avatar_private.assert_auth_identity(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise exception 'AVATAR_INVALID_ACTOR'; end if;
  if auth.uid() is not null and auth.uid() <> p_actor
  then raise exception using errcode='42501',message='AVATAR_AUTH_SUBJECT_MISMATCH'; end if;
  if not exists(select 1 from auth.users where id=p_actor and deleted_at is null)
  then raise exception 'AVATAR_AUTH_IDENTITY_UNAVAILABLE'; end if;
end $$;
alter function touchline_avatar_private.assert_auth_identity(uuid) owner to postgres;
revoke all on function touchline_avatar_private.assert_auth_identity(uuid)
  from public,anon,authenticated,service_role;
grant execute on function touchline_avatar_private.assert_auth_identity(uuid)
  to touchline_avatar_writer;

-- Temporary migration ownership access; removed in this same transaction.
grant touchline_avatar_writer to postgres;
create or replace function touchline_avatar_private.assert_actor(p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_actor is null or p_actor::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_ACTOR'; end if;
  perform touchline_avatar_private.assert_auth_identity(p_actor);
end $$;

revoke touchline_avatar_writer from postgres;
