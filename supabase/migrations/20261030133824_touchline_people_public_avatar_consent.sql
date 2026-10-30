-- LOCAL FORWARD CANDIDATE, NOT APPLIED. No gate activation or Storage change.
-- Generated locally after installed CLI help failed on telemetry sandbox access.
-- Rollback is application PUBLIC_AVATAR_ENABLED OFF; do not remove consent/history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table touchline_people_private.profiles
  add column photo_published boolean not null default false,
  add constraint touchline_people_photo_requires_profile check (not photo_published or published);

-- Existing signature and grants remain. Legacy clients cannot grant consent;
-- hiding a profile revokes photo consent atomically, including legacy writes.
create or replace function touchline_people_private.save_profile(p_display_name text, p_published boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := touchline_people_private.actor();
begin
  perform touchline_people_private.assert_enabled();
  if actor_id is null then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  if p_published is null or p_display_name is null or char_length(p_display_name) not between 2 and 60
    or p_display_name <> btrim(p_display_name) or p_display_name ~ '[[:cntrl:]@]' then
    raise exception 'PEOPLE_INVALID_PROFILE' using errcode = '22023';
  end if;
  insert into touchline_people_private.profiles(account_id, display_name, published)
    values(actor_id, p_display_name, p_published)
    on conflict (account_id) do update set display_name = excluded.display_name, published = excluded.published,
      photo_published = case when excluded.published then touchline_people_private.profiles.photo_published else false end,
      updated_at = clock_timestamp();
  return touchline_people_private.own_profile();
end $$;

create or replace function touchline_people_private.own_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := touchline_people_private.actor(); result jsonb;
begin
  perform touchline_people_private.assert_enabled();
  if actor_id is null then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object('publicId', p.public_id, 'displayName', p.display_name, 'published', p.published,
    'photoPublished', p.photo_published,
    'followerCount', (select count(*) from touchline_people_private.follows f where f.target_id = p.public_id))
    into result from touchline_people_private.profiles p where p.account_id = actor_id;
  return result;
end $$;

create function touchline_people_private.save_profile_v2(p_display_name text, p_published boolean, p_photo_published boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := touchline_people_private.actor();
begin
  perform touchline_people_private.assert_enabled();
  if actor_id is null or not exists(select 1 from auth.users u where u.id = actor_id and u.deleted_at is null)
    then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  if p_photo_published is null or (p_photo_published and p_published is distinct from true)
    then raise exception 'PEOPLE_INVALID_PROFILE' using errcode = '22023'; end if;
  perform touchline_people_private.save_profile(p_display_name, p_published);
  update touchline_people_private.profiles set photo_published = p_photo_published, updated_at = clock_timestamp()
    where account_id = actor_id;
  return touchline_people_private.own_profile();
end $$;
create function public.touchline_people_save_profile_v2(p_display_name text, p_published boolean, p_photo_published boolean) returns jsonb
language sql security invoker set search_path = '' as $$
  select touchline_people_private.save_profile_v2(p_display_name, p_published, p_photo_published)
$$;

-- Private bounded projection for the mediated image service. Public RPCs for
-- search/profile/follows keep their contracts and never return these fields.
-- Canonical application owner exclusion is mandatory before URL/bytes delivery.
create function touchline_people_private.read_public_avatars(p_public_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare target record; result jsonb := '[]'::jsonb; avatar jsonb;
begin
  perform touchline_people_private.assert_enabled();
  if auth.uid() is not null then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  if p_public_ids is null or cardinality(p_public_ids) not between 1 and 20 or array_ndims(p_public_ids) <> 1
    or array_position(p_public_ids, null) is not null
    or (select count(distinct id) from unnest(p_public_ids) id) <> cardinality(p_public_ids)
    then raise exception 'PEOPLE_INVALID_IDS' using errcode = '22023'; end if;
  for target in
    select p.public_id, p.account_id, extract(epoch from p.updated_at)::text as consent_version, u.email
      from touchline_people_private.profiles p
      join auth.users u on u.id = p.account_id
      join public.users a on a.id = p.account_id
      where p.public_id = any(p_public_ids) and p.published and p.photo_published
        and a.avatar_revision > 0 and u.deleted_at is null and u.is_anonymous is not true
        and u.raw_app_meta_data -> 'touchline_arena_access_v1' = 'true'::jsonb
        and (u.banned_until is null or u.banned_until <= now()) and nullif(btrim(u.email), '') is not null
      order by p.public_id
  loop
    -- Reuse the established receipt/current authority; no history reconstruction.
    avatar := touchline_avatar_private.read_current(target.account_id);
    result := result || jsonb_build_array(jsonb_build_object('publicId', target.public_id,
      'consentVersion', target.consent_version, 'email', target.email, 'customerEligible', true, 'current', avatar));
  end loop;
  return result;
end $$;
create function public.touchline_people_read_public_avatars(p_public_ids uuid[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select touchline_people_private.read_public_avatars(p_public_ids)
$$;

-- Explicit ACL even under permissive default grants. No table grants/policies,
-- avatar writer membership, bucket changes, backfills or gate updates.
revoke all on function touchline_people_private.save_profile_v2(text, boolean, boolean),
  public.touchline_people_save_profile_v2(text, boolean, boolean),
  touchline_people_private.read_public_avatars(uuid[]), public.touchline_people_read_public_avatars(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function touchline_people_private.save_profile_v2(text, boolean, boolean),
  public.touchline_people_save_profile_v2(text, boolean, boolean) to authenticated;
grant execute on function touchline_people_private.read_public_avatars(uuid[]),
  public.touchline_people_read_public_avatars(uuid[]) to service_role;
commit;
