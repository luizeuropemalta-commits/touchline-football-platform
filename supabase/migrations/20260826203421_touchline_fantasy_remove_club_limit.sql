-- Let the customer choose any eligible combination of eleven players.
--
-- The legacy `max_players_per_club` columns remain at 11 for snapshot and
-- rollback compatibility, but the canonical save RPC no longer rejects a
-- lineup based on club concentration. This alters the existing Gameweek
-- transaction only; it does not create another lineup path.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.touchline_fantasy_configs
  alter column max_players_per_club set default 11;

update public.touchline_fantasy_configs
set max_players_per_club = 11,
    updated_at = clock_timestamp()
where competition_key = 'england'
  and status = 'active';

update public.touchline_fantasy_user_gameweeks
set max_players_per_club_snapshot = 11,
    updated_at = clock_timestamp()
where state in ('DRAFT', 'CONFIRMED')
  and max_players_per_club_snapshot <> 11;

do $migration$
declare
  v_signature regprocedure := 'public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure;
  v_definition text;
  v_patched text;
  v_club_guard constant text := 'if v_max_club > v_config.max_players_per_club then raise exception ''TL_FANTASY_CLUB_LIMIT_EXCEEDED''; end if;';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    v_club_guard,
    'null; -- Club selection is customer-owned; there is no per-club cap.'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CLUB_LIMIT_SOURCE_MISMATCH';
  end if;
  execute v_patched;
end
$migration$;

comment on column public.touchline_fantasy_configs.max_players_per_club is
  'Legacy compatibility value fixed at the XI size (11); no per-club lineup restriction is enforced.';

commit;
