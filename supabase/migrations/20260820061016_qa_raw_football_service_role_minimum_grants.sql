-- QA-only follow-up for 20260820055004. The provider sync/read-model paths
-- require only DML. Remove inherited ALL privileges from service_role so the
-- raw source tables have one explicit least-privilege server grant.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'football_players',
    'football_clubs',
    'football_squad_members',
    'football_seasons'
  ]
  loop
    execute format('revoke all privileges on table public.%I from service_role', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
  end loop;
end;
$$;
