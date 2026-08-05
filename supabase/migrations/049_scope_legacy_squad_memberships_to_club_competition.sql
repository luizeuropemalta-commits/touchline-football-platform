-- Competition-scoped public rosters must not inherit legacy membership rows
-- that predate the competition_id write boundary. This is a repair-only,
-- additive migration: it changes no player, club, status, history or RLS data.
-- A row is updated only when its club already identifies one canonical
-- competition and the membership itself is still unscoped.

update public.football_squad_members as membership
   set competition_id = club.competition_id,
       updated_at = now()
  from public.football_clubs as club
 where membership.provider = 'sportmonks'
   and membership.status = 'active'
   and membership.club_id = club.id
   and membership.competition_id is null
   and club.competition_id is not null;

-- Matches the server-owned public roster read path without changing existing
-- access control. Re-running this migration is safe.
create index if not exists football_squad_members_active_competition_club_idx
  on public.football_squad_members (competition_id, club_id, source_updated_at desc)
  where provider = 'sportmonks' and status = 'active';
