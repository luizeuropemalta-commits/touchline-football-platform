-- Local candidate only. HTTP authenticates the actor and validates the canonical
-- player before calling these service-only operations. No football/game facts
-- are modified. Reactions are account preferences, not scoring events.
begin;

create table public.touchline_player_social_reactions (
  player_id uuid not null references public.football_players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow', 'like')),
  created_at timestamptz not null default now(),
  primary key (player_id, user_id, kind)
);

create index touchline_player_social_reactions_user_idx
  on public.touchline_player_social_reactions (user_id);

alter table public.touchline_player_social_reactions enable row level security;
revoke all on public.touchline_player_social_reactions from public, anon, authenticated, service_role;
grant select, insert, delete on public.touchline_player_social_reactions to service_role;

create function public.touchline_player_social_summary(
  p_player_id uuid,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_player_id is null then
    raise exception using errcode = '22023', message = 'PLAYER_SOCIAL_PLAYER_REQUIRED';
  end if;
  return (
    select jsonb_build_object(
      'followerCount', count(*) filter (where kind = 'follow'),
      'likeCount', count(*) filter (where kind = 'like'),
      'following', coalesce(bool_or(kind = 'follow' and user_id = p_user_id), false),
      'liked', coalesce(bool_or(kind = 'like' and user_id = p_user_id), false)
    )
    from public.touchline_player_social_reactions
    where player_id = p_player_id
  );
end;
$$;

create function public.touchline_set_player_social_reaction(
  p_player_id uuid,
  p_user_id uuid,
  p_kind text,
  p_active boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_player_id is null or p_user_id is null or p_active is null
    or p_kind is null or p_kind not in ('follow', 'like') then
    raise exception using errcode = '22023', message = 'PLAYER_SOCIAL_INVALID_INPUT';
  end if;

  -- Serialize opposing desired states for the same actor/player/kind, even
  -- when no row exists yet. Hash collisions only serialize unrelated requests.
  perform pg_advisory_xact_lock(hashtextextended(
    'touchline-player-social:' || p_player_id::text || ':' || p_user_id::text || ':' || p_kind, 0
  ));
  if p_active then
    insert into public.touchline_player_social_reactions (player_id, user_id, kind)
      values (p_player_id, p_user_id, p_kind)
      on conflict (player_id, user_id, kind) do nothing;
  else
    delete from public.touchline_player_social_reactions
      where player_id = p_player_id and user_id = p_user_id and kind = p_kind;
  end if;
  return public.touchline_player_social_summary(p_player_id, p_user_id);
end;
$$;

revoke all on function public.touchline_player_social_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function public.touchline_set_player_social_reaction(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.touchline_player_social_summary(uuid, uuid) to service_role;
grant execute on function public.touchline_set_player_social_reaction(uuid, uuid, text, boolean) to service_role;

commit;
