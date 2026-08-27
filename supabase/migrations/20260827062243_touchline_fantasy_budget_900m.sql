-- Raise the one canonical TouchLine Fantasy Gameweek budget to EUR 900m.
--
-- This QA-only change updates the existing config and mutable snapshots. It
-- does not create a second budget, lineup, save or validation path.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

update public.touchline_fantasy_configs
set budget_eur = 900000000,
    updated_at = clock_timestamp()
where competition_key = 'england'
  and status = 'active';

update public.touchline_fantasy_user_gameweeks
set budget_eur_snapshot = 900000000,
    updated_at = clock_timestamp()
where state in ('DRAFT', 'CONFIRMED')
  and budget_eur_snapshot <> 900000000;

do $migration$
begin
  if not exists (
    select 1
    from public.touchline_fantasy_configs
    where competition_key = 'england'
      and status = 'active'
      and budget_eur = 900000000
  ) then
    raise exception 'TL_FANTASY_900M_BUDGET_CONFIG_MISSING';
  end if;
end
$migration$;

comment on column public.touchline_fantasy_configs.budget_eur is
  'Canonical TouchLine Fantasy Gameweek budget in euro; QA owner-authorized value is 900000000.';

commit;
