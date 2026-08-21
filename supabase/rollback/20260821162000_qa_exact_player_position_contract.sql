-- First call touchline_rollback_qa_twenty_club_roster with the exact applied
-- run ID and roll application code back to its prior SHA. This optional schema
-- rollback never deletes a player, membership, override, publication or audit.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.football_squad_members
  drop constraint if exists football_squad_members_detailed_position_id_format,
  drop constraint if exists football_squad_members_provider_position_id_format,
  drop column if exists detailed_position_id,
  drop column if exists detailed_position,
  drop column if exists provider_position_id,
  drop column if exists provider_position,
  drop column if exists position_id;

alter table public.football_players
  drop constraint if exists football_players_detailed_position_id_format,
  drop constraint if exists football_players_provider_position_id_format,
  drop column if exists detailed_position_id,
  drop column if exists detailed_position,
  drop column if exists provider_position_id,
  drop column if exists provider_position;

commit;
