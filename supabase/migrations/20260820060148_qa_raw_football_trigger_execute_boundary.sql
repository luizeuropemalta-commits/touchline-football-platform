-- QA-only follow-up for 20260820055004. Trigger functions are not RPC
-- contracts. Revoke inherited browser-role EXECUTE so a role audit has no
-- public function surface associated with raw football source tables.

revoke all on function public.football_clubs_search_update()
  from public, anon, authenticated;
revoke all on function public.football_players_search_update()
  from public, anon, authenticated;

grant execute on function public.football_clubs_search_update() to service_role;
grant execute on function public.football_players_search_update() to service_role;
