-- Local-only foundation for controlled ClubOwner post-season history.
-- No existing ranking, contract, wallet, achievement or result is migrated,
-- recalculated or deleted by this preparation. The table is not public: the
-- server alone validates and freezes a season's official result.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_season_owner_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  season_id uuid not null references public.football_seasons(id) on delete restrict,
  final_rank integer check (final_rank is null or final_rank > 0),
  total_touchline_points integer check (total_touchline_points is null or total_touchline_points >= 0),
  best_weekly_rank integer check (best_weekly_rank is null or best_weekly_rank > 0),
  summary_status text not null default 'draft' check (summary_status in ('draft', 'validated', 'frozen')),
  validated_at timestamptz,
  frozen_at timestamptz,
  source_reset_run_id uuid references public.touchline_season_reset_runs(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (summary_status = 'draft' and validated_at is null and frozen_at is null)
    or (summary_status = 'validated' and validated_at is not null and frozen_at is null)
    or (summary_status = 'frozen' and validated_at is not null and frozen_at is not null)
  ),
  unique (user_id, season_id)
);

create table if not exists public.touchline_season_owner_honours (
  id uuid primary key default gen_random_uuid(),
  season_owner_summary_id uuid not null references public.touchline_season_owner_summaries(id) on delete restrict,
  honour_type text not null check (honour_type in ('champion', 'top_11', 'record', 'achievement')),
  title text not null check (length(btrim(title)) > 0),
  detail text,
  created_at timestamptz not null default now(),
  unique (season_owner_summary_id, honour_type, title)
);

-- Every exceptional correction to a frozen season becomes a durable audit row.
-- This table is intentionally server-only and does not itself grant permission
-- to edit historical results.
create table if not exists public.touchline_season_owner_history_corrections (
  id uuid primary key default gen_random_uuid(),
  season_owner_summary_id uuid not null references public.touchline_season_owner_summaries(id) on delete restrict,
  actor_id uuid references public.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) > 0),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists touchline_season_owner_summaries_user_idx
  on public.touchline_season_owner_summaries(user_id, season_id);
create index if not exists touchline_season_owner_honours_summary_idx
  on public.touchline_season_owner_honours(season_owner_summary_id, honour_type);
create index if not exists touchline_season_owner_history_corrections_summary_idx
  on public.touchline_season_owner_history_corrections(season_owner_summary_id, created_at desc);

-- Reuse the project-wide updated_at convention rather than asking each server
-- caller to maintain timestamps by hand.
drop trigger if exists touchline_season_owner_summaries_updated on public.touchline_season_owner_summaries;
create trigger touchline_season_owner_summaries_updated
  before update on public.touchline_season_owner_summaries
  for each row execute function public.touch_updated_at();

-- Frozen fields cannot be silently changed. A controlled server correction
-- procedure enables the transaction-local flag and records the before/after
-- audit state below.
create or replace function public.touchline_guard_frozen_season_summary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.summary_status = 'frozen'
    and (
      new.final_rank is distinct from old.final_rank
      or new.total_touchline_points is distinct from old.total_touchline_points
      or new.best_weekly_rank is distinct from old.best_weekly_rank
      or new.summary_status is distinct from old.summary_status
      or new.validated_at is distinct from old.validated_at
      or new.frozen_at is distinct from old.frozen_at
      or new.source_reset_run_id is distinct from old.source_reset_run_id
      or new.metadata is distinct from old.metadata
    )
    and coalesce(current_setting('touchline.postseason_correction', true), '') <> 'authorized'
  then
    raise exception 'Frozen TouchLine season summaries require an audited server correction.';
  end if;

  return new;
end;
$$;

drop trigger if exists touchline_guard_frozen_season_summary on public.touchline_season_owner_summaries;
create trigger touchline_guard_frozen_season_summary
  before update on public.touchline_season_owner_summaries
  for each row execute function public.touchline_guard_frozen_season_summary();

create or replace function public.touchline_guard_frozen_season_honour()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_summary_id uuid := coalesce(new.season_owner_summary_id, old.season_owner_summary_id);
begin
  if exists (
    select 1
    from public.touchline_season_owner_summaries
    where id = target_summary_id and summary_status = 'frozen'
  ) and coalesce(current_setting('touchline.postseason_correction', true), '') <> 'authorized'
  then
    raise exception 'Frozen TouchLine season honours require an audited server correction.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists touchline_guard_frozen_season_honour on public.touchline_season_owner_honours;
create trigger touchline_guard_frozen_season_honour
  before insert or update or delete on public.touchline_season_owner_honours
  for each row execute function public.touchline_guard_frozen_season_honour();

-- The only prepared correction path is server-owned. It creates one auditable
-- before/after snapshot and keeps the final history frozen afterwards.
create or replace function public.touchline_correct_frozen_season_summary(
  p_summary_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_final_rank integer,
  p_total_touchline_points integer,
  p_best_weekly_rank integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_state jsonb;
  after_state jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A frozen season correction reason is required.';
  end if;

  select jsonb_build_object(
    'final_rank', final_rank,
    'total_touchline_points', total_touchline_points,
    'best_weekly_rank', best_weekly_rank,
    'summary_status', summary_status,
    'validated_at', validated_at,
    'frozen_at', frozen_at
  ) into before_state
  from public.touchline_season_owner_summaries
  where id = p_summary_id and summary_status = 'frozen'
  for update;

  if before_state is null then
    raise exception 'Frozen TouchLine season summary was not found.';
  end if;

  perform set_config('touchline.postseason_correction', 'authorized', true);
  update public.touchline_season_owner_summaries
  set
    final_rank = p_final_rank,
    total_touchline_points = p_total_touchline_points,
    best_weekly_rank = p_best_weekly_rank
  where id = p_summary_id;

  select jsonb_build_object(
    'final_rank', final_rank,
    'total_touchline_points', total_touchline_points,
    'best_weekly_rank', best_weekly_rank,
    'summary_status', summary_status,
    'validated_at', validated_at,
    'frozen_at', frozen_at
  ) into after_state
  from public.touchline_season_owner_summaries
  where id = p_summary_id;

  insert into public.touchline_season_owner_history_corrections (
    season_owner_summary_id,
    actor_id,
    reason,
    before_state,
    after_state
  ) values (
    p_summary_id,
    p_actor_id,
    btrim(p_reason),
    before_state,
    after_state
  );
end;
$$;

create or replace function public.touchline_correct_frozen_season_honours(
  p_summary_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_honours jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_state jsonb;
  after_state jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A frozen season correction reason is required.';
  end if;
  if jsonb_typeof(p_honours) <> 'array' then
    raise exception 'Frozen season honours must be supplied as an array.';
  end if;
  if not exists (
    select 1 from public.touchline_season_owner_summaries
    where id = p_summary_id and summary_status = 'frozen'
  ) then
    raise exception 'Frozen TouchLine season summary was not found.';
  end if;

  select jsonb_build_object('honours', coalesce(jsonb_agg(jsonb_build_object(
    'honour_type', honour_type,
    'title', title,
    'detail', detail
  ) order by honour_type, title), '[]'::jsonb)) into before_state
  from public.touchline_season_owner_honours
  where season_owner_summary_id = p_summary_id;

  perform set_config('touchline.postseason_correction', 'authorized', true);
  delete from public.touchline_season_owner_honours
  where season_owner_summary_id = p_summary_id;

  insert into public.touchline_season_owner_honours (
    season_owner_summary_id,
    honour_type,
    title,
    detail
  )
  select
    p_summary_id,
    item.honour_type,
    btrim(item.title),
    nullif(btrim(item.detail), '')
  from jsonb_to_recordset(p_honours) as item(honour_type text, title text, detail text);

  select jsonb_build_object('honours', coalesce(jsonb_agg(jsonb_build_object(
    'honour_type', honour_type,
    'title', title,
    'detail', detail
  ) order by honour_type, title), '[]'::jsonb)) into after_state
  from public.touchline_season_owner_honours
  where season_owner_summary_id = p_summary_id;

  insert into public.touchline_season_owner_history_corrections (
    season_owner_summary_id,
    actor_id,
    reason,
    before_state,
    after_state
  ) values (
    p_summary_id,
    p_actor_id,
    btrim(p_reason),
    before_state,
    after_state
  );
end;
$$;

alter table public.touchline_season_owner_summaries enable row level security;
alter table public.touchline_season_owner_honours enable row level security;
alter table public.touchline_season_owner_history_corrections enable row level security;
revoke all on table public.touchline_season_owner_summaries from anon, authenticated;
revoke all on table public.touchline_season_owner_honours from anon, authenticated;
revoke all on table public.touchline_season_owner_history_corrections from anon, authenticated;
grant select, insert, update on table public.touchline_season_owner_summaries to service_role;
grant select, insert, update on table public.touchline_season_owner_honours to service_role;
grant select, insert on table public.touchline_season_owner_history_corrections to service_role;
revoke all on function public.touchline_correct_frozen_season_summary(uuid, uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.touchline_correct_frozen_season_summary(uuid, uuid, text, integer, integer, integer) to service_role;
revoke all on function public.touchline_correct_frozen_season_honours(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.touchline_correct_frozen_season_honours(uuid, uuid, text, jsonb) to service_role;

comment on table public.touchline_season_owner_summaries is
  'Server-owned ClubOwner season result: draft while reconciling, validated once official and frozen once definitive. Null final values stay null; no result is invented.';
comment on table public.touchline_season_owner_honours is
  'Historical honours for one ClubOwner season summary. Frozen-summary changes are rejected unless performed by the audited server correction path.';
comment on table public.touchline_season_owner_history_corrections is
  'Server-only audit trail for exceptional corrections to a frozen ClubOwner season history.';

commit;
