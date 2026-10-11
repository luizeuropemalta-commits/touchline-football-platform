-- Bind Quick Sub to the immutable Fantasy XI locked for this exact gameweek.
-- Arena state is mutable and is not an authority once the matchweek locks.

begin;
set local lock_timeout = '5s';

create or replace function public.touchline_arena_quick_substitution_saved_xi_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved_ids text[];
  v_requested_ids text[];
  v_saved_count integer;
  v_user_gameweek_id uuid;
begin
  select user_gameweek.id
    into v_user_gameweek_id
    from public.touchline_fantasy_user_gameweeks as user_gameweek
   where user_gameweek.user_id = new.user_id
     and user_gameweek.gameweek_id = new.gameweek_id
     and user_gameweek.state = 'LOCKED'
     and user_gameweek.locked_at is not null;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_LOCKED_XI_UNAVAILABLE';
  end if;

  select array_agg(cards.inventory_id order by cards.inventory_id), count(distinct cards.inventory_id)::integer
    into v_saved_ids, v_saved_count
    from (
      select lower(inventory.id::text) as inventory_id
        from public.touchline_fantasy_locked_selections as locked
        join public.touchline_card_inventory as inventory
          on inventory.player_id = locked.player_id
        join public.touchline_card_contracts as contract
          on contract.card_id = inventory.id
         and contract.user_id = new.user_id
         and contract.status = 'active'
       where locked.user_gameweek_id = v_user_gameweek_id
    ) as cards;
  if coalesce(v_saved_count, 0) <> 11 then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_LOCKED_XI_INVALID';
  end if;

  select array_agg(lower(requested.inventory_id::text) order by lower(requested.inventory_id::text))
    into v_requested_ids
    from unnest(new.starting_inventory_ids) as requested(inventory_id);

  if coalesce(v_saved_count, 0) <> 11 or v_saved_ids is distinct from v_requested_ids then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_LOCKED_XI_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.touchline_arena_quick_substitution_saved_xi_guard() from public, anon, authenticated, service_role;

create trigger touchline_arena_quick_substitution_saved_xi_guard
  before insert on public.touchline_arena_quick_substitution_sessions
  for each row execute function public.touchline_arena_quick_substitution_saved_xi_guard();

comment on function public.touchline_arena_quick_substitution_saved_xi_guard() is
  'Rejects session initialization unless its XI exactly matches the authenticated owner’s 11-card Fantasy XI locked for this exact gameweek; mutable Arena state is not an authority.';

commit;
