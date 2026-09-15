-- LOCAL PROPOSAL ONLY: do not apply remotely without an authorised QA migration window.
-- Server-timed review evidence replaces client-asserted loop counts. Outbound remains disabled.
begin;

create table public.touchline_social_studio_review_evidence (
  id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  record_key text not null check (length(record_key) between 3 and 160),
  record_revision integer not null check (record_revision >= 0),
  media_identity text not null check (media_identity ~ '^sha256:[a-f0-9]{64}$'),
  media_duration_seconds numeric(8,3) not null check (media_duration_seconds between 1 and 60),
  started_at timestamptz not null default now(),
  last_tick_at timestamptz not null default now(),
  observed_seconds numeric(10,3) not null default 0 check (observed_seconds >= 0),
  completed_loops integer not null default 0 check (completed_loops between 0 and 2),
  completed_at timestamptz,
  invalidated_at timestamptz,
  consumed_by_request_id uuid,
  consumed_action text check (consumed_action in ('approve-artwork','approve-caption')),
  consumed_at timestamptz,
  check ((consumed_by_request_id is null and consumed_action is null and consumed_at is null)
    or (consumed_by_request_id is not null and consumed_action is not null and consumed_at is not null)),
  check ((completed_loops = 2) = (completed_at is not null))
);
create index touchline_social_studio_review_evidence_actor_idx
  on public.touchline_social_studio_review_evidence(actor_id, record_key, media_identity, started_at desc);
alter table public.touchline_social_studio_review_evidence enable row level security;
revoke all on public.touchline_social_studio_review_evidence from public, anon, authenticated;
grant select, insert, update on public.touchline_social_studio_review_evidence to service_role;

create function public.touchline_social_studio_review_start(
  p_session_id uuid, p_actor_id uuid, p_record_key text, p_record_revision integer,
  p_media_identity text, p_media_duration_seconds numeric
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare evidence public.touchline_social_studio_review_evidence;
begin
  if p_session_id is null or p_actor_id is null or p_record_key is null
    or length(p_record_key) not between 3 and 160
    or p_record_revision is null or p_record_revision < 0
    or p_media_identity is null or p_media_identity !~ '^sha256:[a-f0-9]{64}$'
    or p_media_duration_seconds is null or p_media_duration_seconds not between 1 and 60 then
    raise exception 'TL_STUDIO_INVALID_REVIEW_SESSION' using errcode='22023';
  end if;
  delete from public.touchline_social_studio_review_evidence where started_at < now()-interval '1 day';
  insert into public.touchline_social_studio_review_evidence(id, actor_id, record_key, record_revision, media_identity, media_duration_seconds)
  values (p_session_id, p_actor_id, p_record_key, p_record_revision, p_media_identity, p_media_duration_seconds)
  on conflict (id) do nothing;
  select * into evidence from public.touchline_social_studio_review_evidence where id=p_session_id;
  if evidence.actor_id<>p_actor_id or evidence.record_key<>p_record_key or evidence.record_revision<>p_record_revision
    or evidence.media_identity<>p_media_identity or evidence.media_duration_seconds<>p_media_duration_seconds then
    raise exception 'TL_STUDIO_REVIEW_SESSION_CONFLICT' using errcode='40001';
  end if;
  return to_jsonb(evidence);
end $$;

create function public.touchline_social_studio_review_tick(
  p_session_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare evidence public.touchline_social_studio_review_evidence;
declare elapsed numeric;
begin
  select * into evidence from public.touchline_social_studio_review_evidence where id=p_session_id for update;
  if not found or evidence.actor_id<>p_actor_id or evidence.invalidated_at is not null
    or evidence.started_at < now()-interval '15 minutes' then
    raise exception 'TL_STUDIO_REVIEW_SESSION_INVALID' using errcode='22023';
  end if;
  if evidence.completed_at is not null then return to_jsonb(evidence); end if;
  -- Only recent, server-observed heartbeats accrue time. A late/resumed tab starts a fresh interval.
  elapsed := extract(epoch from (now()-evidence.last_tick_at));
  if elapsed between 0.25 and 5 then
    evidence.observed_seconds := evidence.observed_seconds + elapsed;
  end if;
  evidence.last_tick_at := now();
  evidence.completed_loops := least(2, floor(evidence.observed_seconds/evidence.media_duration_seconds)::integer);
  if evidence.completed_loops=2 then evidence.completed_at := now(); end if;
  update public.touchline_social_studio_review_evidence set
    last_tick_at=evidence.last_tick_at, observed_seconds=evidence.observed_seconds,
    completed_loops=evidence.completed_loops, completed_at=evidence.completed_at
  where id=evidence.id;
  return to_jsonb(evidence);
end $$;

create function public.touchline_social_studio_review_invalidate(
  p_session_id uuid, p_actor_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.touchline_social_studio_review_evidence
    set invalidated_at=coalesce(invalidated_at,now()), completed_at=null, completed_loops=0
    where id=p_session_id and actor_id=p_actor_id and consumed_at is null;
end $$;

create or replace function public.touchline_social_studio_capabilities() returns jsonb
language sql security invoker set search_path = ''
as $$ select '{"schemaVersion":3,"outbound":"DISABLED","reviewEvidence":"SERVER_TIMED"}'::jsonb $$;

-- Disable approval through the historical RPCs. Non-approval planning/rejection/retry remains available
-- only through v3, so there is one transaction authority after this migration.
revoke execute on function public.touchline_social_studio_save(text, integer, jsonb, uuid, uuid, text, text) from service_role;
revoke execute on function public.touchline_social_studio_save_v2(text, integer, jsonb, uuid, uuid, text, text, uuid, integer) from service_role;

create function public.touchline_social_studio_save_v3(
  p_record_key text, p_expected_revision integer, p_document jsonb, p_actor_id uuid,
  p_request_id uuid, p_request_checksum text, p_action text,
  p_delivery_id uuid, p_expected_delivery_revision integer, p_review_session_id uuid,
  p_review_media_identity text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_record public.touchline_social_studio_records;
  previous_request public.touchline_social_studio_history;
  delivery public.touchline_social_studio_deliveries;
  evidence public.touchline_social_studio_review_evidence;
  approval jsonb;
begin
  if p_record_key is null or p_expected_revision is null or p_expected_revision < 0
    or p_actor_id is null or p_request_id is null or p_request_checksum is null
    or p_document is null or coalesce(p_document->>'outbound','')<>'DISABLED'
    or coalesce(p_document->>'permission','')<>'PAUSED'
    or p_action is null or p_action not in ('save-plan','approve-artwork','approve-caption','reject-artwork','request-revision','request-retry') then
    raise exception 'TL_STUDIO_INVALID_SAVE' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into previous_request from public.touchline_social_studio_history where request_id=p_request_id;
  if found then
    if previous_request.record_key<>p_record_key or previous_request.actor_id<>p_actor_id
      or previous_request.request_checksum<>p_request_checksum or previous_request.action<>p_action then
      raise exception 'TL_STUDIO_IDEMPOTENCY_CONFLICT' using errcode='40001';
    end if;
    return jsonb_build_object('record_key',previous_request.record_key,'revision',previous_request.revision,
      'document',previous_request.document,'updated_at',previous_request.created_at,'replayed',true);
  end if;
  if p_action in ('approve-artwork','approve-caption') then
    select * into evidence from public.touchline_social_studio_review_evidence where id=p_review_session_id for update;
    if not found or evidence.actor_id<>p_actor_id or evidence.record_key<>p_record_key
      or evidence.record_revision<>p_expected_revision or evidence.media_identity<>p_review_media_identity
      or evidence.completed_loops<>2 or evidence.completed_at is null
      or evidence.invalidated_at is not null
      or evidence.completed_at < now()-interval '15 minutes'
      or evidence.consumed_at is not null
      or not (p_document->'reviews' ? evidence.media_identity) then
      raise exception 'TL_STUDIO_SERVER_REVIEW_REQUIRED' using errcode='22023';
    end if;
    update public.touchline_social_studio_review_evidence set consumed_by_request_id=p_request_id,
      consumed_action=p_action,consumed_at=now() where id=evidence.id;
  elsif p_review_session_id is not null or p_review_media_identity is not null then
    raise exception 'TL_STUDIO_INVALID_REVIEW_SESSION' using errcode='22023';
  end if;
  insert into public.touchline_social_studio_records(record_key,document)
  values (p_record_key,'{"outbound":"DISABLED","permission":"PAUSED","selected":false,"schedule":null,"reviews":{}}'::jsonb)
  on conflict (record_key) do nothing;
  select * into current_record from public.touchline_social_studio_records where record_key=p_record_key for update;
  if current_record.revision<>p_expected_revision then raise exception 'TL_STUDIO_REVISION_CONFLICT' using errcode='40001'; end if;
  if p_action='request-retry' then
    select * into delivery from public.touchline_social_studio_deliveries where id=p_delivery_id for update;
    if not found or p_expected_delivery_revision is null or delivery.record_key<>p_record_key
      or delivery.revision<>p_expected_delivery_revision then
      raise exception 'TL_STUDIO_DELIVERY_REVISION_CONFLICT' using errcode='40001';
    end if;
    approval := current_record.document->'reviews'->delivery.media_identity;
    if delivery.state<>'FAILED' or delivery.receipt_id is not null or not delivery.retryable
      or delivery.retry_requested_at is not null or not delivery.source_current or delivery.source_valid_until<=now()
      or coalesce(approval->>'artworkApprovedAt','')='' or coalesce(approval->>'captionApprovedAt','')=''
      or coalesce(approval->>'decision','') in ('REJECTED','CHANGES_REQUESTED') then
      raise exception 'TL_STUDIO_DELIVERY_NOT_RETRYABLE' using errcode='22023';
    end if;
    update public.touchline_social_studio_deliveries set retry_requested_at=now(),revision=revision+1 where id=p_delivery_id;
  elsif p_delivery_id is not null or p_expected_delivery_revision is not null then
    raise exception 'TL_STUDIO_INVALID_DELIVERY_TARGET' using errcode='22023';
  end if;
  update public.touchline_social_studio_records set document=p_document,revision=revision+1,updated_at=now()
    where record_key=p_record_key returning * into current_record;
  insert into public.touchline_social_studio_history(request_id,record_key,actor_id,request_checksum,action,revision,document)
    values (p_request_id,p_record_key,p_actor_id,p_request_checksum,p_action,current_record.revision,current_record.document);
  return to_jsonb(current_record)||jsonb_build_object('replayed',false);
end $$;

revoke all on function public.touchline_social_studio_review_start(uuid,uuid,text,integer,text,numeric) from public,anon,authenticated;
revoke all on function public.touchline_social_studio_review_tick(uuid,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_studio_review_invalidate(uuid,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_studio_save_v3(text,integer,jsonb,uuid,uuid,text,text,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.touchline_social_studio_review_start(uuid,uuid,text,integer,text,numeric) to service_role;
grant execute on function public.touchline_social_studio_review_tick(uuid,uuid) to service_role;
grant execute on function public.touchline_social_studio_review_invalidate(uuid,uuid) to service_role;
grant execute on function public.touchline_social_studio_save_v3(text,integer,jsonb,uuid,uuid,text,text,uuid,integer,uuid,text) to service_role;
grant delete on public.touchline_social_studio_review_evidence to service_role;

commit;
