-- Explicit opt-in projection. No backfill from names, email, avatars or game data.
-- Private tables are deliberately inaccessible through the Data API; the public
-- invoker wrappers expose only the bounded contracts below, never account IDs.
create schema touchline_people_private;
revoke all on schema touchline_people_private from public, anon, authenticated, service_role;
grant usage on schema touchline_people_private to anon, authenticated, service_role;

-- Independent database gate: applying this migration never activates direct RPCs.
-- Activation requires an explicit service-role configuration change after QA.
create table touchline_people_private.configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into touchline_people_private.configuration(singleton, enabled) values (true, false);
alter table touchline_people_private.configuration enable row level security;
revoke all on touchline_people_private.configuration from public, anon, authenticated, service_role;
grant select, update(enabled) on touchline_people_private.configuration to service_role;

create function touchline_people_private.assert_enabled() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select c.enabled from touchline_people_private.configuration c where c.singleton), false) then
    raise exception 'PEOPLE_UNAVAILABLE' using errcode = '55000';
  end if;
end $$;

create table touchline_people_private.profiles (
  account_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null unique default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 60
    and display_name = btrim(display_name) and display_name !~ '[[:cntrl:]@]'),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index touchline_people_name_prefix on touchline_people_private.profiles
  (lower(display_name) text_pattern_ops, public_id) where published;

create table touchline_people_private.follows (
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references touchline_people_private.profiles(public_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id)
);
create index touchline_people_followers on touchline_people_private.follows(target_id);
alter table touchline_people_private.profiles enable row level security;
alter table touchline_people_private.follows enable row level security;
revoke all on touchline_people_private.profiles, touchline_people_private.follows
  from public, anon, authenticated, service_role;
-- No table policies/grants: all access uses explicit, narrowly projected RPCs.

create function touchline_people_private.actor() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where u.id = (select auth.uid())
    and u.is_anonymous is not true
    and u.raw_app_meta_data -> 'touchline_arena_access_v1' = 'true'::jsonb
    and (u.banned_until is null or u.banned_until <= now())
$$;

create function touchline_people_private.profile(p_public_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform touchline_people_private.assert_enabled();
  select jsonb_build_object(
    'publicId', p.public_id, 'displayName', p.display_name,
    'followerCount', (select count(*) from touchline_people_private.follows f where f.target_id = p.public_id),
    'following', exists(select 1 from touchline_people_private.follows f
      where f.target_id = p.public_id and f.actor_id = touchline_people_private.actor()),
    'viewer', case when touchline_people_private.actor() = p.account_id then 'self'
      when touchline_people_private.actor() is not null then 'member' else 'guest' end
  ) into result from touchline_people_private.profiles p where p.public_id = p_public_id and p.published;
  return result;
end
$$;

create function touchline_people_private.search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := btrim(p_query); result jsonb;
begin
  perform touchline_people_private.assert_enabled();
  if q is null or char_length(q) not between 2 and 80 or q ~ '[[:cntrl:]@]' then
    raise exception 'PEOPLE_INVALID_QUERY' using errcode = '22023';
  end if;
  -- UUID lookup is exact. Names use a literal prefix, not user-supplied SQL/wildcards.
  -- Keep ID and name paths separate so the unique ID/prefix indexes remain useful.
  if q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select coalesce(jsonb_agg(jsonb_build_object('publicId', p.public_id, 'displayName', p.display_name)), '[]'::jsonb)
      into result from touchline_people_private.profiles p where p.published and p.public_id = q::uuid;
    return result;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('publicId', r.public_id, 'displayName', r.display_name)
    order by lower(r.display_name), r.public_id), '[]'::jsonb) into result from (
    select p.public_id, p.display_name from touchline_people_private.profiles p
    where p.published and lower(p.display_name) like replace(replace(replace(lower(q), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
    order by lower(p.display_name), p.public_id limit 20
  ) r;
  return result;
end $$;

create function touchline_people_private.own_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := touchline_people_private.actor(); result jsonb;
begin
  perform touchline_people_private.assert_enabled();
  if actor_id is null then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object('publicId', p.public_id, 'displayName', p.display_name, 'published', p.published,
    'followerCount', (select count(*) from touchline_people_private.follows f where f.target_id = p.public_id))
    into result from touchline_people_private.profiles p where p.account_id = actor_id;
  return result;
end $$;

create function touchline_people_private.save_profile(p_display_name text, p_published boolean) returns jsonb
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
    on conflict (account_id) do update set display_name = excluded.display_name,
      published = excluded.published, updated_at = now();
  -- public_id and created_at never change on rename, opt-out or repeated saves.
  return touchline_people_private.own_profile();
end $$;

create function touchline_people_private.set_follow(p_public_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := touchline_people_private.actor(); target_account uuid;
begin
  perform touchline_people_private.assert_enabled();
  if v_actor_id is null then raise exception 'PEOPLE_FORBIDDEN' using errcode = '42501'; end if;
  if p_active is null then raise exception 'PEOPLE_INVALID_FOLLOW' using errcode = '22023'; end if;
  -- Serialize desired-state writes and publication changes for this target.
  select p.account_id into target_account from touchline_people_private.profiles p
    where p.public_id = p_public_id and p.published for update;
  if target_account is null then raise exception 'PEOPLE_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_account = v_actor_id then raise exception 'PEOPLE_SELF_FOLLOW' using errcode = '22023'; end if;
  if p_active then
    insert into touchline_people_private.follows(actor_id, target_id) values(v_actor_id, p_public_id)
      on conflict do nothing;
  else
    delete from touchline_people_private.follows f where f.actor_id = v_actor_id and f.target_id = p_public_id;
  end if;
  return touchline_people_private.profile(p_public_id);
end $$;

-- Exposed functions cannot accept or return an account UUID. Actor identity is
-- obtained from the authenticated database request, including direct RPC calls.
create function public.touchline_people_search(p_query text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select touchline_people_private.search(p_query) $$;
create function public.touchline_people_profile(p_public_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select touchline_people_private.profile(p_public_id) $$;
create function public.touchline_people_own_profile() returns jsonb
language sql stable security invoker set search_path = '' as $$ select touchline_people_private.own_profile() $$;
create function public.touchline_people_save_profile(p_display_name text, p_published boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select touchline_people_private.save_profile(p_display_name, p_published) $$;
create function public.touchline_people_set_follow(p_public_id uuid, p_active boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select touchline_people_private.set_follow(p_public_id, p_active) $$;

revoke all on all functions in schema touchline_people_private from public, anon, authenticated, service_role;
revoke all on function public.touchline_people_search(text), public.touchline_people_profile(uuid),
  public.touchline_people_own_profile(), public.touchline_people_save_profile(text, boolean),
  public.touchline_people_set_follow(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function touchline_people_private.search(text), touchline_people_private.profile(uuid),
  public.touchline_people_search(text), public.touchline_people_profile(uuid) to anon, authenticated;
grant execute on function touchline_people_private.own_profile(), touchline_people_private.save_profile(text, boolean),
  touchline_people_private.set_follow(uuid, boolean), public.touchline_people_own_profile(),
  public.touchline_people_save_profile(text, boolean), public.touchline_people_set_follow(uuid, boolean) to authenticated;
