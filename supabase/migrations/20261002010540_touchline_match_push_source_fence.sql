-- Transaction owned by migration runner. This extends the existing source
-- fence to confirmation observations and timestamp-only feed refreshes.
-- No outbound work, consent changes or notification admission occurs here.
lock table public.football_fantasy_fixture_feeds,
  public.touchline_social_confirmed_event_observations in share row exclusive mode nowait;

create function public.touchline_match_push_track_source_evidence()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_keys text[] := array[]::text[];
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_table_schema <> 'public' then raise exception 'PUSH_SOURCE_TRIGGER_TARGET'; end if;
  if tg_table_name = 'football_fantasy_fixture_feeds' then
    -- Existing 039 triggers fence semantic/identity changes. Cover only the
    -- remaining freshness mutation without invalidating lineup drafts.
    if v_old -> 'last_synced_at' is not distinct from v_new -> 'last_synced_at'
      or jsonb_build_array(v_old->'provider', v_old->'provider_fixture_id', v_old->'fixture_payload',
        v_old->'lineups_payload', v_old->'formations_payload', v_old->'sidelined_payload', v_old->'events_payload')
        is distinct from jsonb_build_array(v_new->'provider', v_new->'provider_fixture_id', v_new->'fixture_payload',
        v_new->'lineups_payload', v_new->'formations_payload', v_new->'sidelined_payload', v_new->'events_payload') then return new; end if;
    if v_new ->> 'provider' <> 'sportmonks' then return new; end if;
    v_keys := array['fixture-provider:' || (v_new ->> 'provider_fixture_id')];
  elsif tg_table_name = 'touchline_social_confirmed_event_observations' then
    if v_old is not distinct from v_new then return new; end if;
    foreach v_row in array array[v_old, v_new] loop
      if v_row is not null then
        v_keys := v_keys || array['fixture-provider:' || (v_row ->> 'fixture_provider_id'),
          'fixture-event:' || (v_row ->> 'event_provider_id')];
      end if;
    end loop;
  else raise exception 'PUSH_SOURCE_TRIGGER_TARGET'; end if;
  if exists(select 1 from unnest(v_keys) k where k is null
    or k !~ '^(fixture-provider|fixture-event):[1-9][0-9]{0,19}$') then
    raise exception 'PUSH_SOURCE_TRIGGER_IDENTITY';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  update public.touchline_social_source_clock set revision = revision + 1,
    updated_at = clock_timestamp() where singleton = true;
  if not found then raise exception 'TL_SOCIAL_SOURCE_CLOCK_UNAVAILABLE'; end if;
  insert into public.touchline_social_source_revisions(source_key, revision, last_reason_code, updated_at)
    select distinct k, 1, 'MATCH_PUSH_SOURCE_EVIDENCE_CHANGED', clock_timestamp() from unnest(v_keys) k
    on conflict(source_key) do update set revision = public.touchline_social_source_revisions.revision + 1,
      last_reason_code = excluded.last_reason_code, updated_at = excluded.updated_at;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
-- Internal trigger maintenance needs clock writes not granted to API roles.
-- It is not an RPC and cannot be called directly by any API role.
revoke all on function public.touchline_match_push_track_source_evidence()
  from public, anon, authenticated, service_role;
create trigger touchline_match_push_observation_revision
  after insert or update or delete on public.touchline_social_confirmed_event_observations
  for each row execute function public.touchline_match_push_track_source_evidence();
create trigger touchline_match_push_feed_freshness_revision
  after update of last_synced_at on public.football_fantasy_fixture_feeds
  for each row execute function public.touchline_match_push_track_source_evidence();
