-- Enforce the TouchLine Fantasy deadline against wall-clock time.
--
-- `now()` is intentionally transaction-stable in PostgreSQL. A lineup write
-- that waits on the per-user advisory lock could therefore cross the deadline
-- while still observing the transaction start time. Patch only the three
-- deadline comparisons in the existing Gameweek V1 RPCs and fail closed if
-- their canonical definitions no longer match the expected source.

begin;
set local lock_timeout = '5s';

do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched text;
begin
  v_signature := 'public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    'now() >= v_gameweek.locks_at',
    'clock_timestamp() >= v_gameweek.locks_at'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_SAVE_DEADLINE_SOURCE_MISMATCH';
  end if;
  execute v_patched;

  v_signature := 'public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    'now() < v_gameweek.locks_at',
    'clock_timestamp() < v_gameweek.locks_at'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LOCK_DEADLINE_SOURCE_MISMATCH';
  end if;
  execute v_patched;

  v_signature := 'public.touchline_fantasy_reconcile_lineup_alerts(uuid)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    'now() < gameweek.locks_at',
    'clock_timestamp() < gameweek.locks_at'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_ALERT_DEADLINE_SOURCE_MISMATCH';
  end if;
  execute v_patched;
end
$migration$;

commit;
