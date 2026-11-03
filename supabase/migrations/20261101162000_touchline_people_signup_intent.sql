-- Local forward candidate. Does not enable discovery or modify existing profiles.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create function public.touchline_people_bootstrap_signup(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare intention jsonb; public_name text;
begin
  select raw_user_meta_data->'touchline_discovery_signup_v1' into intention
  from auth.users where id=p_user_id and email_confirmed_at is not null
    and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=now());
  if intention is null then return; end if;
  if intention->'version' is distinct from '1'::jsonb
    or intention->'published' is distinct from 'true'::jsonb
    or jsonb_typeof(intention->'public_name') is distinct from 'string' then
    raise exception 'PEOPLE_INVALID_SIGNUP_INTENT' using errcode='22023';
  end if;
  public_name := intention->>'public_name';
  if char_length(public_name) not between 2 and 60 or public_name<>btrim(public_name)
    or public_name ~ '[[:cntrl:]@]' then
    raise exception 'PEOPLE_INVALID_SIGNUP_INTENT' using errcode='22023';
  end if;
  -- No upsert update: retry, rename, unpublish and photo consent remain intact.
  insert into touchline_people_private.profiles(account_id,display_name,published,photo_published)
    values(p_user_id,public_name,true,false) on conflict(account_id) do nothing;
end $$;
revoke all on function public.touchline_people_bootstrap_signup(uuid) from public,anon,authenticated;
grant execute on function public.touchline_people_bootstrap_signup(uuid) to service_role;
comment on function public.touchline_people_bootstrap_signup(uuid) is 'Service-only first-access signup intent; insert only; no email fallback or photo consent.';
commit;
