begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-043-executor:SCHEDULER', 0));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-043-executor:RUNNER', 0));
lock table public.touchline_social_confirmed_event_executor_cycles,
  public.touchline_social_confirmed_event_generation_jobs,
  public.touchline_social_confirmed_event_review_intents,
  public.touchline_social_confirmed_event_observations in access exclusive mode;
lock table public.touchline_social_publication_drafts in share row exclusive mode;

do $$
begin
  if exists (select 1 from public.touchline_social_confirmed_event_generation_jobs)
     or exists (select 1 from public.touchline_social_confirmed_event_review_intents)
     or exists (select 1 from public.touchline_social_confirmed_event_observations)
     or exists (select 1 from public.touchline_social_confirmed_event_executor_cycles
       where lease_token is not null or run_count > 0)
     or exists (select 1 from public.touchline_social_publication_drafts
       where content_type in ('GOAL_CONFIRMED', 'RED_CARD_CONFIRMED')) then
    raise exception 'TL_SOCIAL_043_ROLLBACK_NONEMPTY';
  end if;
end
$$;

create or replace function public.touchline_social_guard_executor_draft_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.artwork_approval_state = 'APPROVED'
        and old.artwork_approval_state is distinct from new.artwork_approval_state)
     or (new.caption_approval_state = 'APPROVED'
        and old.caption_approval_state is distinct from new.caption_approval_state) then
    if new.content_type in ('FULL_TIME', 'FINAL_SCORE') then
      perform public.touchline_social_042_assert_approval_gate(new.id);
    elsif new.content_type = 'MATCH_PREVIEW' then
      perform public.touchline_social_041_assert_approval_gate(new.id);
    else
      perform public.touchline_social_assert_executor_approval_gate(new.id);
    end if;
  end if;
  return new;
end
$$;

drop function if exists public.touchline_social_043_enqueue_dispatch(uuid);
drop function if exists public.touchline_social_043_approve(uuid, uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_043_issue_review_intent(uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_043_assert_approval_gate(uuid);
drop function if exists public.touchline_social_043_complete_job(uuid, uuid, uuid, text, text, uuid);
drop function if exists public.touchline_social_043_renew_job(uuid, uuid, uuid);
drop function if exists public.touchline_social_043_claim_job(uuid);
drop function if exists public.touchline_social_043_enqueue_job(uuid, text, text, text, text, timestamptz, timestamptz, text, jsonb, text);
drop function if exists public.touchline_social_043_complete_cycle(text, uuid, text, text, integer);
drop function if exists public.touchline_social_043_renew_cycle(text, uuid);
drop function if exists public.touchline_social_043_claim_cycle(text);
drop function if exists public.touchline_social_043_create_draft(jsonb);
drop table public.touchline_social_confirmed_event_review_intents;
drop table public.touchline_social_confirmed_event_generation_jobs;
drop table public.touchline_social_confirmed_event_executor_cycles;
drop function if exists public.touchline_social_043_guard_job_mutation();
drop function if exists public.touchline_social_043_guard_cycle_mutation();

drop trigger if exists tls_social_043_event_revision on public.football_fixture_events;
drop function if exists public.touchline_social_043_track_event_dependency();
drop function if exists public.touchline_social_043_observe_confirmed_event(text, text);
drop trigger if exists touchline_social_043_observation_guard
  on public.touchline_social_confirmed_event_observations;
drop function if exists public.touchline_social_043_guard_observation_mutation();
drop table public.touchline_social_confirmed_event_observations;
delete from public.touchline_social_source_revisions where source_key like 'fixture-event:%';

drop trigger if exists touchline_social_043_draft_event_identity_guard
  on public.touchline_social_publication_drafts;
drop function if exists public.touchline_social_043_guard_draft_event_identity();

alter table public.touchline_social_publication_drafts
  drop constraint touchline_social_drafts_043_object_key_check,
  drop constraint touchline_social_drafts_043_publication_key_check,
  drop constraint touchline_social_drafts_043_render_path_check,
  drop constraint touchline_social_drafts_043_placement_check,
  drop constraint touchline_social_drafts_043_input_check,
  drop constraint touchline_social_drafts_043_relation_check,
  drop constraint touchline_social_drafts_043_event_id_check,
  drop constraint touchline_social_drafts_043_content_type_check,
  drop column event_provider_id,
  add constraint touchline_social_drafts_042_content_type_check
    check (content_type in ('LINEUP', 'MATCH_PREVIEW', 'FULL_TIME', 'FINAL_SCORE')),
  add constraint touchline_social_drafts_042_relation_check
    check ((content_type = 'LINEUP' and team_provider_id is not null)
      or (content_type in ('MATCH_PREVIEW', 'FULL_TIME', 'FINAL_SCORE') and team_provider_id is null)),
  add constraint touchline_social_drafts_042_input_check
    check ((content_type not in ('LINEUP', 'MATCH_PREVIEW', 'FULL_TIME') or input_checksum = source_checksum)
      and (content_type <> 'FINAL_SCORE' or template_version <> 'touchline-final-score-story-v1'
        or input_checksum = source_checksum)),
  add constraint touchline_social_drafts_042_placement_check
    check ((content_type in ('LINEUP', 'MATCH_PREVIEW', 'FULL_TIME') and placement = 'INSTAGRAM_FEED')
      or (content_type = 'FINAL_SCORE' and placement = 'INSTAGRAM_STORY')),
  add constraint touchline_social_drafts_042_render_path_check
    check (render_path = case content_type
      when 'LINEUP' then '/visual-qa/social-lineup?fixtureId=' || fixture_provider_id
        || '&teamId=' || team_provider_id || '&locale=' || locale || '&revision=' || revision::text
      when 'FINAL_SCORE' then '/visual-qa/social-final-score?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'MATCH_PREVIEW' then '/visual-qa/social-match-preview?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'FULL_TIME' then '/visual-qa/social-full-time?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text end),
  add constraint touchline_social_drafts_042_publication_key_check
    check (publication_key = 'instagram:' || placement || ':' || content_type || ':'
      || fixture_provider_id || ':' || coalesce(team_provider_id, 'fixture') || ':'
      || locale || ':tv=' || template_version || ':sv=' || source_version
      || ':r=' || revision::text),
  add constraint touchline_social_drafts_042_object_key_check
    check (artifact_storage_key = 'instagram/' || lower(placement) || '/'
      || lower(content_type) || '/' || fixture_provider_id || '/'
      || coalesce(team_provider_id, 'fixture') || '/' || locale || '/tv='
      || template_version || '/sv=' || source_version || '/r=' || revision::text || '/'
      || substring(artifact_checksum from 8)
      || case artifact_content_type when 'image/png' then '.png' else '.jpg' end);

alter table public.touchline_social_source_revisions
  drop constraint touchline_social_source_revisions_043_source_key_check,
  add constraint touchline_social_source_revisions_041_source_key_check check (
    source_key ~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$');

create or replace function public.touchline_social_source_revision_is_current(p_manifest jsonb, p_checksum text)
returns boolean language plpgsql stable set search_path = '' as $$
declare v_expected_checksum text;
begin
  if jsonb_typeof(p_manifest) is distinct from 'object'
     or public.touchline_social_jsonb_object_length(p_manifest) not between 1 and 128
     or coalesce(p_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or exists (select 1 from pg_catalog.jsonb_each_text(p_manifest) entry(source_key, revision_text)
       where entry.source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$'
          or entry.revision_text !~ '^(0|[1-9][0-9]{0,18})$') then return false;
  end if;
  v_expected_checksum := 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_manifest::text, 'UTF8'), 'sha256'), 'hex');
  if v_expected_checksum is distinct from p_checksum then return false; end if;
  return not exists (select 1 from pg_catalog.jsonb_each_text(p_manifest) entry(source_key, revision_text)
    left join public.touchline_social_source_revisions revision on revision.source_key = entry.source_key
    where coalesce(revision.revision, 0) is distinct from entry.revision_text::bigint);
exception when others then return false;
end
$$;

create or replace function public.touchline_social_read_source_revision(
  p_source_keys text[] default array[]::text[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_keys text[]; v_manifest jsonb := '{}'::jsonb; v_checksum text; v_clock_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  select coalesce(array_agg(source_key order by source_key), array[]::text[]) into v_keys
  from (select distinct btrim(source_key) as source_key
    from unnest(coalesce(p_source_keys, array[]::text[])) source(source_key)
    where btrim(source_key) <> '') normalized;
  if coalesce(array_length(v_keys, 1), 0) > 128 or exists (
    select 1 from unnest(v_keys) source_key
    where source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$'
  ) then raise exception 'TL_SOCIAL_SOURCE_REVISION_KEYS_INVALID'; end if;
  select revision into v_clock_revision from public.touchline_social_source_clock where singleton = true;
  if v_clock_revision is null then raise exception 'TL_SOCIAL_SOURCE_CLOCK_UNAVAILABLE'; end if;
  if coalesce(array_length(v_keys, 1), 0) > 0 then
    select pg_catalog.jsonb_object_agg(source_key, revision order by source_key) into v_manifest
    from (select source_key, coalesce(stored.revision, 0) as revision
      from unnest(v_keys) source(source_key)
      left join public.touchline_social_source_revisions stored using (source_key)) current_revisions;
  end if;
  v_checksum := 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_manifest::text, 'UTF8'), 'sha256'), 'hex');
  return pg_catalog.jsonb_build_object(
    'clockRevision', v_clock_revision, 'manifest', v_manifest, 'checksum', v_checksum);
end
$$;

commit;
