-- Additive, service-only identity recovery. Never infer current club or value.
BEGIN;
CREATE OR REPLACE FUNCTION public.touchline_claim_player_identity_recovery(
  p_player_id text, p_fixture_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_run uuid;
BEGIN
  IF p_player_id IS NULL OR p_player_id !~ '^[1-9][0-9]{0,19}$' THEN RAISE EXCEPTION 'Invalid provider identity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('touchline-player-recovery:' || p_player_id, 0));
  IF EXISTS (SELECT 1 FROM football_players WHERE provider='sportmonks' AND provider_player_id=p_player_id) THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM football_fixtures f JOIN football_fantasy_fixture_feeds feed
      ON feed.provider=f.provider AND feed.provider_fixture_id=f.provider_fixture_id
    CROSS JOIN LATERAL jsonb_array_elements(feed.lineups_payload) member
    WHERE f.id=p_fixture_id AND f.provider='sportmonks'
      AND member->>'provider'='sportmonks' AND member->>'fixtureId'=f.provider_fixture_id
      AND member->>'playerId'=p_player_id
      AND member->>'teamId' IN (
        SELECT provider_team_id FROM football_clubs WHERE id IN(f.home_club_id,f.away_club_id)
      )
  ) THEN RAISE EXCEPTION 'Persisted lineup identity required'; END IF;
  IF EXISTS (SELECT 1 FROM football_data_sync_runs WHERE provider='sportmonks' AND sync_type='player'
    AND source_payload->>'purpose'='missing-lineup-identity'
    AND source_payload->>'providerPlayerId'=p_player_id
    AND started_at > now()-interval '15 minutes') THEN RETURN NULL; END IF;
  -- A crashed worker must not leave an orphaned running operation forever.
  UPDATE football_data_sync_runs SET status='error',completed_at=now(),
    error_message='identity-recovery-lease-expired'
    WHERE provider='sportmonks' AND sync_type='player' AND status='running'
      AND source_payload->>'purpose'='missing-lineup-identity'
      AND source_payload->>'providerPlayerId'=p_player_id
      AND started_at <= now()-interval '15 minutes';
  INSERT INTO football_data_sync_runs(provider,sync_type,status,source_payload)
    VALUES('sportmonks','player','running',jsonb_build_object('purpose','missing-lineup-identity',
      'providerPlayerId',p_player_id,'fixtureId',p_fixture_id)) RETURNING id INTO v_run;
  RETURN v_run;
END $$;

CREATE OR REPLACE FUNCTION public.touchline_complete_player_identity_recovery(
  p_run_id uuid, p_identity jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_run football_data_sync_runs%ROWTYPE; v_player uuid; v_created boolean := false;
BEGIN
  SELECT * INTO v_run FROM football_data_sync_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.provider IS DISTINCT FROM 'sportmonks' OR v_run.sync_type IS DISTINCT FROM 'player'
    OR v_run.source_payload->>'purpose' IS DISTINCT FROM 'missing-lineup-identity'
    OR v_run.status IS DISTINCT FROM 'running' OR v_run.started_at < now()-interval '15 minutes'
    THEN RAISE EXCEPTION 'Active identity recovery required'; END IF;
  IF p_identity IS NULL OR jsonb_typeof(p_identity) IS DISTINCT FROM 'object'
    OR p_identity->>'provider' IS DISTINCT FROM 'sportmonks' OR p_identity->>'providerId' IS DISTINCT FROM v_run.source_payload->>'providerPlayerId'
    OR nullif(btrim(p_identity->>'name'),'') IS NULL
    OR length(p_identity->>'name')>250 THEN RAISE EXCEPTION 'Exact official identity required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_identity) k WHERE k NOT IN
    ('provider','providerId','name','displayName','nationality','broadPosition','broadPositionId','position','positionId','detailedPosition','detailedPositionId'))
    THEN RAISE EXCEPTION 'Unexpected identity field'; END IF;
  -- Strict allowlist: historical membership is handled by the existing scorer.
  INSERT INTO football_players(provider,provider_player_id,name,display_name,
    nationality,provider_position,provider_position_id,position,position_id,detailed_position,detailed_position_id,source_updated_at)
  VALUES('sportmonks',p_identity->>'providerId',p_identity->>'name',
    coalesce(nullif(btrim(p_identity->>'displayName'),''),p_identity->>'name'),
    p_identity->>'nationality',p_identity->>'broadPosition',p_identity->>'broadPositionId',
    p_identity->>'position',p_identity->>'positionId',p_identity->>'detailedPosition',p_identity->>'detailedPositionId',now())
  ON CONFLICT(provider,provider_player_id) DO NOTHING RETURNING id INTO v_player;
  v_created := v_player IS NOT NULL;
  IF v_player IS NULL THEN
    SELECT id INTO STRICT v_player FROM football_players
      WHERE provider='sportmonks' AND provider_player_id=p_identity->>'providerId';
  END IF;
  UPDATE football_data_sync_runs SET status='success',completed_at=now(),
    records_created=CASE WHEN v_created THEN 1 ELSE 0 END,
    source_payload=source_payload||jsonb_build_object('canonicalPlayerId',v_player,'identity',p_identity)
    WHERE id=p_run_id;
  RETURN v_player;
END $$;
REVOKE ALL ON FUNCTION public.touchline_claim_player_identity_recovery(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.touchline_complete_player_identity_recovery(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.touchline_claim_player_identity_recovery(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.touchline_complete_player_identity_recovery(uuid,jsonb) TO service_role;
COMMIT;
