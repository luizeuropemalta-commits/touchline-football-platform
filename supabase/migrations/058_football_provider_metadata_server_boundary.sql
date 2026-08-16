-- Provider identity mappings and synchronization records are operational
-- metadata.  `football_data_sync_runs.source_payload` may contain raw provider
-- responses, so neither table may be queried through a browser Supabase role.
-- Sanitized information is available only through authorized server routes.

alter table public.football_provider_mappings enable row level security;
alter table public.football_data_sync_runs enable row level security;

drop policy if exists "authenticated users can read football provider mappings"
  on public.football_provider_mappings;
drop policy if exists "authenticated users can read football sync runs"
  on public.football_data_sync_runs;

revoke all privileges on table public.football_provider_mappings
  from public, anon, authenticated;
revoke all privileges on table public.football_data_sync_runs
  from public, anon, authenticated;

grant select, insert, update, delete on table public.football_provider_mappings
  to service_role;
grant select, insert, update, delete on table public.football_data_sync_runs
  to service_role;

comment on table public.football_provider_mappings is
  'Server-only provider identity mapping. Browser reads must use an authorized sanitized application route.';
comment on table public.football_data_sync_runs is
  'Server-only synchronization audit log. Browser reads must use an authorized sanitized application route.';
