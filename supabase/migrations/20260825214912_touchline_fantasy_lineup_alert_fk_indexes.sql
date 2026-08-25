-- Cover every lineup-alert foreign key used by reconciliation and cleanup.

begin;
set local lock_timeout = '5s';

create index if not exists touchline_fantasy_lineup_alerts_gameweek_idx
  on public.touchline_fantasy_lineup_alerts (gameweek_id);

create index if not exists touchline_fantasy_lineup_alerts_player_idx
  on public.touchline_fantasy_lineup_alerts (player_id);

create index if not exists touchline_fantasy_lineup_alerts_fixture_idx
  on public.touchline_fantasy_lineup_alerts (fixture_id);

commit;
