-- LOCAL PROPOSAL ONLY. Not applied by this task. Approval plans never enter an outbound queue.
-- Additive to the historical social approval system: no historical template or approval is changed.
begin;

create table public.touchline_social_studio_records (
  record_key text primary key check (length(record_key) between 3 and 160),
  revision integer not null default 0 check (revision >= 0),
  document jsonb not null check (coalesce(
    jsonb_typeof(document) = 'object'
    and document->>'outbound' = 'DISABLED'
    and document->>'permission' = 'PAUSED'
    and jsonb_typeof(document->'selected') = 'boolean'
    and jsonb_typeof(document->'reviews') = 'object'
    and (document->'schedule' = 'null'::jsonb or jsonb_typeof(document->'schedule') = 'object')
  , false)),
  updated_at timestamptz not null default now()
);

create table public.touchline_social_studio_history (
  request_id uuid primary key,
  record_key text not null references public.touchline_social_studio_records(record_key),
  actor_id uuid not null references auth.users(id),
  request_checksum text not null check (request_checksum ~ '^sha256:[a-f0-9]{64}$'),
  action text not null check (action in ('save-plan', 'approve-artwork', 'approve-caption')),
  revision integer not null check (revision > 0),
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique (record_key, revision)
);
create index touchline_social_studio_history_record_created_idx
  on public.touchline_social_studio_history(record_key, created_at desc);

alter table public.touchline_social_studio_records enable row level security;
alter table public.touchline_social_studio_history enable row level security;
revoke all on public.touchline_social_studio_records, public.touchline_social_studio_history from public, anon, authenticated;
grant select, insert, update on public.touchline_social_studio_records to service_role;
grant select, insert on public.touchline_social_studio_history to service_role;

-- Invoker: only the protected server's service role may call this transaction.
-- Authorisation is the existing owner+Arena guard; no user-editable JWT metadata is consulted.
create function public.touchline_social_studio_save(
  p_record_key text, p_expected_revision integer, p_document jsonb, p_actor_id uuid,
  p_request_id uuid, p_request_checksum text, p_action text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  current_record public.touchline_social_studio_records;
  previous_request public.touchline_social_studio_history;
begin
  if p_record_key is null or p_expected_revision is null or p_expected_revision < 0
    or p_actor_id is null or p_request_id is null or p_request_checksum is null
    or p_document is null or coalesce(p_document->>'outbound', '') <> 'DISABLED'
    or coalesce(p_document->>'permission', '') <> 'PAUSED'
    or p_action is null or p_action not in ('save-plan', 'approve-artwork', 'approve-caption') then
    raise exception 'TL_STUDIO_INVALID_SAVE' using errcode = '22023';
  end if;
  -- One request ID cannot be reused concurrently for a different record.
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
  update public.touchline_social_studio_records set document = p_document, revision = revision + 1, updated_at = now()
  where record_key = p_record_key returning * into current_record;
  insert into public.touchline_social_studio_history(request_id, record_key, actor_id, request_checksum, action, revision, document)
  values (p_request_id, p_record_key, p_actor_id, p_request_checksum, p_action, current_record.revision, current_record.document);
  return to_jsonb(current_record) || jsonb_build_object('replayed', false);
end;
$$;
revoke all on function public.touchline_social_studio_save(text, integer, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.touchline_social_studio_save(text, integer, jsonb, uuid, uuid, text, text) to service_role;

commit;
-- Rollback posture: leave these audit records intact and remove the Studio UI/API from the candidate.
-- No scheduler, delivery worker, historical approval update, Storage policy or outbound permission is created.
