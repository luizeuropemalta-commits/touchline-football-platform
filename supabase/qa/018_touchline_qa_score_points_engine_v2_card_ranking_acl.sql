begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.touchline_card_ranking_snapshots enable row level security;
alter table public.touchline_card_ranking_snapshots force row level security;
alter table public.touchline_card_ranking_active_snapshots enable row level security;
alter table public.touchline_card_ranking_active_snapshots force row level security;

revoke all privileges on table public.touchline_card_ranking_snapshots
  from public, anon, authenticated;
revoke all privileges on table public.touchline_card_ranking_active_snapshots
  from public, anon, authenticated;

grant select, insert on table public.touchline_card_ranking_snapshots
  to service_role;
grant select, insert, update on table public.touchline_card_ranking_active_snapshots
  to service_role;

comment on table public.touchline_card_ranking_snapshots is
  'Server-only immutable audited card ranking snapshots. Browser clients consume allowlisted read models.';
comment on table public.touchline_card_ranking_active_snapshots is
  'Server-only active card ranking pointers. Publication is restricted to the audited service path.';

commit;
