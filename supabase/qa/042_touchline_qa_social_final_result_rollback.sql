begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Source-revision exclusive is the first lock in the global order. It drains
-- any existing source -> generation -> executor -> job transaction and keeps
-- new 042 work from entering while rollback checks and drops the extension.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-source-revision', 0)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-042-executor:SCHEDULER', 0)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-042-executor:RUNNER', 0)
);
lock table public.touchline_social_final_result_executor_cycles,
  public.touchline_social_final_result_generation_jobs,
  public.touchline_social_final_result_review_intents
  in access exclusive mode;
lock table public.touchline_social_publication_drafts in share row exclusive mode;

do $$
begin
  if exists (select 1 from public.touchline_social_final_result_generation_jobs)
     or exists (select 1 from public.touchline_social_final_result_review_intents)
     or exists (
       select 1 from public.touchline_social_final_result_executor_cycles
       where lease_token is not null or run_count > 0
     )
     or exists (
       select 1
       from public.touchline_social_publication_drafts
       where content_type = 'FULL_TIME'
          or (content_type = 'FINAL_SCORE'
              and template_version = 'touchline-final-score-story-v1')
     ) then
    raise exception 'TL_SOCIAL_FINAL_RESULT_042_ROLLBACK_NONEMPTY';
  end if;
end
$$;

drop trigger if exists tls_social_042_coach_settlement_revision
  on public.touchline_coach_fixture_points;
drop function if exists public.touchline_social_042_track_coach_settlement_dependency();

-- Restore the exact 041 dispatcher: MATCH_PREVIEW remains owned by 041 and
-- every pre-042 content type follows the frozen 040 authority.
create or replace function public.touchline_social_guard_executor_draft_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.artwork_approval_state = 'APPROVED'
        and old.artwork_approval_state is distinct from new.artwork_approval_state)
     or (new.caption_approval_state = 'APPROVED'
        and old.caption_approval_state is distinct from new.caption_approval_state) then
    if new.content_type = 'MATCH_PREVIEW' then
      perform public.touchline_social_041_assert_approval_gate(new.id);
    else
      perform public.touchline_social_assert_executor_approval_gate(new.id);
    end if;
  end if;
  return new;
end
$$;

drop function if exists public.touchline_social_042_approve(uuid, uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_042_issue_review_intent(uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_042_assert_approval_gate(uuid);
drop function if exists public.touchline_social_042_complete_job(uuid, uuid, uuid, text, text, uuid);
drop function if exists public.touchline_social_042_renew_job(uuid, uuid, uuid);
drop function if exists public.touchline_social_042_claim_job(uuid);
drop function if exists public.touchline_social_042_enqueue_job(uuid, text, text, text, timestamptz, timestamptz, text, jsonb, text);
drop function if exists public.touchline_social_042_complete_cycle(text, uuid, text, text, integer);
drop function if exists public.touchline_social_042_renew_cycle(text, uuid);
drop function if exists public.touchline_social_042_claim_cycle(text);
drop table public.touchline_social_final_result_review_intents;
drop table public.touchline_social_final_result_generation_jobs;
drop table public.touchline_social_final_result_executor_cycles;
drop function if exists public.touchline_social_042_guard_job_mutation();
drop function if exists public.touchline_social_042_guard_cycle_mutation();

alter table public.touchline_social_publication_drafts
  drop constraint touchline_social_drafts_042_render_path_check,
  drop constraint touchline_social_drafts_042_placement_check,
  drop constraint touchline_social_drafts_042_input_check,
  drop constraint touchline_social_drafts_042_relation_check,
  drop constraint touchline_social_drafts_042_content_type_check,
  add constraint touchline_social_drafts_041_content_type_check
    check (content_type in ('LINEUP', 'FINAL_SCORE', 'MATCH_PREVIEW')),
  add constraint touchline_social_drafts_041_relation_check
    check (
      (content_type = 'LINEUP' and team_provider_id is not null)
      or (content_type in ('FINAL_SCORE', 'MATCH_PREVIEW') and team_provider_id is null)
    ),
  add constraint touchline_social_drafts_041_input_check
    check (content_type not in ('LINEUP', 'MATCH_PREVIEW') or input_checksum = source_checksum),
  add constraint touchline_social_drafts_041_render_path_check
    check (
      render_path = case content_type
        when 'LINEUP' then '/visual-qa/social-lineup?fixtureId=' || fixture_provider_id
          || '&teamId=' || team_provider_id || '&locale=' || locale || '&revision=' || revision::text
        when 'FINAL_SCORE' then '/visual-qa/social-final-score?fixtureId=' || fixture_provider_id
          || '&locale=' || locale || '&revision=' || revision::text
        when 'MATCH_PREVIEW' then '/visual-qa/social-match-preview?fixtureId=' || fixture_provider_id
          || '&locale=' || locale || '&revision=' || revision::text
      end
    );

commit;
