-- Rollback candidate for the unapplied QA-only 040 social DRAFT executor.
-- It refuses to discard executor history. Pause external schedulers/runners,
-- prove both tables empty, then execute only against the canonical QA project.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

lock table public.touchline_social_executor_cycles in access exclusive mode;
lock table public.touchline_social_generation_jobs in access exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.touchline_social_executor_cycles
    where lease_token is not null
      and lease_expires_at > clock_timestamp()
  ) then
    raise exception 'TL_SOCIAL_EXECUTOR_040_ROLLBACK_ACTIVE_LEASE';
  end if;
  if exists (select 1 from public.touchline_social_generation_jobs limit 1)
     or exists (select 1 from public.touchline_social_executor_cycles limit 1) then
    raise exception 'TL_SOCIAL_EXECUTOR_040_ROLLBACK_REQUIRES_EMPTY_AUDIT_TABLES';
  end if;
end
$$;

drop trigger if exists touchline_social_040_review_intent_gate
  on public.touchline_social_review_intents;
drop trigger if exists touchline_social_040_draft_approval_gate
  on public.touchline_social_publication_drafts;

drop trigger if exists touchline_social_generation_jobs_guard
  on public.touchline_social_generation_jobs;
drop trigger if exists touchline_social_executor_cycles_guard
  on public.touchline_social_executor_cycles;

drop function if exists public.touchline_social_complete_generation_job(uuid, uuid, uuid, text, text, uuid);
drop function if exists public.touchline_social_guard_executor_draft_approval();
drop function if exists public.touchline_social_guard_executor_review_intent();
drop function if exists public.touchline_social_assert_executor_approval_gate(uuid);
drop function if exists public.touchline_social_renew_generation_job(uuid, uuid, uuid);
drop function if exists public.touchline_social_claim_generation_job(uuid);
drop function if exists public.touchline_social_enqueue_generation_job(uuid, text, text, text, timestamptz, timestamptz, text, jsonb, text);
drop function if exists public.touchline_social_complete_executor_cycle(text, uuid, text, text, integer);
drop function if exists public.touchline_social_renew_executor_cycle(text, uuid);
drop function if exists public.touchline_social_claim_executor_cycle(text);
drop function if exists public.touchline_social_guard_generation_job_mutation();
drop function if exists public.touchline_social_guard_executor_cycle_mutation();

drop table public.touchline_social_generation_jobs;
drop table public.touchline_social_executor_cycles;

commit;
