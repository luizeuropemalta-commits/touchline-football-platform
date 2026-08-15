-- Harden legacy SECURITY DEFINER search functions. PostgreSQL grants EXECUTE
-- to PUBLIC for new functions unless it is explicitly revoked. These search
-- surfaces are authenticated product tools, not anonymous APIs.

revoke all on function public.search_global_player_profiles(text, integer)
  from public, anon, authenticated;

revoke all on function public.search_global_football_links(text, text, integer)
  from public, anon, authenticated;

revoke all on function public.search_transfermarkt_entities(text, text, integer)
  from public, anon, authenticated;

grant execute on function public.search_global_player_profiles(text, integer)
  to authenticated, service_role;

grant execute on function public.search_global_football_links(text, text, integer)
  to authenticated, service_role;

grant execute on function public.search_transfermarkt_entities(text, text, integer)
  to authenticated, service_role;

comment on function public.search_global_player_profiles(text, integer) is
  'Authenticated search surface. Anonymous/PUBLIC execution is intentionally revoked.';

comment on function public.search_global_football_links(text, text, integer) is
  'Authenticated search surface. Anonymous/PUBLIC execution is intentionally revoked.';

comment on function public.search_transfermarkt_entities(text, text, integer) is
  'Authenticated search surface. Anonymous/PUBLIC execution is intentionally revoked.';
