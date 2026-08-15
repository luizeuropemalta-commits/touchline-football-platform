-- QA-only fixture tracking. Do not add this file to supabase/migrations.
-- Every caller must also select the exact QA project externally.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_fixture_runs (
  id uuid primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  fixture_version text not null,
  source_fingerprint_sha256 char(64) not null check (source_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  package_fingerprint_sha256 char(64) not null check (package_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('planned', 'applying', 'applied', 'rolling_back', 'rolled_back', 'failed')),
  expected_counts jsonb not null default '{}'::jsonb,
  observed_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  unique (project_ref, fixture_version, source_fingerprint_sha256)
);

create table if not exists public.touchline_qa_fixture_objects (
  run_id uuid not null references public.touchline_qa_fixture_runs(id) on delete restrict,
  object_kind text not null check (object_kind in ('club', 'player', 'membership', 'inventory', 'publication_batch')),
  object_id uuid not null,
  ownership text not null check (ownership in ('created_by_run', 'preserved_canonical')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (run_id, object_kind, object_id)
);

alter table public.touchline_qa_fixture_runs enable row level security;
alter table public.touchline_qa_fixture_objects enable row level security;
revoke all on public.touchline_qa_fixture_runs from public, anon, authenticated;
revoke all on public.touchline_qa_fixture_objects from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_qa_fixture_runs to service_role;
grant select, insert, update, delete on public.touchline_qa_fixture_objects to service_role;

create or replace function public.touchline_assert_qa_fixture_target(p_project_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' then
    raise exception using errcode = 'P0001', message = 'TL_QA_FIXTURE_TARGET_FORBIDDEN';
  end if;
end;
$$;

revoke all on function public.touchline_assert_qa_fixture_target(text) from public, anon, authenticated;
grant execute on function public.touchline_assert_qa_fixture_target(text) to service_role;

commit;
