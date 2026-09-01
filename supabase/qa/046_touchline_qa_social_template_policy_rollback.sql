-- QA-only rollback for module 046. Fails closed once policy activity exists.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_social_template_versions') is null
     or pg_catalog.to_regclass('public.touchline_social_template_review_intents') is null
     or pg_catalog.to_regclass('public.touchline_social_delivery_controls') is null
     or pg_catalog.to_regclass('public.touchline_social_template_policy_cycles') is null
     or pg_catalog.to_regclass('public.touchline_social_auto_publish_candidates') is null
     or pg_catalog.to_regclass('public.touchline_social_template_policy_audit') is null then
    raise exception 'TL_SOCIAL_046_ROLLBACK_SCHEMA_MISSING';
  end if;
end
$$;

lock table public.touchline_social_template_versions in access exclusive mode;
lock table public.touchline_social_template_review_intents in access exclusive mode;
lock table public.touchline_social_delivery_controls in access exclusive mode;
lock table public.touchline_social_template_policy_cycles in access exclusive mode;
lock table public.touchline_social_auto_publish_candidates in access exclusive mode;
lock table public.touchline_social_template_policy_audit in access exclusive mode;

do $$
begin
  if exists(select 1 from public.touchline_social_template_policy_cycles where lease_token is not null) then
    raise exception 'TL_SOCIAL_046_ROLLBACK_ACTIVE_LEASE';
  end if;
  if exists(select 1 from public.touchline_social_template_versions)
     or exists(select 1 from public.touchline_social_template_review_intents)
     or exists(select 1 from public.touchline_social_auto_publish_candidates)
     or exists(select 1 from public.touchline_social_template_policy_audit)
     or exists(
       select 1 from public.touchline_social_delivery_controls
       where kill_switch_engaged is distinct from true
          or daily_quota is not null
          or minimum_gap_seconds is not null
          or outbound_mode<>'DISABLED'
          or reason_code<>'NOT_OPERATIONALLY_AUTHORISED'
          or updated_by is not null
     ) then
    raise exception 'TL_SOCIAL_046_ROLLBACK_NONEMPTY';
  end if;
end
$$;

drop function if exists public.touchline_social_046_admin_status();
drop function if exists public.touchline_social_046_read_template_for_review(uuid);
drop function if exists public.touchline_social_046_reconcile_candidates(integer);
drop function if exists public.touchline_social_046_evaluate_draft(uuid,text,text,timestamptz,timestamptz);
drop function if exists public.touchline_social_046_generation_is_current(uuid);
drop function if exists public.touchline_social_046_set_delivery_control(text,boolean,integer,integer,uuid,text);
drop function if exists public.touchline_social_046_set_template_state(uuid,text,text,uuid,text);
drop function if exists public.touchline_social_046_approve_template(uuid,uuid,text,text,text,text,uuid);
drop function if exists public.touchline_social_046_issue_template_intent(uuid,text,text,text,text,uuid);
drop function if exists public.touchline_social_046_register_template(jsonb,uuid);
drop function if exists public.touchline_social_046_complete_cycle(text,uuid,text,text,integer);
drop function if exists public.touchline_social_046_renew_cycle(text,uuid);
drop function if exists public.touchline_social_046_claim_cycle(text);
drop function if exists public.touchline_social_046_rendered_fields_checksum(text[]);
drop function if exists public.touchline_social_046_template_identity_checksum(text,text,text,integer,integer,text,text[],text,text,text,text);
drop function if exists public.touchline_social_046_audit(uuid,text,uuid,uuid,jsonb,jsonb,text);

drop trigger if exists touchline_social_template_policy_audit_guard on public.touchline_social_template_policy_audit;
drop trigger if exists touchline_social_auto_publish_candidates_guard on public.touchline_social_auto_publish_candidates;
drop trigger if exists touchline_social_delivery_controls_guard on public.touchline_social_delivery_controls;
drop trigger if exists touchline_social_template_policy_cycles_guard on public.touchline_social_template_policy_cycles;
drop trigger if exists touchline_social_template_review_intents_guard on public.touchline_social_template_review_intents;
drop trigger if exists touchline_social_template_versions_guard on public.touchline_social_template_versions;
drop function if exists public.touchline_social_046_guard_audit();
drop function if exists public.touchline_social_046_guard_mutation();

drop table public.touchline_social_template_policy_audit;
drop table public.touchline_social_auto_publish_candidates;
drop table public.touchline_social_delivery_controls;
drop table public.touchline_social_template_policy_cycles;
drop table public.touchline_social_template_review_intents;
drop table public.touchline_social_template_versions;

commit;
