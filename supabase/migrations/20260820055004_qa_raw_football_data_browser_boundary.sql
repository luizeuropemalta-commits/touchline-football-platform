-- QA-only forward hardening. Apply this migration only to isolated QA project
-- xgxbwqxjssxxuihuwmgy. It contains no data mutation and its source rollback
-- is documented in docs/touchline-arena/audit/2026-08-20-QA-RAW-FOOTBALL-DATA-HARDENING-INVENTORY.md.
--
-- These normalized provider tables remain readable by server-side service_role
-- consumers only. Browser-facing product surfaces use explicit TouchLine DTOs
-- (for example /api/football-data/premier-squad) instead of raw PostgREST rows.

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'football_players',
    'football_clubs',
    'football_squad_members',
    'football_seasons'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);

    -- Remove every legacy browser policy, not only the policy names from the
    -- original migration. This keeps the result deterministic if QA was
    -- previously repaired manually.
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    end loop;

    execute format('revoke all privileges on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
  end loop;
end;
$$;

comment on table public.football_players is
  'Server-only normalized provider player source. Browser surfaces use approved TouchLine public DTOs.';
comment on table public.football_clubs is
  'Server-only normalized provider club source. Browser surfaces use approved TouchLine public DTOs.';
comment on table public.football_squad_members is
  'Server-only normalized provider squad source. Browser surfaces use approved TouchLine public DTOs.';
comment on table public.football_seasons is
  'Server-only normalized provider season source. Browser surfaces use approved TouchLine public DTOs.';
