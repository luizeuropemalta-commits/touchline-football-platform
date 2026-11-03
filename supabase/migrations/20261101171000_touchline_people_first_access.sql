-- Local forward candidate: explicit first-access discovery, no backfill or gate activation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create function touchline_people_private.complete_first_access(p_display_name text, p_intent_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := touchline_people_private.actor();
begin
  perform touchline_people_private.assert_enabled();
  if actor_id is null or not exists(select 1 from auth.users where id=actor_id and email_confirmed_at is not null) then
    raise exception 'PEOPLE_FORBIDDEN' using errcode='42501';
  end if;
  if p_intent_version is distinct from 1 or p_display_name is null
    or char_length(p_display_name) not between 2 and 60 or p_display_name<>btrim(p_display_name)
    or p_display_name ~ '[[:cntrl:]@]' then
    raise exception 'PEOPLE_INVALID_SIGNUP_INTENT' using errcode='22023';
  end if;
  -- A stale tab can never overwrite a profile created/hidden in another tab.
  insert into touchline_people_private.profiles(account_id,display_name,published,photo_published)
    values(actor_id,p_display_name,true,false) on conflict(account_id) do nothing;
  return touchline_people_private.own_profile();
end $$;
create function public.touchline_people_complete_first_access(p_display_name text,p_intent_version integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select touchline_people_private.complete_first_access(p_display_name,p_intent_version)
$$;
revoke all on function touchline_people_private.complete_first_access(text,integer), public.touchline_people_complete_first_access(text,integer) from public,anon,authenticated,service_role;
grant execute on function touchline_people_private.complete_first_access(text,integer), public.touchline_people_complete_first_access(text,integer) to authenticated;
commit;
