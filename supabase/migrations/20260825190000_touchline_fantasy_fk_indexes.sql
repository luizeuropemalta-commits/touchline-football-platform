-- QA Fantasy V1 follow-up: cover foreign keys used by settlement, entitlement
-- and audit joins. This migration is additive and does not expose browser access.

create index if not exists touchline_fantasy_audit_events_gameweek_idx
  on public.touchline_fantasy_audit_events (gameweek_id);

create index if not exists touchline_fantasy_audit_events_user_idx
  on public.touchline_fantasy_audit_events (user_id);

create index if not exists touchline_fantasy_configs_season_idx
  on public.touchline_fantasy_configs (season_id);

create index if not exists touchline_fantasy_locked_selections_club_idx
  on public.touchline_fantasy_locked_selections (club_id);

create index if not exists touchline_fantasy_player_fixture_scores_fixture_idx
  on public.touchline_fantasy_player_fixture_scores (fixture_id);

create index if not exists touchline_fantasy_subscription_events_user_idx
  on public.touchline_fantasy_subscription_events (user_id);

create index if not exists touchline_fantasy_user_gameweek_selections_club_idx
  on public.touchline_fantasy_user_gameweek_selections (club_id);

create index if not exists touchline_fantasy_user_gameweeks_carry_source_idx
  on public.touchline_fantasy_user_gameweeks (carry_source_user_gameweek_id);

create index if not exists touchline_fantasy_user_gameweeks_gameweek_idx
  on public.touchline_fantasy_user_gameweeks (gameweek_id);
