-- TouchLine Card Engine: protected editorial control plane.
--
-- This migration is additive. Sportmonks remains the source of football facts;
-- TouchLine stores only presentation/valuation decisions and their provenance.
begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_card_editorial_batches (
  id uuid primary key default gen_random_uuid(),
  idempotency_key char(64) not null unique check (idempotency_key ~ '^[0-9a-f]{64}$'),
  source_type text not null check (source_type in ('paste', 'csv', 'xlsx', 'single_edit', 'qa_fixture')),
  source_filename text,
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_season text not null check (length(trim(effective_season)) between 5 and 16),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'reverted')),
  rows_received integer not null default 0 check (rows_received between 0 and 200),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  conflict_rows integer not null default 0 check (conflict_rows >= 0),
  unmatched_rows integer not null default 0 check (unmatched_rows >= 0),
  created_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  published_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  reverted_at timestamptz
);

create table if not exists public.touchline_card_editorial_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.touchline_card_editorial_batches(id) on delete restrict,
  row_number integer not null check (row_number between 1 and 200),
  raw_input jsonb not null check (jsonb_typeof(raw_input) = 'object'),
  player_id uuid references public.football_players(id) on delete restrict,
  provider_player_id text,
  match_strategy text not null check (match_strategy in ('provider_player_id', 'internal_uuid', 'name_club_dob', 'name_club_manual', 'none')),
  match_status text not null check (match_status in ('matched', 'review', 'conflict', 'unmatched')),
  provider_snapshot jsonb,
  proposed_override jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed_override) = 'object'),
  effective_snapshot jsonb,
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id, row_number)
);

create table if not exists public.touchline_card_editorial_overrides (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.football_players(id) on delete restrict,
  field_key text not null check (field_key in ('displayName', 'shirtNumber', 'marketValueEur', 'cardTemplateKey')),
  provider_value jsonb,
  touchline_override jsonb not null,
  effective_value jsonb not null,
  status text not null default 'approved' check (status in ('draft', 'review', 'approved', 'stale', 'reverted')),
  provider_updated_at timestamptz,
  source_batch_id uuid references public.touchline_card_editorial_batches(id) on delete restrict,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id, field_key)
);

create table if not exists public.touchline_card_editorial_audit_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.touchline_card_editorial_batches(id) on delete restrict,
  batch_item_id uuid references public.touchline_card_editorial_batch_items(id) on delete restrict,
  player_id uuid references public.football_players(id) on delete restrict,
  event_type text not null check (event_type in ('batch_created', 'item_resolved', 'batch_approved', 'override_published', 'market_value_published', 'batch_reverted', 'stale_detected')),
  actor_id uuid references public.users(id) on delete set null,
  provider_before jsonb,
  override_before jsonb,
  effective_before jsonb,
  provider_after jsonb,
  override_after jsonb,
  effective_after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists touchline_card_editorial_batches_status_idx on public.touchline_card_editorial_batches(status, created_at desc);
create index if not exists touchline_card_editorial_items_batch_idx on public.touchline_card_editorial_batch_items(batch_id, match_status, row_number);
create index if not exists touchline_card_editorial_overrides_player_idx on public.touchline_card_editorial_overrides(player_id, status);
create index if not exists touchline_card_editorial_audit_player_idx on public.touchline_card_editorial_audit_events(player_id, created_at desc);

create or replace function public.touchline_card_editorial_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists touchline_card_editorial_overrides_touch_updated_at on public.touchline_card_editorial_overrides;
create trigger touchline_card_editorial_overrides_touch_updated_at before update on public.touchline_card_editorial_overrides
for each row execute function public.touchline_card_editorial_touch_updated_at();

create or replace function public.touchline_card_editorial_audit_is_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'TL_CARD_ENGINE_AUDIT_IMMUTABLE'; end;
$$;
drop trigger if exists touchline_card_editorial_audit_immutable on public.touchline_card_editorial_audit_events;
create trigger touchline_card_editorial_audit_immutable before update or delete on public.touchline_card_editorial_audit_events
for each row execute function public.touchline_card_editorial_audit_is_immutable();

create or replace view public.touchline_card_editorial_effective_values
with (security_invoker = true) as
select o.player_id, o.field_key, o.provider_value, o.touchline_override, o.effective_value,
       o.status, o.source_batch_id, o.approved_at, o.provider_updated_at,
       (o.status = 'approved' and o.provider_updated_at is not null and p.source_updated_at > o.provider_updated_at) as is_stale
from public.touchline_card_editorial_overrides o
join public.football_players p on p.id = o.player_id;

create or replace function public.touchline_card_engine_create_batch(
  p_idempotency_key text, p_content_sha256 text, p_source_type text, p_source_filename text,
  p_effective_season text, p_rows jsonb, p_actor_id uuid
) returns table(batch_id uuid, status text, replayed boolean, rows_received integer, matched_rows integer, review_rows integer, conflict_rows integer, unmatched_rows integer)
language plpgsql security definer set search_path = '' as $$
declare v_batch public.touchline_card_editorial_batches%rowtype; v_row jsonb; v_count integer; v_matched integer; v_review integer; v_conflict integer; v_unmatched integer;
begin
  if p_actor_id is null or p_idempotency_key !~ '^[0-9a-f]{64}$' or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_type not in ('paste', 'csv', 'xlsx', 'single_edit', 'qa_fixture')
    or jsonb_typeof(p_rows) <> 'array' or length(trim(coalesce(p_effective_season, ''))) = 0 then
    raise exception using errcode = '22023', message = 'TL_CARD_ENGINE_BATCH_INVALID';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 200 then raise exception using errcode = '22023', message = 'TL_CARD_ENGINE_BATCH_ROW_LIMIT'; end if;
  select * into v_batch from public.touchline_card_editorial_batches where idempotency_key = p_idempotency_key for update;
  if found then
    if v_batch.content_sha256 <> p_content_sha256 then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_IDEMPOTENCY_PAYLOAD_MISMATCH'; end if;
    return query select v_batch.id, v_batch.status, true, v_batch.rows_received, v_batch.matched_rows, v_batch.review_rows, v_batch.conflict_rows, v_batch.unmatched_rows; return;
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) row where jsonb_typeof(row) <> 'object'
    or coalesce(row->>'matchStatus','') not in ('matched', 'review', 'conflict', 'unmatched')
    or coalesce(row->>'matchStrategy','') not in ('provider_player_id', 'internal_uuid', 'name_club_dob', 'name_club_manual', 'none')
    or jsonb_typeof(coalesce(row->'proposed', '{}'::jsonb)) <> 'object'
    or exists (select 1 from jsonb_object_keys(coalesce(row->'proposed', '{}'::jsonb)) key where key not in ('displayName','shirtNumber','marketValueEur','cardTemplateKey'))
    or (row ? 'providerPlayerId' and coalesce(row->>'providerPlayerId','') !~ '^[0-9]{1,20}$')
    or (row ? 'playerId' and coalesce(row->>'playerId','') <> '' and coalesce(row->>'playerId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) then
    raise exception using errcode = '22023', message = 'TL_CARD_ENGINE_BATCH_ROW_INVALID';
  end if;
  select count(*) filter(where row->>'matchStatus' = 'matched'), count(*) filter(where row->>'matchStatus' = 'review'), count(*) filter(where row->>'matchStatus' = 'conflict'), count(*) filter(where row->>'matchStatus' = 'unmatched')
  into v_matched, v_review, v_conflict, v_unmatched from jsonb_array_elements(p_rows) row;
  insert into public.touchline_card_editorial_batches(idempotency_key, content_sha256, source_type, source_filename, effective_season, status, rows_received, matched_rows, review_rows, conflict_rows, unmatched_rows, created_by)
  values(p_idempotency_key, p_content_sha256, p_source_type, nullif(trim(coalesce(p_source_filename,'')),''), trim(p_effective_season), case when v_review + v_conflict + v_unmatched > 0 then 'review' else 'draft' end, v_count, v_matched, v_review, v_conflict, v_unmatched, p_actor_id) returning * into v_batch;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if v_row->>'matchStatus' = 'matched' and not exists (select 1 from public.football_players p where p.id = (v_row->>'playerId')::uuid and p.provider_player_id = v_row->>'providerPlayerId') then
      raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_PROVIDER_IDENTITY_FENCE_FAILED';
    end if;
    insert into public.touchline_card_editorial_batch_items(batch_id,row_number,raw_input,player_id,provider_player_id,match_strategy,match_status,provider_snapshot,proposed_override,effective_snapshot,validation_errors)
    values(v_batch.id,(v_row->>'rowNumber')::integer,coalesce(v_row->'raw','{}'::jsonb),nullif(v_row->>'playerId','')::uuid,nullif(v_row->>'providerPlayerId',''),v_row->>'matchStrategy',v_row->>'matchStatus',v_row->'provider',coalesce(v_row->'proposed','{}'::jsonb),v_row->'effective',coalesce(v_row->'errors','[]'::jsonb));
  end loop;
  insert into public.touchline_card_editorial_audit_events(batch_id,event_type,actor_id,effective_after) values(v_batch.id,'batch_created',p_actor_id,jsonb_build_object('rowsReceived',v_count,'matched',v_matched,'review',v_review,'conflict',v_conflict,'unmatched',v_unmatched));
  return query select v_batch.id, v_batch.status, false, v_count, v_matched, v_review, v_conflict, v_unmatched;
end;
$$;

create or replace function public.touchline_card_engine_approve_batch(p_batch_id uuid, p_actor_id uuid)
returns table(batch_id uuid, status text) language plpgsql security definer set search_path = '' as $$
declare v_batch public.touchline_card_editorial_batches%rowtype;
begin
  select * into v_batch from public.touchline_card_editorial_batches where id = p_batch_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_BATCH_NOT_FOUND'; end if;
  if v_batch.status in ('published','reverted') or v_batch.review_rows <> 0 or v_batch.conflict_rows <> 0 or v_batch.unmatched_rows <> 0 then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_BATCH_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.touchline_card_editorial_batch_items i join public.football_players p on p.id=i.player_id where i.batch_id=p_batch_id and (i.match_status <> 'matched' or p.provider_player_id is distinct from i.provider_player_id)) then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_APPROVAL_CANONICAL_FENCE_FAILED'; end if;
  update public.touchline_card_editorial_batches set status='approved', reviewed_by=p_actor_id, reviewed_at=clock_timestamp() where id=p_batch_id;
  insert into public.touchline_card_editorial_audit_events(batch_id,event_type,actor_id) values(p_batch_id,'batch_approved',p_actor_id);
  return query select p_batch_id, 'approved'::text;
end;
$$;

create or replace function public.touchline_card_engine_publish_batch(p_batch_id uuid, p_actor_id uuid)
returns table(batch_id uuid, status text, published_rows integer) language plpgsql security definer set search_path = '' as $$
declare v_batch public.touchline_card_editorial_batches%rowtype; v_item public.touchline_card_editorial_batch_items%rowtype; v_player public.football_players%rowtype; v_membership public.football_squad_members%rowtype; v_competition uuid; v_key text; v_value jsonb; v_before public.touchline_card_editorial_overrides%rowtype; v_tier text; v_price integer;
begin
  select * into v_batch from public.touchline_card_editorial_batches where id=p_batch_id for update;
  if not found or v_batch.status <> 'approved' then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_PUBLISH_BATCH_NOT_APPROVED'; end if;
  for v_item in select i.* from public.touchline_card_editorial_batch_items i where i.batch_id=p_batch_id order by i.row_number for update loop
    select * into v_player from public.football_players where id=v_item.player_id for update;
    if not found or v_player.provider_player_id <> v_item.provider_player_id then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_PUBLISH_CANONICAL_FENCE_FAILED'; end if;
    for v_key, v_value in select key, value from jsonb_each(v_item.proposed_override) loop
      select * into v_before from public.touchline_card_editorial_overrides where player_id=v_player.id and field_key=v_key for update;
      insert into public.touchline_card_editorial_audit_events(batch_id,batch_item_id,player_id,event_type,actor_id,provider_before,override_before,effective_before)
      values(p_batch_id,v_item.id,v_player.id,'override_published',p_actor_id,case v_key when 'displayName' then to_jsonb(v_player.display_name) else null end,case when v_before.id is null then null else v_before.touchline_override end,case when v_before.id is null then null else v_before.effective_value end);
      insert into public.touchline_card_editorial_overrides(player_id,field_key,provider_value,touchline_override,effective_value,status,provider_updated_at,source_batch_id,approved_by,approved_at,version)
      values(v_player.id,v_key,case when v_key='displayName' then to_jsonb(v_player.display_name) when v_key='shirtNumber' then v_item.provider_snapshot->'jerseyNumber' else null end,v_value,v_value,'approved',v_player.source_updated_at,p_batch_id,p_actor_id,clock_timestamp(),1)
      on conflict(player_id,field_key) do update set provider_value=excluded.provider_value,touchline_override=excluded.touchline_override,effective_value=excluded.effective_value,status='approved',provider_updated_at=excluded.provider_updated_at,source_batch_id=excluded.source_batch_id,approved_by=excluded.approved_by,approved_at=excluded.approved_at,version=public.touchline_card_editorial_overrides.version+1;
      if v_key='marketValueEur' then
        select m.* into v_membership from public.football_squad_members m join public.football_competitions c on c.id=m.competition_id where m.player_id=v_player.id and m.club_id=v_player.current_club_id and m.provider='sportmonks' and m.status='active' and c.provider='sportmonks' and c.provider_competition_id='8' limit 1;
        if v_membership.id is null then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_MARKET_VALUE_MEMBERSHIP_INVALID'; end if;
        v_competition := v_membership.competition_id; v_tier := case when (v_value #>> '{}')::bigint < 6000000 then 'ruby-red' when (v_value #>> '{}')::bigint < 10000000 then 'sapphire-blue' when (v_value #>> '{}')::bigint < 20000000 then 'amethyst-purple' when (v_value #>> '{}')::bigint < 35000000 then 'radiant-gold' when (v_value #>> '{}')::bigint < 50000000 then 'emerald-green' when (v_value #>> '{}')::bigint < 70000000 then 'clear-diamond' else 'diamond-gold' end; v_price := case v_tier when 'ruby-red' then 0 when 'sapphire-blue' then 1 when 'amethyst-purple' then 2 when 'radiant-gold' then 4 when 'emerald-green' then 7 when 'clear-diamond' then 10 else 15 end;
        perform * from public.touchline_apply_manual_card_publication(v_player.id,v_membership.id,v_competition,v_batch.effective_season,(v_value #>> '{}')::bigint,v_tier,v_price,'2026-07-premier-v1','ready_to_publish',clock_timestamp(),'Card Engine batch ' || p_batch_id,'TouchLine Editorial',p_actor_id);
        insert into public.touchline_card_editorial_audit_events(batch_id,batch_item_id,player_id,event_type,actor_id,effective_after) values(p_batch_id,v_item.id,v_player.id,'market_value_published',p_actor_id,jsonb_build_object('marketValueEur',v_value));
      end if;
    end loop;
  end loop;
  update public.touchline_card_editorial_batches set status='published',published_by=p_actor_id,published_at=clock_timestamp() where id=p_batch_id;
  return query select p_batch_id,'published'::text,v_batch.matched_rows;
end;
$$;

create or replace function public.touchline_card_engine_revert_batch(p_batch_id uuid, p_actor_id uuid)
returns table(batch_id uuid, status text, reverted_rows integer) language plpgsql security definer set search_path = '' as $$
declare v_batch public.touchline_card_editorial_batches%rowtype; v_count integer; v_history_id uuid;
begin
  select * into v_batch from public.touchline_card_editorial_batches where id=p_batch_id for update;
  if not found or v_batch.status <> 'published' then raise exception using errcode = 'P0001', message = 'TL_CARD_ENGINE_REVERT_BATCH_NOT_PUBLISHED'; end if;
  -- Market Values are published through the existing atomic card-publication
  -- command. Its immutable history is therefore the sole restoration source.
  -- The batch-specific internal note makes this bounded and idempotent.
  for v_history_id in select h.id from public.touchline_card_publication_history h
    where h.actor_id = v_batch.published_by
      and h.after_state #>> '{publication,internal_note}' = 'Card Engine batch ' || p_batch_id::text
    order by h.created_at desc
  loop
    perform * from public.touchline_revert_manual_card_publication(v_history_id, p_actor_id);
  end loop;
  update public.touchline_card_editorial_overrides o set status='reverted',approved_by=p_actor_id,approved_at=clock_timestamp(),version=o.version+1 where o.source_batch_id=p_batch_id and o.status='approved';
  get diagnostics v_count = row_count;
  insert into public.touchline_card_editorial_audit_events(batch_id,event_type,actor_id,effective_after) values(p_batch_id,'batch_reverted',p_actor_id,jsonb_build_object('revertedOverrides',v_count));
  update public.touchline_card_editorial_batches set status='reverted',reverted_at=clock_timestamp() where id=p_batch_id;
  return query select p_batch_id,'reverted'::text,v_count;
end;
$$;

alter table public.touchline_card_editorial_batches enable row level security;
alter table public.touchline_card_editorial_batch_items enable row level security;
alter table public.touchline_card_editorial_overrides enable row level security;
alter table public.touchline_card_editorial_audit_events enable row level security;
revoke all on public.touchline_card_editorial_batches, public.touchline_card_editorial_batch_items, public.touchline_card_editorial_overrides, public.touchline_card_editorial_audit_events from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_card_editorial_batches, public.touchline_card_editorial_batch_items, public.touchline_card_editorial_overrides, public.touchline_card_editorial_audit_events to service_role;
revoke all on public.touchline_card_editorial_effective_values from public, anon, authenticated;
grant select on public.touchline_card_editorial_effective_values to service_role;
revoke all on function public.touchline_card_engine_create_batch(text,text,text,text,text,jsonb,uuid), public.touchline_card_engine_approve_batch(uuid,uuid), public.touchline_card_engine_publish_batch(uuid,uuid), public.touchline_card_engine_revert_batch(uuid,uuid) from public, anon, authenticated;
grant execute on function public.touchline_card_engine_create_batch(text,text,text,text,text,jsonb,uuid), public.touchline_card_engine_approve_batch(uuid,uuid), public.touchline_card_engine_publish_batch(uuid,uuid), public.touchline_card_engine_revert_batch(uuid,uuid) to service_role;

comment on table public.touchline_card_editorial_overrides is 'TouchLine-owned approved card presentation decisions. Provider values are retained for provenance; approved overrides win only for presentation.';
comment on view public.touchline_card_editorial_effective_values is 'Protected provider_value, touchline_override and effective_value projection with stale-override signal.';
commit;
