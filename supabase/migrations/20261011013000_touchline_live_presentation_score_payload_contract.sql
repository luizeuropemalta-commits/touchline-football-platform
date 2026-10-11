-- Keep the immutable Live pointer consumable by the score/event reader. The
-- publisher owns this contract; an invalid source must never become a valid
-- immutable revision which consumers subsequently fail closed.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  v_definition text;
  v_patched text;
  v_remote_declarations text :=
    '  v_player_fixture_ids text[] := ''{}'';' || chr(10)
    || '  v_coach_id text;' || chr(10)
    || '  v_coach_fixture_ids text[] := ''{}'';';
  v_jsonb_declarations text :=
    '  v_player_fixture_ids jsonb := ''[]''::jsonb;' || chr(10)
    || '  v_coach_id text;' || chr(10)
    || '  v_coach_fixture_ids jsonb := ''[]''::jsonb;';
  v_remote_payload text :=
    '    ''playerRankingFixtureIds'', to_jsonb(coalesce(v_player_fixture_ids, ''{}'')),' || chr(10)
    || '    ''coachRankingSnapshotId'', v_coach_id,' || chr(10)
    || '    ''coachRankingFixtureIds'', to_jsonb(coalesce(v_coach_fixture_ids, ''{}'')),';
  v_jsonb_payload text :=
    '    ''playerRankingFixtureIds'', coalesce(v_player_fixture_ids, ''[]''::jsonb),' || chr(10)
    || '    ''coachRankingSnapshotId'', v_coach_id,' || chr(10)
    || '    ''coachRankingFixtureIds'', coalesce(v_coach_fixture_ids, ''[]''::jsonb),';
  v_score_anchor text := '  v_live_score_digest := md5(v_live_score_payload::text);';
begin
  select pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure)
    into v_definition;

  -- QA's applied 04000 publisher has TEXT[] variables even though ranking
  -- fixture_ids are JSONB. Normalize only that captured shape; the candidate
  -- 04000 JSONB shape is accepted only when already exact. Any other source
  -- fails rather than silently patching an unknown publisher body.
  if position(v_remote_declarations in v_definition) > 0 then
    if position(v_jsonb_declarations in v_definition) > 0
      or length(v_definition) - length(replace(v_definition, v_remote_declarations, '')) <> length(v_remote_declarations)
      or length(v_definition) - length(replace(v_definition, '    v_player_fixture_ids := ''{}'';', '')) <> length('    v_player_fixture_ids := ''{}'';')
      or length(v_definition) - length(replace(v_definition, '    v_coach_fixture_ids := ''{}'';', '')) <> length('    v_coach_fixture_ids := ''{}'';')
      or length(v_definition) - length(replace(v_definition, v_remote_payload, '')) <> length(v_remote_payload) then
      raise exception 'TL_LIVE_PRESENTATION_FIXTURE_IDS_SOURCE_MISMATCH';
    end if;
    v_patched := replace(v_definition, v_remote_declarations, v_jsonb_declarations);
    v_patched := replace(v_patched, '    v_player_fixture_ids := ''{}'';', '    v_player_fixture_ids := ''[]''::jsonb;');
    v_patched := replace(v_patched, '    v_coach_fixture_ids := ''{}'';', '    v_coach_fixture_ids := ''[]''::jsonb;');
    v_patched := replace(v_patched, v_remote_payload, v_jsonb_payload);
    if position(v_jsonb_declarations in v_patched) = 0
      or position(v_jsonb_payload in v_patched) = 0
      or position(v_remote_declarations in v_patched) > 0
      or position(v_remote_payload in v_patched) > 0 then
      raise exception 'TL_LIVE_PRESENTATION_FIXTURE_IDS_NORMALIZATION_FAILED';
    end if;
    v_definition := v_patched;
  elsif position(v_jsonb_declarations in v_definition) > 0 then
    if length(v_definition) - length(replace(v_definition, v_jsonb_declarations, '')) <> length(v_jsonb_declarations)
      or length(v_definition) - length(replace(v_definition, '    v_player_fixture_ids := ''[]''::jsonb;', '')) <> length('    v_player_fixture_ids := ''[]''::jsonb;')
      or length(v_definition) - length(replace(v_definition, '    v_coach_fixture_ids := ''[]''::jsonb;', '')) <> length('    v_coach_fixture_ids := ''[]''::jsonb;')
      or length(v_definition) - length(replace(v_definition, v_jsonb_payload, '')) <> length(v_jsonb_payload) then
      raise exception 'TL_LIVE_PRESENTATION_FIXTURE_IDS_SOURCE_MISMATCH';
    end if;
  else
    raise exception 'TL_LIVE_PRESENTATION_FIXTURE_IDS_SOURCE_MISMATCH';
  end if;

  if length(v_definition) - length(replace(v_definition, v_score_anchor, '')) <> length(v_score_anchor) then
    raise exception 'TL_LIVE_PRESENTATION_SCORE_CONTRACT_SOURCE_MISMATCH';
  end if;
  v_patched := replace(
    v_definition,
    v_score_anchor,
    '  if jsonb_typeof(v_live_score_payload -> ''fetchedAt'') is distinct from ''string''' || chr(10)
    || '     or (v_live_score_payload ->> ''fetchedAt'') !~ ''^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?Z$''' || chr(10)
    || '     or jsonb_typeof(v_live_score_payload -> ''storedAt'') is distinct from ''number''' || chr(10)
    || '     or (case when jsonb_typeof(v_live_score_payload -> ''storedAt'') = ''number''' || chr(10)
    || '              then (v_live_score_payload ->> ''storedAt'')::numeric between 0 and 8640000000000000' || chr(10)
    || '              else false end) is not true' || chr(10)
    || '     or exists (' || chr(10)
    || '       select 1' || chr(10)
    || '       from jsonb_array_elements(v_live_score_payload -> ''fixtures'') as fixture(value)' || chr(10)
    || '       where jsonb_typeof(fixture.value) is distinct from ''object''' || chr(10)
    || '          or jsonb_typeof(fixture.value -> ''id'') is distinct from ''string''' || chr(10)
    || '          or (fixture.value ->> ''id'') = ''''' || chr(10)
    || '          or (fixture.value ->> ''provider'') is distinct from ''sportmonks''' || chr(10)
    || '          or jsonb_typeof(fixture.value -> ''providerId'') is distinct from ''string''' || chr(10)
    || '          or ((fixture.value ->> ''providerId'') ~ ''^[1-9][0-9]{0,19}$'') is not true' || chr(10)
    || '          or jsonb_typeof(fixture.value -> ''source'') is distinct from ''object''' || chr(10)
    || '          or (fixture.value -> ''source'' ->> ''provider'') is distinct from ''sportmonks''' || chr(10)
    || '          or jsonb_typeof(fixture.value -> ''source'' -> ''providerId'') is distinct from ''string''' || chr(10)
    || '          or (fixture.value -> ''source'' ->> ''providerId'') is distinct from (fixture.value ->> ''providerId'')' || chr(10)
    || '     ) then' || chr(10)
    || '    raise exception using errcode = ''P0001'', message = ''TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_CONTRACT_INVALID'';' || chr(10)
    || '  end if;' || chr(10)
    || '  begin' || chr(10)
    || '    perform (v_live_score_payload ->> ''fetchedAt'')::timestamptz;' || chr(10)
    || '  exception when others then' || chr(10)
    || '    raise exception using errcode = ''P0001'', message = ''TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_CONTRACT_INVALID'';' || chr(10)
    || '  end;' || chr(10)
    || '  v_live_score_digest := md5(v_live_score_payload::text);'
  );
  if v_patched = v_definition then
    raise exception 'TL_LIVE_PRESENTATION_SCORE_CONTRACT_SOURCE_MISMATCH';
  end if;
  execute v_patched;
end
$migration$;

comment on function public.touchline_live_presentation_publish_current() is
  'Service-role-only transaction. Publishes only a fresh sanitized score payload whose fixture identity/source shape is consumable by Live readers, with canonical fixtures and active V4 player/V2 coach ranking snapshots.';

commit;
