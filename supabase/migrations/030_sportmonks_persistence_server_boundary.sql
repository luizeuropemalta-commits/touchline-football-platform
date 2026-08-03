-- Keep persisted provider feeds behind sanitized server routes. Migration 015
-- allowed every authenticated browser to select the underlying JSON payloads;
-- that bypassed the application's response sanitizers and licensing boundary.

alter table public.football_fantasy_fixture_feeds enable row level security;
alter table public.football_provider_capabilities enable row level security;

-- Remove all historical or drifted browser policies, not only the two names
-- introduced by migration 015.
do $$
declare
  provider_policy record;
begin
  for provider_policy in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'football_fantasy_fixture_feeds',
         'football_provider_capabilities'
       )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      provider_policy.policyname,
      provider_policy.schemaname,
      provider_policy.tablename
    );
  end loop;
end;
$$;

-- Broad default privileges from older migrations must not make the raw tables
-- queryable through Supabase REST by a browser role.
revoke all privileges
  on table public.football_fantasy_fixture_feeds
  from public, anon, authenticated;
revoke all privileges
  on table public.football_provider_capabilities
  from public, anon, authenticated;

-- Server persistence and sanitized read models use the service role, which
-- bypasses RLS. Keep its required privileges explicit.
grant select, insert, update, delete
  on table public.football_fantasy_fixture_feeds
  to service_role;
grant select, insert, update, delete
  on table public.football_provider_capabilities
  to service_role;

comment on table public.football_fantasy_fixture_feeds is
  'Server-only normalized fantasy feed persistence. Browser reads must use a sanitized application route.';
comment on table public.football_provider_capabilities is
  'Server-only provider capability persistence. Browser reads must use an authorized sanitized application route.';
