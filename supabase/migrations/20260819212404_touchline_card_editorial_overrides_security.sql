-- The pre-existing override store is authoritative editorial input.  Browser
-- roles must never create, approve, or edit its rows directly: all writes go
-- through the owner-gated server command and service_role-only RPC.
begin;
set local lock_timeout = '5s';

alter table public.touchline_card_editorial_overrides enable row level security;
alter table public.touchline_card_editorial_overrides force row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname from pg_policies
     where schemaname = 'public'
       and tablename = 'touchline_card_editorial_overrides'
  loop
    execute format(
      'drop policy if exists %I on public.touchline_card_editorial_overrides',
      policy_record.policyname
    );
  end loop;
end;
$$;

revoke all on public.touchline_card_editorial_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_card_editorial_overrides to service_role;

comment on table public.touchline_card_editorial_overrides is
  'Protected Card Engine override store. Browser roles have no grants or policies; service_role-only mutation is owner-gated in the application.';
commit;
