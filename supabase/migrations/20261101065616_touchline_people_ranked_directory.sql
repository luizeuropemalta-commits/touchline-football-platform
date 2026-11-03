-- Confirmed gameplay plan only; never derive it from billing metadata, a round
-- snapshot or a collection's stale plan. This helper is not executable by API
-- roles. Its owning profile/directory functions enforce discovery consent.
create function touchline_people_private.current_public_plan(p_public_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select e.plan_key
  from touchline_people_private.profiles p
  join public.touchline_fantasy_entitlements e on e.user_id = p.account_id
    and e.entitlement_key = 'fantasy_access'
  where p.public_id = p_public_id and p.published
    and e.status = 'active' and e.plan_key in ('beta', 'standard', 'master', 'vip')
    and (e.current_period_start is null or e.current_period_start <= now())
    and (e.current_period_end is null or e.current_period_end > now())
$$;
revoke all on function touchline_people_private.current_public_plan(uuid)
  from public, anon, authenticated, service_role;

-- Existing public wrapper and follow command continue using the same protected
-- projection. CREATE OR REPLACE preserves its existing identity and ACL.
create or replace function touchline_people_private.profile(p_public_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform touchline_people_private.assert_enabled();
  select jsonb_build_object(
    'publicId', p.public_id, 'displayName', p.display_name,
    'planKey', touchline_people_private.current_public_plan(p.public_id),
    'followerCount', (select count(*) from touchline_people_private.follows f where f.target_id = p.public_id),
    'following', exists(select 1 from touchline_people_private.follows f
      where f.target_id = p.public_id and f.actor_id = touchline_people_private.actor()),
    'viewer', case when touchline_people_private.actor() = p.account_id then 'self'
      when touchline_people_private.actor() is not null then 'member' else 'guest' end
  ) into result from touchline_people_private.profiles p where p.public_id = p_public_id and p.published;
  return result;
end
$$;

-- Server-only opt-in directory input. Does not activate discovery or publish users.
-- Internal account UUIDs are joined to the canonical season ranking inside the
-- server; they must never cross the public HTTP DTO boundary.
create function touchline_people_private.directory_candidates(p_viewer uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; candidate_count bigint;
begin
  perform touchline_people_private.assert_enabled();
  if p_viewer is not null and not exists (
    select 1 from auth.users u where u.id = p_viewer and u.is_anonymous is not true
      and u.raw_app_meta_data -> 'touchline_arena_access_v1' = 'true'::jsonb
      and (u.banned_until is null or u.banned_until <= now())
  ) then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  select count(*) into candidate_count from (
    select 1 from touchline_people_private.profiles p where p.published limit 10001
  ) published_candidates;
  if candidate_count > 10000 then raise exception 'PEOPLE_DIRECTORY_CAPACITY' using errcode = '54000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'accountId', p.account_id, 'publicId', p.public_id, 'displayName', p.display_name,
    'planKey', touchline_people_private.current_public_plan(p.public_id),
    'followerCount', (select count(*) from touchline_people_private.follows f where f.target_id = p.public_id),
    'following', exists(select 1 from touchline_people_private.follows f where f.target_id = p.public_id and f.actor_id = p_viewer),
    'viewer', case when p_viewer = p.account_id then 'self' when p_viewer is not null then 'member' else 'guest' end
  ) order by p.public_id), '[]'::jsonb) into result
  from touchline_people_private.profiles p where p.published;
  return result;
end $$;
create function public.touchline_people_directory_candidates(p_viewer uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select touchline_people_private.directory_candidates(p_viewer)
$$;
revoke all on function touchline_people_private.directory_candidates(uuid), public.touchline_people_directory_candidates(uuid)
  from public, anon, authenticated, service_role;
grant execute on function touchline_people_private.directory_candidates(uuid), public.touchline_people_directory_candidates(uuid)
  to service_role;
