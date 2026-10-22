-- Forward-only retirement of the superseded three-player real-club cap.
-- Preserve budgets, position/slot limits, ownership, revisions, grants and locks.
-- No account or football data is modified by this migration.
begin;
do $migration$
declare
  signature text;
  original text;
  revised text;
  marker text;
begin
  foreach signature in array array[
    'public.touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb)',
    'public.touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    if signature like '%commit_acquisition%' then
      marker := $guard$  if (select count(*) from jsonb_array_elements(p_next->'players') p
    where p->>'clubId'=v_player->>'clubId' and not p ? 'transferException')>3 then raise exception 'CLUB_TEAM_LIMIT'; end if;$guard$;
    else
      marker := $guard$  if exists(select 1 from jsonb_array_elements(v_collection.state->'players') p
    where not (p ? 'transferException') group by p->>'clubId' having count(*)>3) then
    raise exception 'CLUB_TEAM_LIMIT'; end if;$guard$;
    end if;
    if strpos(original, marker)=0 then raise exception 'CLUB_CAP_RETIREMENT_SOURCE_MISMATCH'; end if;
    revised := replace(original, marker, '  -- No quantity limit per real club; position, roster and budget guards remain.');
    revised := replace(revised, '  -- Full collection quota was validated above, including non-transferable exceptions.',
      '  -- Real-club quantity restrictions have been retired.');
    if strpos(revised, 'CLUB_TEAM_LIMIT')>0 then raise exception 'CLUB_CAP_RETIREMENT_INCOMPLETE'; end if;
    execute revised;
  end loop;
end;
$migration$;
commit;
