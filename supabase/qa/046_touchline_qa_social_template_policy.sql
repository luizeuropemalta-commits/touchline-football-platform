-- QA-only template-version approval and automatic-delivery policy extending frozen 039-045.
-- This module creates internal policy eligibility only. It contains no Meta/Instagram connector,
-- credential, dispatch worker or external request. Local/shadow candidate until second audit.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_social_publication_drafts') is null
     or pg_catalog.to_regclass('public.touchline_social_dispatch_attempts') is null
     or pg_catalog.to_regclass('public.touchline_social_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_social_match_preview_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_social_final_result_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_social_confirmed_event_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_social_ranking_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_club_social_posts') is null
     or pg_catalog.to_regclass('public.touchline_social_template_versions') is not null
     or pg_catalog.to_regclass('public.touchline_social_template_review_intents') is not null
     or pg_catalog.to_regclass('public.touchline_social_delivery_controls') is not null
     or pg_catalog.to_regclass('public.touchline_social_template_policy_cycles') is not null
     or pg_catalog.to_regclass('public.touchline_social_auto_publish_candidates') is not null
     or pg_catalog.to_regclass('public.touchline_social_template_policy_audit') is not null then
    raise exception 'TL_SOCIAL_TEMPLATE_POLICY_046_SCHEMA_PRECONDITION_FAILED';
  end if;
end
$$;

create table public.touchline_social_template_versions (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in (
    'LINEUP','MATCH_PREVIEW','FULL_TIME','FINAL_SCORE','GOAL_CONFIRMED','RED_CARD_CONFIRMED',
    'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL',
    'GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO'
  )),
  placement text not null check (placement in ('INSTAGRAM_FEED','INSTAGRAM_STORY')),
  locale text not null check (locale = 'en-GB'),
  width integer not null check (width = 1080),
  height integer not null check (
    (placement='INSTAGRAM_FEED' and height=1350)
    or (placement='INSTAGRAM_STORY' and height=1920)
  ),
  template_version text not null check (template_version ~ '^[A-Za-z0-9._-]{1,160}$'),
  rendered_fields text[] not null check (
    coalesce(array_length(rendered_fields,1),0) between 1 and 64
    and array_to_string(rendered_fields,',') ~ '^[A-Za-z][A-Za-z0-9._-]{0,79}(,[A-Za-z][A-Za-z0-9._-]{0,79}){0,63}$'
  ),
  rendered_fields_checksum text not null check (rendered_fields_checksum ~ '^sha256:[0-9a-f]{64}$'),
  visual_template_checksum text not null check (visual_template_checksum ~ '^sha256:[0-9a-f]{64}$'),
  base_copy_checksum text not null check (base_copy_checksum ~ '^sha256:[0-9a-f]{64}$'),
  lexicon_checksum text not null check (lexicon_checksum ~ '^sha256:[0-9a-f]{64}$'),
  template_identity_checksum text not null unique check (template_identity_checksum ~ '^sha256:[0-9a-f]{64}$'),
  exemplar_draft_id uuid not null references public.touchline_social_publication_drafts(id) on delete restrict,
  exemplar_manifest_checksum text not null check (exemplar_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  exemplar_artifact_checksum text not null check (exemplar_artifact_checksum ~ '^sha256:[0-9a-f]{64}$'),
  exemplar_caption_checksum text not null check (exemplar_caption_checksum ~ '^sha256:[0-9a-f]{64}$'),
  artwork_template_approval_state text not null default 'TEMPLATE_APPROVAL_REQUIRED'
    check (artwork_template_approval_state in ('TEMPLATE_APPROVAL_REQUIRED','TEMPLATE_APPROVED')),
  caption_template_approval_state text not null default 'TEMPLATE_APPROVAL_REQUIRED'
    check (caption_template_approval_state in ('TEMPLATE_APPROVAL_REQUIRED','TEMPLATE_APPROVED')),
  state text not null default 'TEMPLATE_APPROVAL_REQUIRED' check (state in (
    'TEMPLATE_APPROVAL_REQUIRED','TEMPLATE_APPROVED','AUTO_PUBLISH_ENABLED','PAUSED','REVOKED'
  )),
  artwork_approved_at timestamptz,
  artwork_approved_by uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  caption_approved_at timestamptz,
  caption_approved_by uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  auto_publish_enabled_at timestamptz,
  auto_publish_enabled_by uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  paused_at timestamptz,
  paused_by uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (content_type,placement,locale,template_version),
  check ((artwork_template_approval_state='TEMPLATE_APPROVED') = (artwork_approved_at is not null and artwork_approved_by is not null)),
  check ((caption_template_approval_state='TEMPLATE_APPROVED') = (caption_approved_at is not null and caption_approved_by is not null)),
  check (
    (state='TEMPLATE_APPROVAL_REQUIRED' and (artwork_template_approval_state='TEMPLATE_APPROVAL_REQUIRED' or caption_template_approval_state='TEMPLATE_APPROVAL_REQUIRED'))
    or (state='TEMPLATE_APPROVED' and artwork_template_approval_state='TEMPLATE_APPROVED' and caption_template_approval_state='TEMPLATE_APPROVED')
    or (state='AUTO_PUBLISH_ENABLED' and artwork_template_approval_state='TEMPLATE_APPROVED' and caption_template_approval_state='TEMPLATE_APPROVED' and auto_publish_enabled_at is not null and auto_publish_enabled_by is not null)
    or (state='PAUSED' and artwork_template_approval_state='TEMPLATE_APPROVED' and caption_template_approval_state='TEMPLATE_APPROVED' and paused_at is not null and paused_by is not null)
    or (state='REVOKED' and revoked_at is not null and revoked_by is not null)
  )
);

create table public.touchline_social_template_review_intents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.touchline_social_template_versions(id) on delete restrict,
  review_kind text not null check (review_kind in ('ARTWORK','CAPTION')),
  actor_id uuid not null references public.touchline_social_owner_approvers(user_id) on delete restrict,
  expected_template_identity_checksum text not null check (expected_template_identity_checksum ~ '^sha256:[0-9a-f]{64}$'),
  expected_content_checksum text not null check (expected_content_checksum ~ '^sha256:[0-9a-f]{64}$'),
  expected_exemplar_manifest_checksum text not null check (expected_exemplar_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at and (consumed_at is null or consumed_at >= created_at))
);

create table public.touchline_social_delivery_controls (
  scope_key text primary key check (scope_key='GLOBAL' or scope_key ~ '^CONTENT_TYPE:[A-Z0-9_]{1,80}$'),
  content_type text unique check (
    (scope_key='GLOBAL' and content_type is null)
    or (scope_key='CONTENT_TYPE:'||content_type and content_type in (
      'LINEUP','MATCH_PREVIEW','FULL_TIME','FINAL_SCORE','GOAL_CONFIRMED','RED_CARD_CONFIRMED',
      'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL',
      'GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO'
    ))
  ),
  kill_switch_engaged boolean not null default true,
  daily_quota integer check (daily_quota is null or daily_quota between 1 and 1000),
  minimum_gap_seconds integer check (minimum_gap_seconds is null or minimum_gap_seconds between 0 and 86400),
  outbound_mode text not null default 'DISABLED' check (outbound_mode='DISABLED'),
  reason_code text not null default 'NOT_OPERATIONALLY_AUTHORISED' check (reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  updated_by uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.touchline_social_delivery_controls (scope_key,content_type)
values ('GLOBAL',null);
insert into public.touchline_social_delivery_controls (scope_key,content_type)
select 'CONTENT_TYPE:'||content_type,content_type from unnest(array[
  'LINEUP','MATCH_PREVIEW','FULL_TIME','FINAL_SCORE','GOAL_CONFIRMED','RED_CARD_CONFIRMED',
  'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL',
  'GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO'
]::text[]) content_type;

create table public.touchline_social_template_policy_cycles (
  component text primary key check (component in ('REGISTRY','EVALUATOR')),
  lease_token uuid,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  next_eligible_at timestamptz not null default '-infinity'::timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000),
  run_count bigint not null default 0 check (run_count>=0),
  completed_count bigint not null default 0 check (completed_count between 0 and run_count),
  timeout_recovery_count bigint not null default 0 check (timeout_recovery_count>=0),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_outcome text check (last_outcome is null or last_outcome in ('SUCCESS','FAILURE')),
  last_error_code text check (last_error_code is null or last_error_code~'^[A-Z0-9_:-]{1,160}$'),
  last_items_processed integer not null default 0 check (last_items_processed between 0 and 1000),
  updated_at timestamptz not null default clock_timestamp(),
  check ((lease_token is null and lease_expires_at is null and lease_heartbeat_at is null)
    or (lease_token is not null and lease_expires_at is not null and lease_heartbeat_at is not null)),
  check ((last_outcome='SUCCESS' and last_error_code is null)
    or (last_outcome='FAILURE' and last_error_code is not null) or last_outcome is null)
);
insert into public.touchline_social_template_policy_cycles(component) values('REGISTRY'),('EVALUATOR');

create table public.touchline_social_auto_publish_candidates (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.touchline_social_publication_drafts(id) on delete restrict,
  draft_revision integer not null check (draft_revision > 0),
  template_id uuid not null references public.touchline_social_template_versions(id) on delete restrict,
  template_identity_checksum text not null check (template_identity_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_revision_checksum text not null check (source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  manifest_checksum text not null check (manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  artifact_checksum text not null check (artifact_checksum ~ '^sha256:[0-9a-f]{64}$'),
  caption_checksum text not null check (caption_checksum ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key text not null unique check (idempotency_key ~ '^sha256:[0-9a-f]{64}$'),
  state text not null check (state in ('READY','BLOCKED','SKIPPED','EXPIRED','SUPERSEDED','DELIVERY_UNKNOWN')),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  scheduled_at timestamptz,
  eligible_at timestamptz not null,
  generated_at timestamptz not null,
  approved_template_version text not null,
  queued_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (draft_id,draft_revision),
  foreign key (draft_id,draft_revision) references public.touchline_social_publication_drafts(id,revision) on delete restrict,
  check (
    (state='READY' and reason_code='POLICY_READY_OUTBOUND_DISABLED' and queued_at is not null and published_at is null)
    or (state='BLOCKED' and queued_at is null and published_at is null)
    or (state in ('SKIPPED','EXPIRED','SUPERSEDED','DELIVERY_UNKNOWN') and published_at is null)
  )
);
create index touchline_social_auto_publish_candidates_state_idx
  on public.touchline_social_auto_publish_candidates(state,eligible_at,id);

create table public.touchline_social_template_policy_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.touchline_social_owner_approvers(user_id) on delete restrict,
  action text not null check (action ~ '^[A-Z0-9_:-]{1,160}$'),
  template_id uuid,
  candidate_id uuid,
  before_state jsonb not null,
  after_state jsonb not null,
  reason_code text not null check (reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.touchline_social_template_versions enable row level security;
alter table public.touchline_social_template_versions force row level security;
alter table public.touchline_social_template_review_intents enable row level security;
alter table public.touchline_social_template_review_intents force row level security;
alter table public.touchline_social_delivery_controls enable row level security;
alter table public.touchline_social_delivery_controls force row level security;
alter table public.touchline_social_template_policy_cycles enable row level security;
alter table public.touchline_social_template_policy_cycles force row level security;
alter table public.touchline_social_auto_publish_candidates enable row level security;
alter table public.touchline_social_auto_publish_candidates force row level security;
alter table public.touchline_social_template_policy_audit enable row level security;
alter table public.touchline_social_template_policy_audit force row level security;

revoke all on public.touchline_social_template_versions from public,anon,authenticated,service_role;
revoke all on public.touchline_social_template_review_intents from public,anon,authenticated,service_role;
revoke all on public.touchline_social_delivery_controls from public,anon,authenticated,service_role;
revoke all on public.touchline_social_template_policy_cycles from public,anon,authenticated,service_role;
revoke all on public.touchline_social_auto_publish_candidates from public,anon,authenticated,service_role;
revoke all on public.touchline_social_template_policy_audit from public,anon,authenticated,service_role;

create or replace function public.touchline_social_046_guard_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(current_setting('touchline.social_046_transition',true),'') not in (
    'register','intent','approve','state','control','cycle','evaluate','reconcile','audit'
  ) then raise exception 'TL_SOCIAL_TEMPLATE_POLICY_DIRECT_MUTATION_FORBIDDEN'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

create or replace function public.touchline_social_046_guard_audit()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' or coalesce(current_setting('touchline.social_046_transition',true),'')<>'audit' then
    raise exception 'TL_SOCIAL_TEMPLATE_POLICY_AUDIT_IMMUTABLE';
  end if;
  return new;
end
$$;

create trigger touchline_social_template_versions_guard before insert or update or delete
on public.touchline_social_template_versions for each row execute function public.touchline_social_046_guard_mutation();
create trigger touchline_social_template_review_intents_guard before insert or update or delete
on public.touchline_social_template_review_intents for each row execute function public.touchline_social_046_guard_mutation();
create trigger touchline_social_delivery_controls_guard before insert or update or delete
on public.touchline_social_delivery_controls for each row execute function public.touchline_social_046_guard_mutation();
create trigger touchline_social_template_policy_cycles_guard before insert or update or delete
on public.touchline_social_template_policy_cycles for each row execute function public.touchline_social_046_guard_mutation();
create trigger touchline_social_auto_publish_candidates_guard before insert or update or delete
on public.touchline_social_auto_publish_candidates for each row execute function public.touchline_social_046_guard_mutation();
create trigger touchline_social_template_policy_audit_guard before insert or update or delete
on public.touchline_social_template_policy_audit for each row execute function public.touchline_social_046_guard_audit();

create or replace function public.touchline_social_046_audit(
  p_actor_id uuid,p_action text,p_template_id uuid,p_candidate_id uuid,
  p_before jsonb,p_after jsonb,p_reason_code text
)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.set_config('touchline.social_046_transition','audit',true);
  insert into public.touchline_social_template_policy_audit(
    actor_id,action,template_id,candidate_id,before_state,after_state,reason_code
  ) values (p_actor_id,p_action,p_template_id,p_candidate_id,coalesce(p_before,'null'::jsonb),coalesce(p_after,'null'::jsonb),p_reason_code);
end
$$;

create or replace function public.touchline_social_046_template_identity_checksum(
  p_content_type text,p_placement text,p_locale text,p_width integer,p_height integer,
  p_template_version text,p_rendered_fields text[],p_rendered_fields_checksum text,
  p_visual_checksum text,p_copy_checksum text,p_lexicon_checksum text
)
returns text language sql immutable security definer set search_path='' as $$
  select 'sha256:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    array_to_string(array[
      'touchline-social-template-policy-v1',p_content_type,p_placement,p_locale,p_width::text,p_height::text,
      p_template_version,array_to_string(p_rendered_fields,','),p_rendered_fields_checksum,
      p_visual_checksum,p_copy_checksum,p_lexicon_checksum
    ],chr(31)),'UTF8'),'sha256'),'hex')
$$;

create or replace function public.touchline_social_046_rendered_fields_checksum(p_fields text[])
returns text language sql immutable security definer set search_path='' as $$
  select 'sha256:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(array_to_string(p_fields,chr(31)),'UTF8'),'sha256'),'hex')
$$;

create or replace function public.touchline_social_046_claim_cycle(p_component text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_cycle public.touchline_social_template_policy_cycles%rowtype; v_token uuid; v_now timestamptz:=clock_timestamp();
begin
  if p_component not in ('REGISTRY','EVALUATOR') then raise exception 'TL_SOCIAL_TEMPLATE_POLICY_CYCLE_FORBIDDEN'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-cycle:'||p_component,0));
  select * into v_cycle from public.touchline_social_template_policy_cycles where component=p_component for update;
  if v_cycle.lease_token is not null and v_cycle.lease_expires_at>v_now then return jsonb_build_object('outcome','busy','leaseExpiresAt',v_cycle.lease_expires_at); end if;
  if v_cycle.next_eligible_at>v_now then return jsonb_build_object('outcome','backoff','nextEligibleAt',v_cycle.next_eligible_at); end if;
  v_token:=gen_random_uuid();
  perform pg_catalog.set_config('touchline.social_046_transition','cycle',true);
  update public.touchline_social_template_policy_cycles set lease_token=v_token,lease_expires_at=v_now+interval '2 minutes',lease_heartbeat_at=v_now,
    last_started_at=v_now,run_count=run_count+1,timeout_recovery_count=timeout_recovery_count+case when lease_token is null then 0 else 1 end,updated_at=v_now where component=p_component;
  return jsonb_build_object('outcome','claimed','leaseToken',v_token,'leaseExpiresAt',v_now+interval '2 minutes');
end
$$;

create or replace function public.touchline_social_046_renew_cycle(p_component text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp();
begin
  if p_component not in ('REGISTRY','EVALUATOR') or p_lease_token is null then raise exception 'TL_SOCIAL_TEMPLATE_POLICY_CYCLE_RENEW_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-cycle:'||p_component,0));
  perform pg_catalog.set_config('touchline.social_046_transition','cycle',true);
  update public.touchline_social_template_policy_cycles set lease_expires_at=v_now+interval '2 minutes',lease_heartbeat_at=v_now,updated_at=v_now
  where component=p_component and lease_token=p_lease_token and lease_expires_at>v_now;
  if not found then raise exception 'TL_SOCIAL_TEMPLATE_POLICY_CYCLE_LEASE_INVALID'; end if;
  return jsonb_build_object('outcome','renewed','leaseExpiresAt',v_now+interval '2 minutes');
end
$$;

create or replace function public.touchline_social_046_complete_cycle(p_component text,p_lease_token uuid,p_outcome text,p_error_code text,p_items integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_cycle public.touchline_social_template_policy_cycles%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if p_component not in ('REGISTRY','EVALUATOR') or p_lease_token is null or p_outcome not in ('SUCCESS','FAILURE') or coalesce(p_items,-1) not between 0 and 1000
     or (p_outcome='SUCCESS' and p_error_code is not null) or (p_outcome='FAILURE' and coalesce(p_error_code,'')!~'^[A-Z0-9_:-]{1,160}$') then
    raise exception 'TL_SOCIAL_TEMPLATE_POLICY_CYCLE_COMPLETION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-cycle:'||p_component,0));
  select * into v_cycle from public.touchline_social_template_policy_cycles where component=p_component and lease_token=p_lease_token and lease_expires_at>v_now for update;
  if not found then raise exception 'TL_SOCIAL_TEMPLATE_POLICY_CYCLE_LEASE_INVALID'; end if;
  perform pg_catalog.set_config('touchline.social_046_transition','cycle',true);
  update public.touchline_social_template_policy_cycles set lease_token=null,lease_expires_at=null,lease_heartbeat_at=null,
    next_eligible_at=case when p_outcome='SUCCESS' then v_now else v_now+make_interval(secs=>least(300,15*power(2,least(consecutive_failures,4))::integer)) end,
    consecutive_failures=case when p_outcome='SUCCESS' then 0 else least(consecutive_failures+1,1000) end,
    completed_count=completed_count+1,last_completed_at=v_now,last_success_at=case when p_outcome='SUCCESS' then v_now else last_success_at end,
    last_failure_at=case when p_outcome='FAILURE' then v_now else last_failure_at end,last_outcome=p_outcome,last_error_code=p_error_code,
    last_items_processed=p_items,updated_at=v_now where component=p_component;
  return jsonb_build_object('outcome','completed');
end
$$;

create or replace function public.touchline_social_046_register_template(p_template jsonb,p_exemplar_draft_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype; v_template public.touchline_social_template_versions%rowtype;
  v_fields text[]; v_identity text; v_rendered_checksum text;
begin
  if jsonb_typeof(p_template)<>'object' or p_exemplar_draft_id is null then raise exception 'TL_SOCIAL_TEMPLATE_REGISTER_INPUT_INVALID'; end if;
  select array_agg(value order by value) into v_fields from jsonb_array_elements_text(p_template->'renderedFields') value;
  if coalesce(array_length(v_fields,1),0)<1 or (select count(*) from unnest(v_fields) f)<>(select count(distinct f) from unnest(v_fields) f) then
    raise exception 'TL_SOCIAL_TEMPLATE_RENDERED_FIELDS_INVALID';
  end if;
  v_rendered_checksum:=public.touchline_social_046_rendered_fields_checksum(v_fields);
  if v_rendered_checksum is distinct from p_template->>'renderedFieldsChecksum' then raise exception 'TL_SOCIAL_TEMPLATE_RENDERED_FIELDS_CHECKSUM_MISMATCH'; end if;
  v_identity:=public.touchline_social_046_template_identity_checksum(
    p_template->>'contentType',p_template->>'placement',p_template->>'locale',(p_template->>'width')::integer,(p_template->>'height')::integer,
    p_template->>'templateVersion',v_fields,v_rendered_checksum,p_template->>'visualTemplateChecksum',p_template->>'baseCopyChecksum',p_template->>'lexiconChecksum');
  if v_identity is distinct from p_template->>'templateIdentityChecksum' then raise exception 'TL_SOCIAL_TEMPLATE_IDENTITY_CHECKSUM_MISMATCH'; end if;
  select * into v_draft from public.touchline_social_publication_drafts where id=p_exemplar_draft_id for share;
  if not found or v_draft.content_type is distinct from p_template->>'contentType'
     or v_draft.placement is distinct from p_template->>'placement' or v_draft.locale is distinct from p_template->>'locale'
     or v_draft.width is distinct from (p_template->>'width')::integer or v_draft.height is distinct from (p_template->>'height')::integer
     or v_draft.template_version is distinct from p_template->>'templateVersion'
     or v_draft.approval_state<>'APPROVED' or v_draft.artwork_approval_state<>'APPROVED' or v_draft.caption_approval_state<>'APPROVED'
     or v_draft.approved_artifact_checksum is distinct from v_draft.artifact_checksum
     or v_draft.approved_caption_checksum is distinct from v_draft.caption_checksum
     or v_draft.approved_manifest_checksum is distinct from v_draft.manifest_checksum
     or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum)
     or not public.touchline_social_046_generation_is_current(v_draft.id) then
    raise exception 'TL_SOCIAL_TEMPLATE_EXEMPLAR_NOT_CURRENT_APPROVED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-template:'||(p_template->>'contentType')||':'||(p_template->>'placement')||':'||(p_template->>'locale')||':'||(p_template->>'templateVersion'),0));
  select * into v_template from public.touchline_social_template_versions where content_type=p_template->>'contentType' and placement=p_template->>'placement' and locale=p_template->>'locale' and template_version=p_template->>'templateVersion' for update;
  if found then
    if v_template.template_identity_checksum is distinct from v_identity or v_template.exemplar_draft_id is distinct from p_exemplar_draft_id then
      raise exception 'TL_SOCIAL_TEMPLATE_VERSION_REUSE_FORBIDDEN';
    end if;
    return jsonb_build_object('outcome','existing','templateId',v_template.id,'state',v_template.state);
  end if;
  perform pg_catalog.set_config('touchline.social_046_transition','register',true);
  insert into public.touchline_social_template_versions(
    content_type,placement,locale,width,height,template_version,rendered_fields,rendered_fields_checksum,
    visual_template_checksum,base_copy_checksum,lexicon_checksum,template_identity_checksum,
    exemplar_draft_id,exemplar_manifest_checksum,exemplar_artifact_checksum,exemplar_caption_checksum
  ) values (
    p_template->>'contentType',p_template->>'placement',p_template->>'locale',(p_template->>'width')::integer,(p_template->>'height')::integer,
    p_template->>'templateVersion',v_fields,v_rendered_checksum,p_template->>'visualTemplateChecksum',p_template->>'baseCopyChecksum',
    p_template->>'lexiconChecksum',v_identity,v_draft.id,v_draft.manifest_checksum,v_draft.artifact_checksum,v_draft.caption_checksum
  ) returning * into v_template;
  perform public.touchline_social_046_audit(null,'TEMPLATE_REGISTERED',v_template.id,null,null,to_jsonb(v_template),'TEMPLATE_APPROVAL_REQUIRED');
  return jsonb_build_object('outcome','registered','templateId',v_template.id,'state',v_template.state);
end
$$;

create or replace function public.touchline_social_046_issue_template_intent(
  p_template_id uuid,p_review_kind text,p_expected_template_identity_checksum text,
  p_expected_content_checksum text,p_expected_exemplar_manifest_checksum text,p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_template public.touchline_social_template_versions%rowtype; v_draft public.touchline_social_publication_drafts%rowtype; v_intent uuid;
begin
  if p_review_kind not in ('ARTWORK','CAPTION') then raise exception 'TL_SOCIAL_TEMPLATE_REVIEW_KIND_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-template:'||p_template_id::text,0));
  select * into v_template from public.touchline_social_template_versions where id=p_template_id for update;
  if not found or v_template.state in ('REVOKED','AUTO_PUBLISH_ENABLED','PAUSED')
     or v_template.template_identity_checksum is distinct from p_expected_template_identity_checksum
     or v_template.exemplar_manifest_checksum is distinct from p_expected_exemplar_manifest_checksum
     or (p_review_kind='ARTWORK' and (v_template.artwork_template_approval_state<>'TEMPLATE_APPROVAL_REQUIRED' or v_template.visual_template_checksum is distinct from p_expected_content_checksum))
     or (p_review_kind='CAPTION' and (v_template.caption_template_approval_state<>'TEMPLATE_APPROVAL_REQUIRED' or v_template.base_copy_checksum is distinct from p_expected_content_checksum)) then
    raise exception 'TL_SOCIAL_TEMPLATE_REVIEW_INTENT_MISMATCH';
  end if;
  select * into v_draft from public.touchline_social_publication_drafts where id=v_template.exemplar_draft_id for share;
  if not found or v_draft.approval_state<>'APPROVED' or v_draft.approved_manifest_checksum is distinct from v_template.exemplar_manifest_checksum
     or v_draft.approved_artifact_checksum is distinct from v_template.exemplar_artifact_checksum
     or v_draft.approved_caption_checksum is distinct from v_template.exemplar_caption_checksum
     or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum)
     or not public.touchline_social_046_generation_is_current(v_draft.id) then
    raise exception 'TL_SOCIAL_TEMPLATE_EXEMPLAR_STALE';
  end if;
  perform pg_catalog.set_config('touchline.social_046_transition','intent',true);
  insert into public.touchline_social_template_review_intents(template_id,review_kind,actor_id,expected_template_identity_checksum,expected_content_checksum,expected_exemplar_manifest_checksum,expires_at)
  values(p_template_id,p_review_kind,p_actor_id,p_expected_template_identity_checksum,p_expected_content_checksum,p_expected_exemplar_manifest_checksum,clock_timestamp()+interval '5 minutes') returning id into v_intent;
  return jsonb_build_object('outcome','issued','intentId',v_intent,'expiresInSeconds',300);
end
$$;

create or replace function public.touchline_social_046_approve_template(
  p_intent_id uuid,p_template_id uuid,p_review_kind text,p_expected_template_identity_checksum text,
  p_expected_content_checksum text,p_expected_exemplar_manifest_checksum text,p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_template public.touchline_social_template_versions%rowtype; v_intent public.touchline_social_template_review_intents%rowtype; v_before jsonb; v_after jsonb;
begin
  perform public.touchline_social_require_owner_actor(p_actor_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-template:'||p_template_id::text,0));
  select * into v_template from public.touchline_social_template_versions where id=p_template_id for update;
  select * into v_intent from public.touchline_social_template_review_intents where id=p_intent_id for update;
  if v_template.id is null or v_intent.id is null or v_intent.template_id is distinct from p_template_id
     or v_intent.review_kind is distinct from p_review_kind or v_intent.actor_id is distinct from p_actor_id
     or v_intent.consumed_at is not null or v_intent.expires_at<=clock_timestamp()
     or v_intent.expected_template_identity_checksum is distinct from p_expected_template_identity_checksum
     or v_intent.expected_content_checksum is distinct from p_expected_content_checksum
     or v_intent.expected_exemplar_manifest_checksum is distinct from p_expected_exemplar_manifest_checksum
     or v_template.template_identity_checksum is distinct from p_expected_template_identity_checksum
     or v_template.exemplar_manifest_checksum is distinct from p_expected_exemplar_manifest_checksum
     or v_template.state in ('AUTO_PUBLISH_ENABLED','PAUSED','REVOKED')
     or not exists (
       select 1 from public.touchline_social_publication_drafts d
       where d.id=v_template.exemplar_draft_id
         and d.approval_state='APPROVED'
         and d.approved_manifest_checksum=v_template.exemplar_manifest_checksum
         and public.touchline_social_source_revision_is_current(d.source_revision_manifest,d.source_revision_checksum)
         and public.touchline_social_046_generation_is_current(d.id)
     )
     or (p_review_kind='ARTWORK' and (v_template.artwork_template_approval_state<>'TEMPLATE_APPROVAL_REQUIRED' or v_template.visual_template_checksum is distinct from p_expected_content_checksum))
     or (p_review_kind='CAPTION' and (v_template.caption_template_approval_state<>'TEMPLATE_APPROVAL_REQUIRED' or v_template.base_copy_checksum is distinct from p_expected_content_checksum)) then
    raise exception 'TL_SOCIAL_TEMPLATE_APPROVAL_MISMATCH';
  end if;
  v_before:=to_jsonb(v_template);
  perform pg_catalog.set_config('touchline.social_046_transition','approve',true);
  update public.touchline_social_template_review_intents set consumed_at=clock_timestamp() where id=p_intent_id;
  update public.touchline_social_template_versions set
    artwork_template_approval_state=case when p_review_kind='ARTWORK' then 'TEMPLATE_APPROVED' else artwork_template_approval_state end,
    artwork_approved_at=case when p_review_kind='ARTWORK' then clock_timestamp() else artwork_approved_at end,
    artwork_approved_by=case when p_review_kind='ARTWORK' then p_actor_id else artwork_approved_by end,
    caption_template_approval_state=case when p_review_kind='CAPTION' then 'TEMPLATE_APPROVED' else caption_template_approval_state end,
    caption_approved_at=case when p_review_kind='CAPTION' then clock_timestamp() else caption_approved_at end,
    caption_approved_by=case when p_review_kind='CAPTION' then p_actor_id else caption_approved_by end,
    state=case
      when (p_review_kind='ARTWORK' and caption_template_approval_state='TEMPLATE_APPROVED')
        or (p_review_kind='CAPTION' and artwork_template_approval_state='TEMPLATE_APPROVED') then 'TEMPLATE_APPROVED'
      else 'TEMPLATE_APPROVAL_REQUIRED' end,
    updated_at=clock_timestamp() where id=p_template_id returning to_jsonb(touchline_social_template_versions.*) into v_after;
  perform public.touchline_social_046_audit(p_actor_id,'TEMPLATE_'||p_review_kind||'_APPROVED',p_template_id,null,v_before,v_after,'OWNER_TEMPLATE_APPROVAL');
  return jsonb_build_object('outcome','approved','reviewKind',p_review_kind,'state',v_after->>'state');
end
$$;

create or replace function public.touchline_social_046_set_template_state(
  p_template_id uuid,p_expected_identity_checksum text,p_target_state text,p_actor_id uuid,p_reason_code text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_template public.touchline_social_template_versions%rowtype; v_candidate public.touchline_social_auto_publish_candidates%rowtype;
  v_before jsonb; v_after jsonb; v_candidate_before jsonb; v_candidate_after jsonb; v_blocked integer:=0;
begin
  perform public.touchline_social_require_owner_actor(p_actor_id);
  if p_target_state not in ('AUTO_PUBLISH_ENABLED','PAUSED','REVOKED') or coalesce(p_reason_code,'')!~'^[A-Z0-9_:-]{1,160}$' then
    raise exception 'TL_SOCIAL_TEMPLATE_STATE_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-template:'||p_template_id::text,0));
  select * into v_template from public.touchline_social_template_versions where id=p_template_id for update;
  if not found or v_template.template_identity_checksum is distinct from p_expected_identity_checksum
     or v_template.state='REVOKED'
     or (p_target_state='AUTO_PUBLISH_ENABLED' and (v_template.state not in ('TEMPLATE_APPROVED','PAUSED')
       or v_template.artwork_template_approval_state<>'TEMPLATE_APPROVED' or v_template.caption_template_approval_state<>'TEMPLATE_APPROVED')) then
    raise exception 'TL_SOCIAL_TEMPLATE_STATE_TRANSITION_FORBIDDEN';
  end if;
  v_before:=to_jsonb(v_template);
  perform pg_catalog.set_config('touchline.social_046_transition','state',true);
  update public.touchline_social_template_versions set state=p_target_state,
    auto_publish_enabled_at=case when p_target_state='AUTO_PUBLISH_ENABLED' then clock_timestamp() else auto_publish_enabled_at end,
    auto_publish_enabled_by=case when p_target_state='AUTO_PUBLISH_ENABLED' then p_actor_id else auto_publish_enabled_by end,
    paused_at=case when p_target_state='PAUSED' then clock_timestamp() else paused_at end,
    paused_by=case when p_target_state='PAUSED' then p_actor_id else paused_by end,
    revoked_at=case when p_target_state='REVOKED' then clock_timestamp() else revoked_at end,
    revoked_by=case when p_target_state='REVOKED' then p_actor_id else revoked_by end,
    updated_at=clock_timestamp() where id=p_template_id returning to_jsonb(touchline_social_template_versions.*) into v_after;
  perform public.touchline_social_046_audit(p_actor_id,'TEMPLATE_STATE_CHANGED',p_template_id,null,v_before,v_after,p_reason_code);
  if p_target_state in ('PAUSED','REVOKED') then
    for v_candidate in select * from public.touchline_social_auto_publish_candidates where template_id=p_template_id and state='READY' order by id for update loop
      v_candidate_before:=to_jsonb(v_candidate);
      perform pg_catalog.set_config('touchline.social_046_transition','state',true);
      update public.touchline_social_auto_publish_candidates set state='BLOCKED',reason_code='TEMPLATE_PAUSED_OR_REVOKED',queued_at=null,updated_at=clock_timestamp()
      where id=v_candidate.id returning to_jsonb(touchline_social_auto_publish_candidates.*) into v_candidate_after;
      perform public.touchline_social_046_audit(p_actor_id,'AUTO_PUBLISH_BLOCKED',p_template_id,v_candidate.id,v_candidate_before,v_candidate_after,'TEMPLATE_PAUSED_OR_REVOKED');
      v_blocked:=v_blocked+1;
    end loop;
  end if;
  return jsonb_build_object('outcome','updated','state',p_target_state,'blockedCandidates',v_blocked);
end
$$;

create or replace function public.touchline_social_046_set_delivery_control(
  p_scope_key text,p_kill_switch_engaged boolean,p_daily_quota integer,p_minimum_gap_seconds integer,p_actor_id uuid,p_reason_code text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_control public.touchline_social_delivery_controls%rowtype; v_candidate public.touchline_social_auto_publish_candidates%rowtype;
  v_before jsonb; v_after jsonb; v_candidate_before jsonb; v_candidate_after jsonb; v_blocked integer:=0;
begin
  perform public.touchline_social_require_owner_actor(p_actor_id);
  if p_kill_switch_engaged is null or p_daily_quota is not null and p_daily_quota not between 1 and 1000
     or p_minimum_gap_seconds is not null and p_minimum_gap_seconds not between 0 and 86400
     or coalesce(p_reason_code,'')!~'^[A-Z0-9_:-]{1,160}$' then raise exception 'TL_SOCIAL_DELIVERY_CONTROL_INPUT_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-control:'||p_scope_key,0));
  select * into v_control from public.touchline_social_delivery_controls where scope_key=p_scope_key for update;
  if not found then raise exception 'TL_SOCIAL_DELIVERY_CONTROL_NOT_FOUND'; end if;
  v_before:=to_jsonb(v_control);
  perform pg_catalog.set_config('touchline.social_046_transition','control',true);
  update public.touchline_social_delivery_controls set kill_switch_engaged=p_kill_switch_engaged,daily_quota=p_daily_quota,
    minimum_gap_seconds=p_minimum_gap_seconds,reason_code=p_reason_code,updated_by=p_actor_id,updated_at=clock_timestamp()
  where scope_key=p_scope_key returning to_jsonb(touchline_social_delivery_controls.*) into v_after;
  perform public.touchline_social_046_audit(p_actor_id,'DELIVERY_CONTROL_CHANGED',null,null,v_before,v_after,p_reason_code);
  if p_kill_switch_engaged then
    for v_candidate in
      select c.* from public.touchline_social_auto_publish_candidates c
      join public.touchline_social_publication_drafts d on d.id=c.draft_id
      where c.state='READY' and (p_scope_key='GLOBAL' or p_scope_key='CONTENT_TYPE:'||d.content_type)
      order by c.id for update of c
    loop
      v_candidate_before:=to_jsonb(v_candidate);
      perform pg_catalog.set_config('touchline.social_046_transition','control',true);
      update public.touchline_social_auto_publish_candidates set state='BLOCKED',reason_code='KILL_SWITCH_ENGAGED',queued_at=null,updated_at=clock_timestamp()
      where id=v_candidate.id returning to_jsonb(touchline_social_auto_publish_candidates.*) into v_candidate_after;
      perform public.touchline_social_046_audit(p_actor_id,'AUTO_PUBLISH_BLOCKED',v_candidate.template_id,v_candidate.id,v_candidate_before,v_candidate_after,'KILL_SWITCH_ENGAGED');
      v_blocked:=v_blocked+1;
    end loop;
  end if;
  return jsonb_build_object('outcome','updated','scopeKey',p_scope_key,'killSwitchEngaged',p_kill_switch_engaged,'blockedCandidates',v_blocked,'outboundMode','DISABLED');
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
  elsif v_draft.content_type in ('GOAL_CONFIRMED','RED_CARD_CONFIRMED') then
    select generated_draft_id into v_current from public.touchline_social_confirmed_event_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and event_provider_id=v_draft.event_provider_id and content_type=v_draft.content_type and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  else
    select generated_draft_id into v_current from public.touchline_social_ranking_generation_jobs where fixture_provider_id=v_draft.fixture_provider_id and scope_provider_id is not distinct from v_draft.scope_provider_id and subject_player_provider_id is not distinct from v_draft.subject_player_provider_id and content_type=v_draft.content_type and template_version=v_draft.template_version and input_checksum=v_draft.input_checksum and source_revision_checksum=v_draft.source_revision_checksum and job_state='COMPLETED';
  end if;
  return v_current is not distinct from v_draft.id;
end
$$;

create or replace function public.touchline_social_046_evaluate_draft(
  p_draft_id uuid,p_rehashed_artifact_checksum text,p_idempotency_key text,p_eligible_at timestamptz default null,p_scheduled_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype; v_template public.touchline_social_template_versions%rowtype;
  v_global public.touchline_social_delivery_controls%rowtype; v_type public.touchline_social_delivery_controls%rowtype;
  v_candidate public.touchline_social_auto_publish_candidates%rowtype; v_now timestamptz:=clock_timestamp(); v_reason text; v_state text;
  v_global_daily integer; v_type_daily integer; v_last timestamptz; v_gap integer; v_expected_idempotency text;
  v_candidate_before jsonb; v_candidate_after jsonb;
begin
  if p_draft_id is null or coalesce(p_rehashed_artifact_checksum,'')!~'^sha256:[0-9a-f]{64}$' or coalesce(p_idempotency_key,'')!~'^sha256:[0-9a-f]{64}$' then
    raise exception 'TL_SOCIAL_AUTO_PUBLISH_EVALUATION_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-046-candidate:'||p_draft_id::text,0));
  select * into v_draft from public.touchline_social_publication_drafts where id=p_draft_id for share;
  if not found or v_draft.approval_state='CANCELLED' or v_draft.artifact_checksum is distinct from p_rehashed_artifact_checksum
     or v_draft.manifest_checksum is null or v_draft.caption_checksum is null
     or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum)
     or not public.touchline_social_046_generation_is_current(v_draft.id) then
    raise exception 'TL_SOCIAL_AUTO_PUBLISH_DYNAMIC_GATE_FAILED';
  end if;
  select * into v_template from public.touchline_social_template_versions where content_type=v_draft.content_type and placement=v_draft.placement and locale=v_draft.locale and template_version=v_draft.template_version for share;
  if not found then raise exception 'TL_SOCIAL_TEMPLATE_NOT_REGISTERED'; end if;
  v_expected_idempotency:='sha256:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(array_to_string(array[
    'TOUCHLINE_OFFICIAL_INSTAGRAM',v_draft.id::text,v_draft.revision::text,v_template.template_identity_checksum,
    v_draft.source_revision_checksum,v_draft.manifest_checksum,v_draft.artifact_checksum,v_draft.caption_checksum
  ],chr(31)),'UTF8'),'sha256'),'hex');
  if v_expected_idempotency is distinct from p_idempotency_key then raise exception 'TL_SOCIAL_AUTO_PUBLISH_IDEMPOTENCY_MISMATCH'; end if;
  if v_template.state<>'AUTO_PUBLISH_ENABLED' or v_template.artwork_template_approval_state<>'TEMPLATE_APPROVED' or v_template.caption_template_approval_state<>'TEMPLATE_APPROVED' then
    v_state:='BLOCKED'; v_reason:='TEMPLATE_AUTO_PUBLISH_NOT_ENABLED';
  end if;
  select * into v_global from public.touchline_social_delivery_controls where scope_key='GLOBAL' for share;
  select * into v_type from public.touchline_social_delivery_controls where scope_key='CONTENT_TYPE:'||v_draft.content_type for share;
  if v_reason is null and (v_global.kill_switch_engaged or v_type.kill_switch_engaged) then v_state:='BLOCKED'; v_reason:='KILL_SWITCH_ENGAGED'; end if;
  if v_reason is null and (v_global.daily_quota is null or v_type.daily_quota is null) then v_state:='BLOCKED'; v_reason:='QUOTA_UNCONFIGURED'; end if;
  if v_reason is null then
    select count(*) into v_global_daily from public.touchline_social_auto_publish_candidates c
    where c.state='READY' and (c.queued_at at time zone 'Europe/Malta')::date=(v_now at time zone 'Europe/Malta')::date
      and not (c.draft_id=v_draft.id and c.draft_revision=v_draft.revision)
    ;
    select count(*) into v_type_daily from public.touchline_social_auto_publish_candidates c
      join public.touchline_social_publication_drafts d on d.id=c.draft_id
    where c.state='READY' and d.content_type=v_draft.content_type
      and (c.queued_at at time zone 'Europe/Malta')::date=(v_now at time zone 'Europe/Malta')::date
      and not (c.draft_id=v_draft.id and c.draft_revision=v_draft.revision);
    if v_global_daily>=v_global.daily_quota or v_type_daily>=v_type.daily_quota then
      v_state:='BLOCKED'; v_reason:='DAILY_QUOTA_EXHAUSTED';
    end if;
  end if;
  v_gap:=greatest(coalesce(v_global.minimum_gap_seconds,0),coalesce(v_type.minimum_gap_seconds,0));
  if v_reason is null and v_draft.placement='INSTAGRAM_FEED' and v_gap>0 then
    select max(c.queued_at) into v_last from public.touchline_social_auto_publish_candidates c join public.touchline_social_publication_drafts d on d.id=c.draft_id where c.state='READY' and d.placement='INSTAGRAM_FEED' and not (c.draft_id=v_draft.id and c.draft_revision=v_draft.revision);
    if v_last is not null and v_last+make_interval(secs=>v_gap)>v_now then v_state:='BLOCKED'; v_reason:='MINIMUM_FEED_GAP_ACTIVE'; end if;
  end if;
  if v_reason is null then v_state:='READY'; v_reason:='POLICY_READY_OUTBOUND_DISABLED'; end if;
  select * into v_candidate from public.touchline_social_auto_publish_candidates
  where draft_id=v_draft.id and draft_revision=v_draft.revision for update;
  if found then
    if v_candidate.idempotency_key is distinct from p_idempotency_key or v_candidate.artifact_checksum is distinct from v_draft.artifact_checksum
       or v_candidate.caption_checksum is distinct from v_draft.caption_checksum or v_candidate.manifest_checksum is distinct from v_draft.manifest_checksum
       or v_candidate.template_identity_checksum is distinct from v_template.template_identity_checksum then
      raise exception 'TL_SOCIAL_AUTO_PUBLISH_IDEMPOTENCY_MISMATCH';
    end if;
    v_candidate_before:=to_jsonb(v_candidate);
    perform pg_catalog.set_config('touchline.social_046_transition','evaluate',true);
    update public.touchline_social_auto_publish_candidates set state=v_state,reason_code=v_reason,scheduled_at=p_scheduled_at,
      eligible_at=coalesce(p_eligible_at,v_now),queued_at=case when v_state='READY' then v_now else null end,updated_at=v_now
    where id=v_candidate.id returning to_jsonb(touchline_social_auto_publish_candidates.*) into v_candidate_after;
    if v_candidate_before is distinct from v_candidate_after then
      perform public.touchline_social_046_audit(null,'AUTO_PUBLISH_REEVALUATED',v_template.id,v_candidate.id,v_candidate_before,v_candidate_after,v_reason);
    end if;
    return jsonb_build_object('outcome','reevaluated','candidateId',v_candidate.id,'state',v_state,'reasonCode',v_reason,'outboundMode','DISABLED');
  end if;
  perform pg_catalog.set_config('touchline.social_046_transition','evaluate',true);
  insert into public.touchline_social_auto_publish_candidates(
    draft_id,draft_revision,template_id,template_identity_checksum,source_revision_checksum,manifest_checksum,
    artifact_checksum,caption_checksum,idempotency_key,state,reason_code,scheduled_at,eligible_at,generated_at,
    approved_template_version,queued_at
  ) values (
    v_draft.id,v_draft.revision,v_template.id,v_template.template_identity_checksum,v_draft.source_revision_checksum,v_draft.manifest_checksum,
    v_draft.artifact_checksum,v_draft.caption_checksum,p_idempotency_key,v_state,v_reason,p_scheduled_at,coalesce(p_eligible_at,v_now),v_draft.generated_at,
    v_template.template_version,case when v_state='READY' then v_now else null end
  ) returning * into v_candidate;
  perform public.touchline_social_046_audit(null,'AUTO_PUBLISH_EVALUATED',v_template.id,v_candidate.id,null,to_jsonb(v_candidate),v_reason);
  return jsonb_build_object('outcome','evaluated','candidateId',v_candidate.id,'state',v_state,'reasonCode',v_reason,'outboundMode','DISABLED');
end
$$;

create or replace function public.touchline_social_046_reconcile_candidates(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_candidate public.touchline_social_auto_publish_candidates%rowtype; v_draft public.touchline_social_publication_drafts%rowtype; v_changed integer:=0; v_unknown integer;
begin
  for v_candidate in select * from public.touchline_social_auto_publish_candidates where state='READY' order by queued_at,id limit least(greatest(coalesce(p_limit,100),1),500) for update skip locked loop
    select * into v_draft from public.touchline_social_publication_drafts where id=v_candidate.draft_id for share;
    if not found or v_draft.revision is distinct from v_candidate.draft_revision or v_draft.artifact_checksum is distinct from v_candidate.artifact_checksum
       or v_draft.caption_checksum is distinct from v_candidate.caption_checksum or v_draft.manifest_checksum is distinct from v_candidate.manifest_checksum
       or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum)
       or not public.touchline_social_046_generation_is_current(v_draft.id) then
      perform pg_catalog.set_config('touchline.social_046_transition','reconcile',true);
      update public.touchline_social_auto_publish_candidates set state='SUPERSEDED',reason_code='SOURCE_OR_DRAFT_SUPERSEDED',updated_at=clock_timestamp() where id=v_candidate.id;
      v_changed:=v_changed+1;
    end if;
  end loop;
  select count(*) into v_unknown from public.touchline_social_dispatch_attempts where state='DELIVERY_UNKNOWN';
  return jsonb_build_object('outcome','reconciled','superseded',v_changed,'deliveryUnknownCount',v_unknown,'outboundMode','DISABLED');
end
$$;

create or replace function public.touchline_social_046_admin_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  return jsonb_build_object(
    'cycles',coalesce((select jsonb_agg(to_jsonb(c) order by c.component) from (select component,case when lease_token is null then null else 'active' end as lease_state,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed from public.touchline_social_template_policy_cycles order by component)c),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from (select id,content_type,placement,locale,width,height,template_version,template_identity_checksum,visual_template_checksum,base_copy_checksum,lexicon_checksum,state,artwork_template_approval_state,caption_template_approval_state,updated_at from public.touchline_social_template_versions order by updated_at desc limit 50)t),'[]'::jsonb),
    'controls',coalesce((select jsonb_agg(to_jsonb(c) order by c.scope_key) from (select scope_key,content_type,kill_switch_engaged,daily_quota,minimum_gap_seconds,outbound_mode,reason_code,updated_at from public.touchline_social_delivery_controls order by scope_key limit 50)c),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from (select id,draft_id,template_id,state,reason_code,approved_template_version,eligible_at,queued_at,created_at from public.touchline_social_auto_publish_candidates order by created_at desc limit 50)c),'[]'::jsonb),
    'templateCount',(select count(*) from public.touchline_social_template_versions),
    'readyCount',(select count(*) from public.touchline_social_auto_publish_candidates where state='READY'),
    'deliveryUnknownCount',(select count(*) from public.touchline_social_dispatch_attempts where state='DELIVERY_UNKNOWN'),
    'outboundMode','DISABLED'
  );
end
$$;

create or replace function public.touchline_social_046_read_template_for_review(p_template_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_template public.touchline_social_template_versions%rowtype; v_draft public.touchline_social_publication_drafts%rowtype;
begin
  select * into v_template from public.touchline_social_template_versions where id=p_template_id;
  if not found then raise exception 'TL_SOCIAL_TEMPLATE_NOT_FOUND'; end if;
  select * into v_draft from public.touchline_social_publication_drafts where id=v_template.exemplar_draft_id;
  if not found then raise exception 'TL_SOCIAL_TEMPLATE_EXEMPLAR_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id',v_template.id,'contentType',v_template.content_type,'placement',v_template.placement,'locale',v_template.locale,
    'width',v_template.width,'height',v_template.height,'templateVersion',v_template.template_version,
    'templateIdentityChecksum',v_template.template_identity_checksum,'visualTemplateChecksum',v_template.visual_template_checksum,
    'baseCopyChecksum',v_template.base_copy_checksum,'lexiconChecksum',v_template.lexicon_checksum,
    'exemplarDraftId',v_draft.id,'exemplarManifestChecksum',v_template.exemplar_manifest_checksum,
    'exemplarArtifactChecksum',v_template.exemplar_artifact_checksum,'exemplarCaptionChecksum',v_template.exemplar_caption_checksum,
    'artifactStorageProvider',v_draft.artifact_storage_provider,'artifactStorageBucket',v_draft.artifact_storage_bucket,
    'artifactStorageKey',v_draft.artifact_storage_key,'artifactEtag',v_draft.artifact_etag,
    'artifactContentType',v_draft.artifact_content_type,'artifactByteLength',v_draft.artifact_byte_length,
    'state',v_template.state,'artworkTemplateApprovalState',v_template.artwork_template_approval_state,
    'captionTemplateApprovalState',v_template.caption_template_approval_state
  );
end
$$;

revoke all on function public.touchline_social_046_guard_mutation() from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_guard_audit() from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_audit(uuid,text,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_template_identity_checksum(text,text,text,integer,integer,text,text[],text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_rendered_fields_checksum(text[]) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_claim_cycle(text) from public,anon,authenticated;
revoke all on function public.touchline_social_046_renew_cycle(text,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_046_complete_cycle(text,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.touchline_social_046_register_template(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_046_issue_template_intent(uuid,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_046_approve_template(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_set_template_state(uuid,text,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_set_delivery_control(text,boolean,integer,integer,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_generation_is_current(uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_social_046_evaluate_draft(uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.touchline_social_046_reconcile_candidates(integer) from public,anon,authenticated;
revoke all on function public.touchline_social_046_admin_status() from public,anon,authenticated;
revoke all on function public.touchline_social_046_read_template_for_review(uuid) from public,anon,authenticated;

grant execute on function public.touchline_social_046_register_template(jsonb,uuid) to service_role;
grant execute on function public.touchline_social_046_claim_cycle(text) to service_role;
grant execute on function public.touchline_social_046_renew_cycle(text,uuid) to service_role;
grant execute on function public.touchline_social_046_complete_cycle(text,uuid,text,text,integer) to service_role;
grant execute on function public.touchline_social_046_issue_template_intent(uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.touchline_social_046_approve_template(uuid,uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.touchline_social_046_set_template_state(uuid,text,text,uuid,text) to authenticated;
grant execute on function public.touchline_social_046_set_delivery_control(text,boolean,integer,integer,uuid,text) to authenticated;
grant execute on function public.touchline_social_046_evaluate_draft(uuid,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.touchline_social_046_reconcile_candidates(integer) to service_role;
grant execute on function public.touchline_social_046_admin_status() to service_role;
grant execute on function public.touchline_social_046_read_template_for_review(uuid) to service_role;

comment on table public.touchline_social_template_versions is
  'QA-only exact template identities. OWNER approval covers an immutable visual/copy/lexicon version, never dynamic sport data.';
comment on table public.touchline_social_auto_publish_candidates is
  'Internal policy eligibility only. READY means every current data/template/control gate passed, while outbound remains hard-disabled and no network connector exists.';
comment on function public.touchline_social_046_evaluate_draft(uuid,text,text,timestamptz,timestamptz) is
  'Revalidates current canonical source, exact completed generator job, rehashed immutable artifact, template state, kill switches, quotas and Feed gap. It never dispatches externally.';

commit;
