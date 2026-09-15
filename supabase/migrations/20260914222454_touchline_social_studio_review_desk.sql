-- LOCAL PROPOSAL ONLY: never applied by this task. No publisher, worker or outbound queue.
begin;

alter table public.touchline_social_studio_history drop constraint touchline_social_studio_history_action_check;
alter table public.touchline_social_studio_history add constraint touchline_social_studio_history_action_check
  check (action in ('save-plan', 'approve-artwork', 'approve-caption', 'reject-artwork', 'request-revision', 'request-retry'));

-- Written only by a future, separately authorised integration. No synthetic delivery is seeded.
create table public.touchline_social_studio_deliveries (
  id uuid primary key,
  record_key text not null references public.touchline_social_studio_records(record_key),
  instance_id text not null check (length(instance_id) between 1 and 200),
  platform text not null check (platform in ('INSTAGRAM', 'FACEBOOK', 'CLUB')),
  account_id text not null check (length(trim(account_id)) between 1 and 200),
  placement text not null,
  media_identity text not null check (media_identity ~ '^sha256:[a-f0-9]{64}$'),
  revision integer not null default 0 check (revision >= 0),
  state text not null check (state in ('PENDING', 'CONFIRMED', 'FAILED', 'UNKNOWN')),
  receipt_id text,
  error text,
  retryable boolean not null default false,
  source_current boolean not null default false,
  source_valid_until timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  retry_requested_at timestamptz,
  check ((platform = 'CLUB' and placement = 'CLUB_FEED') or (platform <> 'CLUB' and placement in ('FEED', 'STORY'))),
  check (record_key = split_part(record_key, ':', 1) || ':' || platform || ':' || placement),
  check (state <> 'CONFIRMED' or length(trim(receipt_id)) > 0 and receipt_id is not null),
  unique (instance_id, platform, account_id, placement)
);
create index touchline_social_studio_deliveries_record_idx on public.touchline_social_studio_deliveries(record_key, last_attempt_at desc);
alter table public.touchline_social_studio_deliveries enable row level security;
revoke all on public.touchline_social_studio_deliveries from public, anon, authenticated;
grant select, insert, update on public.touchline_social_studio_deliveries to service_role;

create function public.touchline_social_studio_capabilities() returns jsonb
language sql security invoker set search_path = ''
as $$ select '{"schemaVersion":2,"outbound":"DISABLED"}'::jsonb $$;
revoke all on function public.touchline_social_studio_capabilities() from public, anon, authenticated;
grant execute on function public.touchline_social_studio_capabilities() to service_role;

create function public.touchline_social_studio_save_v2(
  p_record_key text, p_expected_revision integer, p_document jsonb, p_actor_id uuid,
  p_request_id uuid, p_request_checksum text, p_action text,
  p_delivery_id uuid, p_expected_delivery_revision integer
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  current_record public.touchline_social_studio_records;
  previous_request public.touchline_social_studio_history;
  delivery public.touchline_social_studio_deliveries;
  approval jsonb;
begin
  if p_record_key is null or p_expected_revision is null or p_expected_revision < 0
    or p_actor_id is null or p_request_id is null or p_request_checksum is null
    or p_document is null or coalesce(p_document->>'outbound', '') <> 'DISABLED'
    or coalesce(p_document->>'permission', '') <> 'PAUSED'
    or p_action is null or p_action not in ('save-plan', 'approve-artwork', 'approve-caption', 'reject-artwork', 'request-revision', 'request-retry') then
    raise exception 'TL_STUDIO_INVALID_SAVE' using errcode = '22023';
  end if;
  -- Receipt recovery precedes every time-dependent check, including expired retry facts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into previous_request from public.touchline_social_studio_history where request_id = p_request_id;
  if found then
    if previous_request.record_key <> p_record_key or previous_request.actor_id <> p_actor_id
      or previous_request.request_checksum <> p_request_checksum or previous_request.action <> p_action then
      raise exception 'TL_STUDIO_IDEMPOTENCY_CONFLICT' using errcode = '40001';
    end if;
    return jsonb_build_object('record_key', previous_request.record_key, 'revision', previous_request.revision,
      'document', previous_request.document, 'updated_at', previous_request.created_at, 'replayed', true);
  end if;
  insert into public.touchline_social_studio_records(record_key, document)
  values (p_record_key, '{"outbound":"DISABLED","permission":"PAUSED","selected":false,"schedule":null,"reviews":{}}'::jsonb)
  on conflict (record_key) do nothing;
  select * into current_record from public.touchline_social_studio_records where record_key = p_record_key for update;
  if current_record.revision <> p_expected_revision then
    raise exception 'TL_STUDIO_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if p_action = 'request-retry' then
    select * into delivery from public.touchline_social_studio_deliveries where id = p_delivery_id for update;
    if not found or p_expected_delivery_revision is null or delivery.record_key <> p_record_key
      or delivery.revision <> p_expected_delivery_revision then
      raise exception 'TL_STUDIO_DELIVERY_REVISION_CONFLICT' using errcode = '40001';
    end if;
    approval := current_record.document->'reviews'->delivery.media_identity;
    if delivery.state <> 'FAILED' or delivery.receipt_id is not null or not delivery.retryable
      or delivery.retry_requested_at is not null or not delivery.source_current or delivery.source_valid_until <= now()
      or coalesce(approval->>'artworkApprovedAt', '') = '' or coalesce(approval->>'captionApprovedAt', '') = ''
      or coalesce(approval->>'decision', '') in ('REJECTED', 'CHANGES_REQUESTED') then
      raise exception 'TL_STUDIO_DELIVERY_NOT_RETRYABLE' using errcode = '22023';
    end if;
    -- Record intent only. Preserve FAILED and its error. Never touch a sibling Feed/Story/account.
    update public.touchline_social_studio_deliveries set retry_requested_at = now(), revision = revision + 1
    where id = p_delivery_id;
  elsif p_delivery_id is not null or p_expected_delivery_revision is not null then
    raise exception 'TL_STUDIO_INVALID_DELIVERY_TARGET' using errcode = '22023';
  end if;
  update public.touchline_social_studio_records set document = p_document, revision = revision + 1, updated_at = now()
  where record_key = p_record_key returning * into current_record;
  insert into public.touchline_social_studio_history(request_id, record_key, actor_id, request_checksum, action, revision, document)
  values (p_request_id, p_record_key, p_actor_id, p_request_checksum, p_action, current_record.revision, current_record.document);
  return to_jsonb(current_record) || jsonb_build_object('replayed', false);
end;
$$;
revoke all on function public.touchline_social_studio_save_v2(text, integer, jsonb, uuid, uuid, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.touchline_social_studio_save_v2(text, integer, jsonb, uuid, uuid, text, text, uuid, integer) to service_role;
commit;
-- Rollback: remove the candidate Studio UI/API, retaining audit and delivery evidence. No destructive rollback.
