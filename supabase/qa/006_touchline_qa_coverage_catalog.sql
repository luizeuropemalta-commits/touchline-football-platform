-- QA-only representative coverage catalogue. Never add this file to supabase/migrations.
-- It stores test intent only; it never creates or mutates football, card, coach, user or commercial data.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_coverage_catalog (
  fixture_version text not null,
  coverage_group text not null check (coverage_group in ('card', 'coach', 'quick_sub', 'ui_state')),
  coverage_key text not null,
  evidence_route text,
  evidence_test text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (fixture_version, coverage_group, coverage_key)
);

alter table public.touchline_qa_coverage_catalog enable row level security;
revoke all on public.touchline_qa_coverage_catalog from public, anon, authenticated;
grant select, insert, delete on public.touchline_qa_coverage_catalog to service_role;

create or replace function public.touchline_apply_qa_coverage_catalog(
  p_project_ref text,
  p_fixture_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows constant jsonb := jsonb_build_array(
    jsonb_build_object('group','card','key','published','route','/visual-qa/card-value-states'),
    jsonb_build_object('group','card','key','review','route','/visual-qa/card-value-states'),
    jsonb_build_object('group','card','key','unavailable','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','active-contract','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','neutral','route','/visual-qa/card-value-states'),
    jsonb_build_object('group','card','key','long-name','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','short-name','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','missing-image-fallback','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','full','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','compact','route','/visual-qa/representative-package'),
    jsonb_build_object('group','card','key','zoom','route','/visual-qa/representative-package'),
    jsonb_build_object('group','coach','key','synthetic-presentation','route','/visual-qa/representative-package'),
    jsonb_build_object('group','coach','key','canonical-persistence','route','/market-transfer'),
    jsonb_build_object('group','quick_sub','key','exact-11-9','route','/arena?panel=bench'),
    jsonb_build_object('group','quick_sub','key','outgoing-disabled','route','/arena?panel=bench'),
    jsonb_build_object('group','quick_sub','key','no-reentry','route','/arena?panel=bench'),
    jsonb_build_object('group','quick_sub','key','refresh-replay-idempotency','route','/arena?panel=bench'),
    jsonb_build_object('group','ui_state','key','loading','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','empty','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','success','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','error','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','unavailable','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','pending','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','stale','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','unauthorized','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','forbidden','route','/visual-qa/representative-package'),
    jsonb_build_object('group','ui_state','key','not-found','route','/visual-qa/representative-package')
  );
  v_row jsonb;
  v_count integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_fixture_version is distinct from '2026-08-15-representative-v1' then
    raise exception using errcode = 'P0001', message = 'TL_QA_COVERAGE_VERSION_FORBIDDEN';
  end if;

  for v_row in select value from jsonb_array_elements(v_rows)
  loop
    insert into public.touchline_qa_coverage_catalog(
      fixture_version, coverage_group, coverage_key, evidence_route, evidence_test, metadata
    ) values (
      p_fixture_version,
      v_row->>'group',
      v_row->>'key',
      v_row->>'route',
      'tests/touchline-representative-qa-visual-fixture.test.mts',
      jsonb_build_object(
        'qaFixture', true,
        'officialFootballFact', false,
        'productionAllowed', false
      )
    ) on conflict (fixture_version, coverage_group, coverage_key) do nothing;
  end loop;

  select count(*) into v_count
  from public.touchline_qa_coverage_catalog
  where fixture_version = p_fixture_version;
  if v_count <> 27 then
    raise exception using errcode = 'P0001', message = 'TL_QA_COVERAGE_EXACT_27_REQUIRED';
  end if;

  return jsonb_build_object(
    'fixtureVersion', p_fixture_version,
    'coverageRows', v_count,
    'productionAllowed', false,
    'idempotent', true
  );
end;
$$;

create or replace function public.touchline_rollback_qa_coverage_catalog(
  p_project_ref text,
  p_fixture_version text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  if p_fixture_version is distinct from '2026-08-15-representative-v1' then
    raise exception using errcode = 'P0001', message = 'TL_QA_COVERAGE_VERSION_FORBIDDEN';
  end if;
  delete from public.touchline_qa_coverage_catalog where fixture_version = p_fixture_version;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.touchline_apply_qa_coverage_catalog(text,text) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_coverage_catalog(text,text) from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_coverage_catalog(text,text) to service_role;
grant execute on function public.touchline_rollback_qa_coverage_catalog(text,text) to service_role;

commit;
