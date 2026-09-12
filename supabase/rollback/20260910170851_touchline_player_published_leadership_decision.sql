-- Reverses only the immutable player-leadership publication surface added by
-- 20260910170851. It intentionally leaves ranking snapshots untouched.
drop trigger if exists touchline_player_ranking_leadership_decisions_immutable
  on public.touchline_player_ranking_leadership_decisions;

drop function if exists public.publish_touchline_player_ranking_leadership_decision(text, text, timestamptz);
drop function if exists public.reject_touchline_player_ranking_leadership_mutation();
drop table if exists public.touchline_player_ranking_leadership_decisions;
