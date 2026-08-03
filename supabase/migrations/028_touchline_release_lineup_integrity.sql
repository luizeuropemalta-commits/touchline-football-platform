-- Keep the playable Arena state consistent with authoritative card contracts.
-- Ending a contract and removing its card from the saved XI happen in the same
-- database transaction, regardless of which server flow ended the contract.

create or replace function public.remove_ended_touchline_contract_from_lineup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.touchline_user_arena_state as arena_state
       set lineup = coalesce((
             select jsonb_agg(lineup_player.value order by lineup_player.ordinality)
               from jsonb_array_elements(arena_state.lineup) with ordinality as lineup_player(value, ordinality)
              where coalesce(
                nullif(lower(lineup_player.value #>> '{card,inventoryId}'), ''),
                nullif(lower(lineup_player.value ->> 'inventoryId'), ''),
                ''
              ) <> new.card_id::text
           ), '[]'::jsonb),
           updated_at = now()
     where arena_state.user_id = new.user_id
       and exists (
         select 1
           from jsonb_array_elements(arena_state.lineup) as candidate(value)
          where coalesce(
            nullif(lower(candidate.value #>> '{card,inventoryId}'), ''),
            nullif(lower(candidate.value ->> 'inventoryId'), ''),
            ''
          ) = new.card_id::text
       );
  end if;

  return new;
end;
$$;

revoke all on function public.remove_ended_touchline_contract_from_lineup() from public, anon, authenticated;
grant execute on function public.remove_ended_touchline_contract_from_lineup() to service_role;

drop trigger if exists touchline_contract_release_sanitizes_lineup
  on public.touchline_card_contracts;
create trigger touchline_contract_release_sanitizes_lineup
  after update of status on public.touchline_card_contracts
  for each row
  when (old.status = 'active' and new.status <> 'active')
  execute function public.remove_ended_touchline_contract_from_lineup();

comment on function public.remove_ended_touchline_contract_from_lineup() is
  'Atomically removes an ended contract card from the owning ClubOwner saved Arena lineup.';
