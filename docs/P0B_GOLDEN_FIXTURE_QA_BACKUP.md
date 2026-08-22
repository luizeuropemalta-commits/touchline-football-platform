# P0B Golden Fixture — QA pre-migration backup

Scope: Supabase QA project `xgxbwqxjssxxuihuwmgy` only. Production was not queried or changed.

Captured at: `2026-08-21T22:24:46.814145+00:00`

## Golden fixture

- Provider: `sportmonks`
- Provider fixture ID: `19722203`
- Canonical fixture ID: `687a3b53-f586-470a-9d3d-e71ef7a8e858`
- Kickoff: `2026-08-21T19:00:00+00:00`
- Status: `Full Time`
- Score: Arsenal 3–0 Coventry
- Provider state ID: `5`
- Round ID: `60efab1d-2514-4dbe-b5f5-ef2aed06b04d`
- Line-up members persisted: `40`
- Provider events persisted: `14`
- First persisted feed observation: `2026-08-21T20:49:07.791787+00:00`
- Last feed sync before migration: `2026-08-21T21:05:02.937+00:00`

The provider payload does not expose a line-up publication timestamp. Therefore `LINEUP_AVAILABLE` uses the first persisted feed observation and does not claim a provider publication time.

## Before counts

- `football_player_fixture_statistics`: `0`
- `football_player_season_memberships`: `0`
- `football_player_season_statistics`: `0`
- `touchline_coach_fixture_points`: `0`
- `touchline_coach_contracts`: `4`

## Before schema

- `football_fixture_events`: absent
- `football_fixture_lifecycle_events`: absent
- `football_player_fixture_statistics.touchline_points`: absent

## Rollback

The forward migration is additive. Before rollback, export the two new event tables and the new fixture-statistics columns. Then drop `football_fixture_lifecycle_events`, drop `football_fixture_events`, and drop the four added fixture-statistics columns. No rollback is executed as part of P0B.
