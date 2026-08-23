-- TouchLine Development QA only. Production is explicitly out of scope.
-- Reject duplicate, blank, or non-string fixture IDs before any ranking snapshot can persist.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create or replace function public.touchline_ranking_fixture_id_set_is_valid(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  element_count integer;
  distinct_count integer;
begin
  if jsonb_typeof(candidate) is distinct from 'array'
     or jsonb_array_length(candidate) = 0 then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(candidate) as element(value)
    where jsonb_typeof(element.value) is distinct from 'string'
  ) or exists (
    select 1
    from jsonb_array_elements_text(candidate) as fixture(value)
    where btrim(fixture.value) = ''
  ) then
    return false;
  end if;

  select count(*), count(distinct fixture.value)
  into element_count, distinct_count
  from jsonb_array_elements_text(candidate) as fixture(value);

  return element_count = distinct_count;
end;
$$;

alter table public.touchline_card_ranking_snapshots
  drop constraint if exists touchline_card_ranking_fixture_ids_set_check,
  add constraint touchline_card_ranking_fixture_ids_set_check
    check (public.touchline_ranking_fixture_id_set_is_valid(fixture_ids)),
  drop constraint if exists touchline_card_ranking_expected_fixture_ids_set_check,
  add constraint touchline_card_ranking_expected_fixture_ids_set_check
    check (public.touchline_ranking_fixture_id_set_is_valid(expected_fixture_ids));

revoke all on function public.touchline_ranking_fixture_id_set_is_valid(jsonb)
  from public, anon, authenticated;
grant execute on function public.touchline_ranking_fixture_id_set_is_valid(jsonb)
  to service_role;

comment on function public.touchline_ranking_fixture_id_set_is_valid(jsonb) is
  'QA ranking publication invariant: fixture IDs are a non-empty duplicate-free string set.';

commit;
