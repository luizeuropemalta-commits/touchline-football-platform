-- Rollback for the QA-only nonblocking TouchLine analytics recorder.
-- This intentionally fails closed and preserves recorded analytics rows.
-- Coordinate with application rollback before applying.

begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
drop function if exists public.touchline_record_analytics_observation(uuid, uuid, text, text);
drop function if exists public.touchline_record_analytics_observation(uuid, uuid, text, text, integer);
drop index if exists public.touchline_analytics_sessions_user_last_seen_idx;
commit;
