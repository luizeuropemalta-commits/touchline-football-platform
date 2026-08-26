-- QA-only rollback for 20260826203118_touchline_fantasy_remove_club_limit.sql.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $rollback$
declare
  v_signature regprocedure := 'public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure;
  v_definition text;
  v_patched text;
  v_unrestricted_guard constant text := 'null; -- Club selection is customer-owned; there is no per-club cap.';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    v_unrestricted_guard,
    'if v_max_club > v_config.max_players_per_club then raise exception ''TL_FANTASY_CLUB_LIMIT_EXCEEDED''; end if;'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CLUB_LIMIT_ROLLBACK_SOURCE_MISMATCH';
  end if;
  execute v_patched;
end
$rollback$;

update public.touchline_fantasy_configs
set max_players_per_club = 3,
    updated_at = clock_timestamp()
where competition_key = 'england'
  and status = 'active';

update public.touchline_fantasy_user_gameweeks
set max_players_per_club_snapshot = 3,
    updated_at = clock_timestamp()
where state in ('DRAFT', 'CONFIRMED')
  and max_players_per_club_snapshot <> 3;

alter table public.touchline_fantasy_configs
  alter column max_players_per_club set default 3;

comment on column public.touchline_fantasy_configs.max_players_per_club is null;

commit;
