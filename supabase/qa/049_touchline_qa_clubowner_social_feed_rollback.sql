-- QA-only rollback for the 049 ClubOwner Timeline reader.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

drop function if exists public.touchline_social_049_read_clubowner_feed(integer,timestamptz,uuid);
drop function if exists public.touchline_social_049_read_share_art(uuid);

commit;
