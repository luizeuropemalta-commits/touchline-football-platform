-- A player may retain historical squad membership rows after a transfer, but
-- only the membership matching football_players.current_club_id is active.
-- This preserves history while preventing duplicate cards, points and links.

update public.football_squad_members as membership
   set status = 'inactive',
       updated_at = now()
  from public.football_players as player
 where membership.player_id = player.id
   and membership.provider = 'sportmonks'
   and player.provider = 'sportmonks'
   and membership.status = 'active'
   and player.current_club_id is not null
   and membership.club_id <> player.current_club_id
   and membership.source_updated_at <= player.source_updated_at;

create index if not exists football_squad_members_active_player_idx
  on public.football_squad_members(player_id, source_updated_at desc)
  where provider = 'sportmonks' and status = 'active';
