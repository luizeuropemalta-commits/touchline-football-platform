-- QA-only corrective revision fence for the shared ClubHub and ClubOwner
-- readers. A published post is visible only while every immutable identity
-- captured at publication still equals the current approved source draft.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_club_social_posts') is null
     or pg_catalog.to_regclass('public.touchline_club_social_post_clubs') is null
     or pg_catalog.to_regclass('public.touchline_social_publication_drafts') is null
     or pg_catalog.to_regprocedure(
       'public.touchline_social_045_read_feed(text,integer,timestamptz,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.touchline_social_049_read_clubowner_feed(integer,timestamptz,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.touchline_social_049_read_share_art(uuid)'
     ) is null then
    raise exception 'TL_SOCIAL_050_SCHEMA_PRECONDITION_FAILED';
  end if;
end
$$;

create or replace function public.touchline_social_045_read_feed(
  p_team_provider_id text,
  p_limit integer default 6,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,6),1),12);
begin
  if coalesce(p_team_provider_id,'') !~ '^[1-9][0-9]{0,19}$'
     or ((p_before_published_at is null) <> (p_before_id is null)) then
    raise exception 'TL_SOCIAL_CLUB_FEED_READ_INVALID';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'postId',feed.post_id,'contentType',feed.content_type,'copy',feed.timeline_copy,
    'sourceChecksum',feed.source_checksum,'publishedAt',feed.published_at,'expiresAt',feed.expires_at,
    'artifactBucket',feed.artifact_storage_bucket,'artifactKey',feed.artifact_storage_key,
    'artifactChecksum',feed.artifact_checksum,'width',feed.width,'height',feed.height
  ) order by feed.published_at desc,feed.post_id desc),'[]'::jsonb) into v_items from (
    select post.id post_id,post.content_type,post.timeline_copy,post.source_checksum,
      post.published_at,post.expires_at,draft.artifact_storage_bucket,
      draft.artifact_storage_key,draft.artifact_checksum,draft.width,draft.height
    from public.touchline_club_social_post_clubs ref
    join public.touchline_club_social_posts post on post.id=ref.post_id
    join public.touchline_social_publication_drafts draft on draft.id=post.source_draft_id
    where ref.provider_team_id=p_team_provider_id and post.expires_at>clock_timestamp()
      and ref.source_checksum=post.source_checksum
      and post.source_checksum=draft.source_checksum
      and post.source_revision_checksum=draft.source_revision_checksum
      and post.manifest_checksum=draft.manifest_checksum
      and post.artifact_checksum=draft.artifact_checksum
      and draft.approval_state='APPROVED'
      and draft.artwork_approval_state='APPROVED'
      and draft.caption_approval_state='APPROVED'
      and draft.approved_artifact_checksum=draft.artifact_checksum
      and draft.approved_caption_checksum=draft.caption_checksum
      and draft.approved_manifest_checksum=draft.manifest_checksum
      and public.touchline_social_source_revision_is_current(
        draft.source_revision_manifest,draft.source_revision_checksum)
      and (p_before_published_at is null
        or (post.published_at,post.id)<(p_before_published_at,p_before_id))
    order by post.published_at desc,post.id desc
    limit v_limit+1
  ) feed;
  return pg_catalog.jsonb_build_object('items',v_items,'limit',v_limit);
end
$$;

create or replace function public.touchline_social_049_read_clubowner_feed(
  p_limit integer default 6,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,6),1),12);
begin
  if (p_before_published_at is null) <> (p_before_id is null) then
    raise exception 'TL_SOCIAL_CLUBOWNER_FEED_READ_INVALID';
  end if;
  with canonical_posts as (
    select distinct on (post.source_draft_id)
      post.id,post.source_draft_id,post.content_type,post.timeline_copy,
      post.source_checksum,post.published_at,post.expires_at,
      draft.artifact_storage_bucket,draft.artifact_storage_key,
      draft.artifact_checksum,draft.width,draft.height
    from public.touchline_club_social_posts post
    join public.touchline_social_publication_drafts draft on draft.id=post.source_draft_id
    where post.expires_at>clock_timestamp()
      and post.source_checksum=draft.source_checksum
      and post.source_revision_checksum=draft.source_revision_checksum
      and post.manifest_checksum=draft.manifest_checksum
      and post.artifact_checksum=draft.artifact_checksum
      and draft.approval_state='APPROVED'
      and draft.artwork_approval_state='APPROVED'
      and draft.caption_approval_state='APPROVED'
      and draft.approved_artifact_checksum=draft.artifact_checksum
      and draft.approved_caption_checksum=draft.caption_checksum
      and draft.approved_manifest_checksum=draft.manifest_checksum
      and public.touchline_social_source_revision_is_current(
        draft.source_revision_manifest,draft.source_revision_checksum)
    order by post.source_draft_id,post.published_at desc,post.id desc
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'postId',feed.post_id,'contentType',feed.content_type,'copy',feed.timeline_copy,
    'sourceChecksum',feed.source_checksum,'publishedAt',feed.published_at,'expiresAt',feed.expires_at,
    'artifactBucket',feed.artifact_storage_bucket,'artifactKey',feed.artifact_storage_key,
    'artifactChecksum',feed.artifact_checksum,'width',feed.width,'height',feed.height
  ) order by feed.published_at desc,feed.post_id desc),'[]'::jsonb) into v_items from (
    select post.id post_id,post.content_type,post.timeline_copy,post.source_checksum,
      post.published_at,post.expires_at,post.artifact_storage_bucket,
      post.artifact_storage_key,post.artifact_checksum,post.width,post.height
    from canonical_posts post
    where p_before_published_at is null
      or (post.published_at,post.id)<(p_before_published_at,p_before_id)
    order by post.published_at desc,post.id desc
    limit v_limit+1
  ) feed;
  return pg_catalog.jsonb_build_object('items',v_items,'limit',v_limit);
end
$$;

create or replace function public.touchline_social_049_read_share_art(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_art jsonb;
begin
  if p_post_id is null then raise exception 'TL_SOCIAL_SHARE_ART_READ_INVALID'; end if;
  select pg_catalog.jsonb_build_object(
    'artifactBucket',draft.artifact_storage_bucket,
    'artifactKey',draft.artifact_storage_key,
    'artifactChecksum',draft.artifact_checksum,
    'width',draft.width,'height',draft.height
  ) into v_art
  from public.touchline_club_social_posts post
  join public.touchline_social_publication_drafts draft on draft.id=post.source_draft_id
  where post.id=p_post_id and post.expires_at>clock_timestamp()
    and post.source_checksum=draft.source_checksum
    and post.source_revision_checksum=draft.source_revision_checksum
    and post.manifest_checksum=draft.manifest_checksum
    and post.artifact_checksum=draft.artifact_checksum
    and draft.approval_state='APPROVED'
    and draft.artwork_approval_state='APPROVED'
    and draft.caption_approval_state='APPROVED'
    and draft.approved_artifact_checksum=draft.artifact_checksum
    and draft.approved_caption_checksum=draft.caption_checksum
    and draft.approved_manifest_checksum=draft.manifest_checksum
    and public.touchline_social_source_revision_is_current(
      draft.source_revision_manifest,draft.source_revision_checksum);
  if v_art is null then raise exception 'TL_SOCIAL_SHARE_ART_NOT_AVAILABLE'; end if;
  return v_art;
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
