begin;
set local lock_timeout='5s';

-- Hosted Supabase default privileges may grant service_role ALL on new tables.
-- A selective GRANT does not remove those inherited creation-time privileges.
-- Orders can advance state, but cannot be deleted. Event receipts are append-only.
-- Preserve owner privileges, RLS, customer revocations and existing RPC grants.
revoke all on table public.touchline_club_season_test_orders from service_role;
grant select,insert,update on table public.touchline_club_season_test_orders to service_role;

revoke all on table public.touchline_club_season_test_events from service_role;
grant select,insert on table public.touchline_club_season_test_events to service_role;

commit;
