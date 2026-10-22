-- QA fixture only. Never promote this file into Production migrations.
begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
create table public.touchline_qa_club_market_control (
  season_id uuid primary key,
  enabled boolean not null default false,
  reason text not null,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.touchline_qa_club_market_control enable row level security;
alter table public.touchline_qa_club_market_control force row level security;
revoke all on public.touchline_qa_club_market_control from public, anon, authenticated, service_role;

create function public.touchline_qa_club_market_is_open(p_season_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.touchline_qa_club_market_control
    where season_id = p_season_id and enabled);
$$;
revoke all on function public.touchline_qa_club_market_is_open(uuid) from public, anon, authenticated;
grant execute on function public.touchline_qa_club_market_is_open(uuid) to service_role;

create or replace function public.touchline_club_market_is_open(p_season_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select public.touchline_qa_club_market_is_open(p_season_id)
    or exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p
      where p.season_id=p_season_id and p.state='MARKET_OPEN');
$$;
revoke all on function public.touchline_club_market_is_open(uuid) from public, anon, authenticated;
grant execute on function public.touchline_club_market_is_open(uuid) to service_role;

create or replace function public.touchline_club_lock_open_round(p_season_id uuid)
returns void language plpgsql volatile security definer set search_path = '' set lock_timeout = '5s' as $$
begin
  -- Closing the test switch waits for in-flight collection transactions.
  perform season_id from public.touchline_qa_club_market_control where season_id=p_season_id for share;
  if public.touchline_qa_club_market_is_open(p_season_id) then
    perform g.id from public.touchline_fantasy_gameweeks g
      where g.season_id=p_season_id order by g.gameweek_number for update of g;
  else
    perform g.id from public.touchline_fantasy_gameweeks g
      join public.touchline_fantasy_market_window_projection(clock_timestamp()) p on p.round_id=g.round_id
      where g.season_id=p_season_id and p.state='MARKET_OPEN'
      order by g.gameweek_number for update of g;
  end if;
end;
$$;
revoke all on function public.touchline_club_lock_open_round(uuid) from public, anon, authenticated;
grant execute on function public.touchline_club_lock_open_round(uuid) to service_role;

-- Install closed. Activation is a separate, verified QA-only action.
insert into public.touchline_qa_club_market_control(season_id,enabled,reason)
select season_id,false,'Owner-authorized development tests; close before release'
from public.touchline_fantasy_configs where competition_key='england' and status='active';
commit;
