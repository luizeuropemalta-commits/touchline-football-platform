-- QA-only rollback for 20260827062243_touchline_fantasy_budget_900m.sql.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

update public.touchline_fantasy_configs
set budget_eur = 350000000,
    updated_at = clock_timestamp()
where competition_key = 'england'
  and status = 'active'
  and budget_eur = 900000000;

update public.touchline_fantasy_user_gameweeks
set budget_eur_snapshot = 350000000,
    updated_at = clock_timestamp()
where state in ('DRAFT', 'CONFIRMED')
  and budget_eur_snapshot = 900000000;

comment on column public.touchline_fantasy_configs.budget_eur is null;

commit;
