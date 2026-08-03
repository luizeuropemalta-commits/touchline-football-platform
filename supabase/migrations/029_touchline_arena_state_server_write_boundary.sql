-- Make the Arena API the only authenticated write path for persisted lineups.
--
-- Migration 005 intentionally granted authenticated CRUD on every public table
-- (including future tables through ALTER DEFAULT PRIVILEGES). Migration 024
-- therefore inherited table-level write privileges and also added a FOR ALL
-- owner policy. RLS alone was not an API boundary: a signed-in browser could
-- write its row directly and bypass the server's contract/roster validation.

alter table public.touchline_user_arena_state enable row level security;

-- Remove every existing RLS policy from this table before rebuilding the one
-- allowed client capability. This also closes mutation policies introduced by
-- deployment drift under names other than the historical policy below.
drop policy if exists "Users manage own arena state"
  on public.touchline_user_arena_state;

do $$
declare
  arena_policy record;
begin
  for arena_policy in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'touchline_user_arena_state'
  loop
    execute format(
      'drop policy if exists %I on public.touchline_user_arena_state',
      arena_policy.policyname
    );
  end loop;
end;
$$;

-- Explicitly override the broad grants from migration 005. ALTER DEFAULT
-- PRIVILEGES does not re-grant privileges on an existing table after this
-- revoke, so authenticated clients remain read-only here.
revoke all privileges on table public.touchline_user_arena_state
  from public, anon, authenticated;
grant select on table public.touchline_user_arena_state to authenticated;

create policy "Users read own arena state"
  on public.touchline_user_arena_state
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Server routes use the Supabase service role. Keep its explicit CRUD access
-- independent from historical/default grants so API persistence and cleanup
-- remain operational after the client-write lockdown.
grant select, insert, update, delete
  on table public.touchline_user_arena_state
  to service_role;

comment on table public.touchline_user_arena_state is
  'Authoritative Arena persistence. Authenticated clients may read only their own row; all writes must pass through the server API and service role validation.';
