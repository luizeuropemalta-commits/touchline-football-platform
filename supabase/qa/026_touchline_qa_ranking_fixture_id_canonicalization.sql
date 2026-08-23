-- TouchLine Development QA only. Production is explicitly out of scope.
-- Strengthen fixture-set integrity so whitespace variants cannot represent one canonical ID twice.

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
    where fixture.value = ''
       or fixture.value is distinct from btrim(fixture.value)
  ) then
    return false;
  end if;

  select count(*), count(distinct btrim(fixture.value))
  into element_count, distinct_count
  from jsonb_array_elements_text(candidate) as fixture(value);

  return element_count = distinct_count;
end;
$$;

revoke all on function public.touchline_ranking_fixture_id_set_is_valid(jsonb)
  from public, anon, authenticated;
grant execute on function public.touchline_ranking_fixture_id_set_is_valid(jsonb)
  to service_role;

comment on function public.touchline_ranking_fixture_id_set_is_valid(jsonb) is
  'QA ranking publication invariant: fixture IDs are canonical trimmed strings in a non-empty duplicate-free set.';

commit;
