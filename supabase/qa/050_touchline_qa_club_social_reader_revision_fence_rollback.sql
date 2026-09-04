-- QA-only fail-closed rollback for the 050 reader revision fence. It keeps
-- canonical post evidence intact and disables reads instead of restoring the
-- older reader definitions that did not bind every published hash.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create or replace function public.touchline_social_045_read_feed(
  p_team_provider_id text,
  p_limit integer default 6,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  raise exception 'TL_SOCIAL_050_CLUB_FEED_DISABLED';
end
$$;

create or replace function public.touchline_social_049_read_clubowner_feed(
  p_limit integer default 6,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  raise exception 'TL_SOCIAL_050_CLUBOWNER_FEED_DISABLED';
end
$$;

create or replace function public.touchline_social_049_read_share_art(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  raise exception 'TL_SOCIAL_050_SHARE_ART_DISABLED';
end
$$;

revoke all on function public.touchline_social_045_read_feed(text,integer,timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function public.touchline_social_045_read_feed(text,integer,timestamptz,uuid)
  to service_role;
revoke all on function public.touchline_social_049_read_clubowner_feed(integer,timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function public.touchline_social_049_read_clubowner_feed(integer,timestamptz,uuid)
  to service_role;
revoke all on function public.touchline_social_049_read_share_art(uuid)
  from public,anon,authenticated;
grant execute on function public.touchline_social_049_read_share_art(uuid)
  to service_role;

commit;
