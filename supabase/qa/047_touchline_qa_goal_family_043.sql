-- QA-only forward migration: move HAT_TRICK_HERO from ranking 044 to the
-- event-scoped 043 goal family. No outbound connector is enabled here.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
declare
  v_name text;
  v_definition text;
  v_original text;
begin
  if pg_catalog.to_regclass('public.touchline_social_publication_drafts') is null
     or pg_catalog.to_regclass('public.touchline_social_confirmed_event_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_social_ranking_generation_jobs') is null then
    raise exception 'TL_SOCIAL_GOAL_FAMILY_047_SCHEMA_PRECONDITION_FAILED';
  end if;

  foreach v_name in array array[
    'public.touchline_social_043_create_draft(jsonb)',
    'public.touchline_social_043_enqueue_job(uuid,text,text,text,text,timestamptz,timestamptz,text,jsonb,text)',
    'public.touchline_social_043_assert_approval_gate(uuid)',
    'public.touchline_social_043_issue_review_intent(uuid,text,text,text,text,text,uuid)',
    'public.touchline_social_043_approve(uuid,uuid,text,text,text,text,text,uuid)'
  ] loop
    if pg_catalog.to_regprocedure(v_name) is null then
      raise exception 'TL_SOCIAL_GOAL_FAMILY_047_FUNCTION_MISSING_%', v_name;
    end if;
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_name)) into v_definition;
    v_original := v_definition;
    v_definition := replace(
      v_definition,
      '(''GOAL_CONFIRMED'', ''RED_CARD_CONFIRMED'')',
      '(''GOAL_CONFIRMED'', ''RED_CARD_CONFIRMED'', ''HAT_TRICK_HERO'')'
    );
    if v_name like '%create_draft%' then
      v_definition := replace(
        v_definition,
        'or p_draft ->> ''placement'' <> ''INSTAGRAM_STORY''',
        E'or (p_draft ->> ''content_type'' = ''RED_CARD_CONFIRMED'' and p_draft ->> ''placement'' <> ''INSTAGRAM_STORY'')\n     or (p_draft ->> ''content_type'' in (''GOAL_CONFIRMED'',''HAT_TRICK_HERO'') and p_draft ->> ''placement'' <> ''INSTAGRAM_FEED'')'
      );
    elsif v_name like '%enqueue_job%' then
      v_definition := replace(v_definition,
        '(p_content_type = ''GOAL_CONFIRMED'' and p_template_version <> ''touchline-goal-confirmed-story-v1'')',
        '(p_content_type = ''GOAL_CONFIRMED'' and p_template_version <> ''touchline-goal-event-feed-v1'')');
      v_definition := replace(v_definition,
        'or (p_content_type = ''RED_CARD_CONFIRMED'' and p_template_version <> ''touchline-red-card-confirmed-story-v1'')',
        E'or (p_content_type = ''RED_CARD_CONFIRMED'' and p_template_version <> ''touchline-red-card-confirmed-story-v1'')\n     or (p_content_type = ''HAT_TRICK_HERO'' and p_template_version <> ''touchline-hat-trick-feed-v1'')');
    end if;
    if v_definition = v_original then
      raise exception 'TL_SOCIAL_GOAL_FAMILY_047_FUNCTION_DRIFT_%', v_name;
    end if;
    if pg_catalog.position(
         '(''GOAL_CONFIRMED'', ''RED_CARD_CONFIRMED'', ''HAT_TRICK_HERO'')' in v_definition
       ) = 0
       or (v_name like '%create_draft%' and (
         pg_catalog.position('HAT_TRICK_HERO' in v_definition) = 0
         or pg_catalog.position('INSTAGRAM_FEED' in v_definition) = 0
         or pg_catalog.position('INSTAGRAM_STORY' in v_definition) = 0
       ))
       or (v_name like '%enqueue_job%' and (
         pg_catalog.position('touchline-goal-event-feed-v1' in v_definition) = 0
         or pg_catalog.position('touchline-hat-trick-feed-v1' in v_definition) = 0
         or pg_catalog.position('touchline-red-card-confirmed-story-v1' in v_definition) = 0
       )) then
      raise exception 'TL_SOCIAL_GOAL_FAMILY_047_FUNCTION_PATCH_INCOMPLETE_%', v_name;
    end if;
    execute v_definition;
  end loop;
end
$$;

alter table public.touchline_social_publication_drafts
  drop constraint touchline_social_drafts_044_relation_check,
  drop constraint touchline_social_drafts_044_placement_check,
  drop constraint touchline_social_drafts_044_render_path_check;

alter table public.touchline_social_publication_drafts
  add constraint touchline_social_drafts_047_relation_check check (
    (content_type = 'LINEUP' and team_provider_id is not null and event_provider_id is null
      and scope_provider_id is null and subject_player_provider_id is null)
    or (content_type in ('MATCH_PREVIEW','FULL_TIME','FINAL_SCORE','PLAYER_DUEL')
      and team_provider_id is null and event_provider_id is null
      and scope_provider_id is null and subject_player_provider_id is null)
    or (content_type in ('GOAL_CONFIRMED','RED_CARD_CONFIRMED','HAT_TRICK_HERO')
      and team_provider_id is null and event_provider_id is not null
      and scope_provider_id is null and subject_player_provider_id is null)
    or (content_type in ('GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL')
      and team_provider_id is null and event_provider_id is null
      and scope_provider_id is not null and subject_player_provider_id is null)
    or (content_type = 'GAMEWEEK_HERO' and team_provider_id is null and event_provider_id is null
      and scope_provider_id is not null and subject_player_provider_id is not null)
    or (content_type = 'TOP_PERFORMER' and team_provider_id is null and event_provider_id is null
      and scope_provider_id is null and subject_player_provider_id is not null)
  ) not valid,
  add constraint touchline_social_drafts_047_placement_check check (
    (content_type in (
      'LINEUP','MATCH_PREVIEW','FULL_TIME','GOAL_CONFIRMED','HAT_TRICK_HERO',
      'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL','GAMEWEEK_HERO','TOP_PERFORMER'
    ) and placement = 'INSTAGRAM_FEED')
    or (content_type in ('FINAL_SCORE','RED_CARD_CONFIRMED') and placement = 'INSTAGRAM_STORY')
  ) not valid,
  add constraint touchline_social_drafts_047_render_path_check check (
    render_path = case content_type
      when 'LINEUP' then '/visual-qa/social-lineup?fixtureId=' || fixture_provider_id
        || '&teamId=' || team_provider_id || '&locale=' || locale || '&revision=' || revision::text
      when 'MATCH_PREVIEW' then '/visual-qa/social-match-preview?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'FULL_TIME' then '/visual-qa/social-full-time?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'FINAL_SCORE' then '/visual-qa/social-final-score?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'GOAL_CONFIRMED' then '/visual-qa/social-confirmed-event?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&eventId=' || event_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'RED_CARD_CONFIRMED' then '/visual-qa/social-confirmed-event?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&eventId=' || event_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'HAT_TRICK_HERO' then '/visual-qa/social-confirmed-event?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&eventId=' || event_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'GAMEWEEK_RANKING_PREVIEW' then '/visual-qa/social-ranking?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&scopeId=' || scope_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'GAMEWEEK_RANKING_FINAL' then '/visual-qa/social-ranking?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&scopeId=' || scope_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'GAMEWEEK_HERO' then '/visual-qa/social-ranking?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&scopeId=' || scope_provider_id
        || '&playerId=' || subject_player_provider_id || '&locale=' || locale || '&revision=' || revision::text
      when 'PLAYER_DUEL' then '/visual-qa/social-ranking?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&locale=' || locale || '&revision=' || revision::text
      when 'TOP_PERFORMER' then '/visual-qa/social-ranking?contentType=' || content_type
        || '&fixtureId=' || fixture_provider_id || '&playerId=' || subject_player_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
    end
  ) not valid;

do $$
declare v_constraint record;
begin
  for v_constraint in
    select conname from pg_catalog.pg_constraint
    where conrelid = 'public.touchline_social_confirmed_event_generation_jobs'::regclass
      and contype = 'c' and pg_catalog.pg_get_constraintdef(oid) like '%content_type%'
  loop
    execute pg_catalog.format(
      'alter table public.touchline_social_confirmed_event_generation_jobs drop constraint %I',
      v_constraint.conname
    );
  end loop;
end
$$;

alter table public.touchline_social_confirmed_event_generation_jobs
  add constraint touchline_social_confirmed_event_jobs_047_content_type_check
  check (content_type in ('GOAL_CONFIRMED','RED_CARD_CONFIRMED','HAT_TRICK_HERO')) not valid;

create or replace function public.touchline_social_047_block_hat_trick_in_044()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.content_type = 'HAT_TRICK_HERO' then
    raise exception 'TL_SOCIAL_HAT_TRICK_MOVED_TO_043';
  end if;
  return new;
end
$$;

drop trigger if exists touchline_social_047_block_hat_trick_in_044
  on public.touchline_social_ranking_generation_jobs;
create trigger touchline_social_047_block_hat_trick_in_044
before insert or update on public.touchline_social_ranking_generation_jobs
for each row execute function public.touchline_social_047_block_hat_trick_in_044();

create or replace function public.touchline_social_guard_executor_draft_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.artwork_approval_state = 'APPROVED' and old.artwork_approval_state is distinct from new.artwork_approval_state)
     or (new.caption_approval_state = 'APPROVED' and old.caption_approval_state is distinct from new.caption_approval_state) then
    if new.content_type in ('GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL','GAMEWEEK_HERO','TOP_PERFORMER') then
      perform public.touchline_social_044_assert_approval_gate(new.id);
    elsif new.content_type in ('GOAL_CONFIRMED','RED_CARD_CONFIRMED','HAT_TRICK_HERO') then
      perform public.touchline_social_043_assert_approval_gate(new.id);
    elsif new.content_type in ('FULL_TIME','FINAL_SCORE') then
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

create or replace function public.touchline_social_046_generation_is_current(p_draft_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype; v_current uuid;
begin
  select * into v_draft from public.touchline_social_publication_drafts where id=p_draft_id;
  if not found then return false; end if;
  if v_draft.content_type='LINEUP' then
    select generated_draft_id into v_current from public.touchline_social_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and team_provider_id=v_draft.team_provider_id and content_type='LINEUP' and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  elsif v_draft.content_type='MATCH_PREVIEW' then
    select generated_draft_id into v_current from public.touchline_social_match_preview_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and content_type=v_draft.content_type and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  elsif v_draft.content_type in ('FULL_TIME','FINAL_SCORE') then
    select generated_draft_id into v_current from public.touchline_social_final_result_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and content_type=v_draft.content_type and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  elsif v_draft.content_type in ('GOAL_CONFIRMED','RED_CARD_CONFIRMED','HAT_TRICK_HERO') then
    select generated_draft_id into v_current from public.touchline_social_confirmed_event_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and event_provider_id=v_draft.event_provider_id and content_type=v_draft.content_type and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  else
    select generated_draft_id into v_current from public.touchline_social_ranking_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and scope_provider_id is not distinct from v_draft.scope_provider_id and subject_player_provider_id is not distinct from v_draft.subject_player_provider_id and content_type=v_draft.content_type and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  end if;
  return v_current is not distinct from v_draft.id;
end
$$;

revoke all on function public.touchline_social_047_block_hat_trick_in_044() from public, anon, authenticated;

commit;
