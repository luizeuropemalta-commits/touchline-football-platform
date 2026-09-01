-- QA-only rollback for module 045. It never alters frozen 039-044 objects.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_club_social_posts') is null
     or pg_catalog.to_regclass('public.touchline_club_social_post_clubs') is null
     or pg_catalog.to_regclass('public.touchline_club_social_tombstones') is null
     or pg_catalog.to_regclass('public.touchline_club_social_fanout_jobs') is null
     or pg_catalog.to_regclass('public.touchline_club_social_executor_cycles') is null then
    raise exception 'TL_SOCIAL_045_ROLLBACK_SCHEMA_PRECONDITION_FAILED';
  end if;
end
$$;

lock table public.touchline_club_social_executor_cycles in access exclusive mode;
lock table public.touchline_club_social_fanout_jobs in access exclusive mode;
lock table public.touchline_club_social_post_clubs in access exclusive mode;
lock table public.touchline_club_social_posts in access exclusive mode;
lock table public.touchline_club_social_tombstones in access exclusive mode;

do $$
begin
  if exists (
    select 1 from public.touchline_club_social_executor_cycles
    where lease_token is not null and lease_expires_at > clock_timestamp()
  ) then raise exception 'TL_SOCIAL_045_ROLLBACK_ACTIVE_LEASE'; end if;
  if exists (select 1 from public.touchline_club_social_fanout_jobs)
     or exists (select 1 from public.touchline_club_social_posts)
     or exists (select 1 from public.touchline_club_social_post_clubs)
     or exists (select 1 from public.touchline_club_social_tombstones) then
    raise exception 'TL_SOCIAL_045_ROLLBACK_NONEMPTY';
  end if;
end
$$;

drop function public.touchline_social_045_admin_status();
drop function public.touchline_social_045_read_feed(text,integer,timestamptz,uuid);
drop function public.touchline_social_045_expire_posts(uuid,integer);
drop function public.touchline_social_045_complete_job(uuid,uuid,uuid,text,text);
drop function public.touchline_social_045_renew_job(uuid,uuid,uuid);
drop function public.touchline_social_045_claim_job(uuid);
drop function public.touchline_social_045_enqueue_job(uuid,uuid,text[],text,text);
drop function public.touchline_social_045_expected_team_ids(uuid);
drop function public.touchline_social_045_complete_cycle(text,uuid,text,text,integer);
drop function public.touchline_social_045_renew_cycle(text,uuid);
drop function public.touchline_social_045_claim_cycle(text);

drop table public.touchline_club_social_fanout_jobs;
drop table public.touchline_club_social_post_clubs;
drop table public.touchline_club_social_posts;
drop table public.touchline_club_social_tombstones;
drop table public.touchline_club_social_executor_cycles;

commit;
