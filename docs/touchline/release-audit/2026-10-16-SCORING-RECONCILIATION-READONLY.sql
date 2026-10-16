-- QA-only diagnostic. Never executes a provider request, score rebuild or write.
BEGIN TRANSACTION READ ONLY;
WITH fixture_coverage AS (
  SELECT r.name AS round, f.id, f.provider_fixture_id,
    count(DISTINCT feed.id) AS feeds,
    count(DISTINCT s.id) AS v4_settlements
  FROM public.football_fixtures f
  JOIN public.football_rounds r ON r.id = f.round_id
  JOIN public.football_competitions c ON c.id = f.competition_id
  LEFT JOIN public.football_fantasy_fixture_feeds feed
    ON feed.provider = f.provider AND feed.provider_fixture_id = f.provider_fixture_id
  LEFT JOIN public.touchline_player_fixture_score_settlements s
    ON s.fixture_id = f.id AND s.scoring_version = 'player_scoring_v4'
  WHERE c.provider = 'sportmonks' AND c.provider_competition_id = '8'
  GROUP BY r.name, f.id, f.provider_fixture_id
), missing_identities AS (
  SELECT DISTINCT feed.provider_fixture_id, member->>'playerId' AS provider_player_id
  FROM public.football_fantasy_fixture_feeds feed
  CROSS JOIN LATERAL jsonb_array_elements(feed.lineups_payload) member
  WHERE feed.provider = 'sportmonks'
    AND NOT EXISTS (
      SELECT 1 FROM public.football_players p
      WHERE p.provider = feed.provider AND p.provider_player_id = member->>'playerId'
    )
)
SELECT jsonb_build_object(
  'fixture_coverage', (SELECT jsonb_agg(to_jsonb(f) ORDER BY round, provider_fixture_id) FROM fixture_coverage f),
  'missing_identities', (SELECT jsonb_agg(to_jsonb(m)) FROM missing_identities m)
);
ROLLBACK;
