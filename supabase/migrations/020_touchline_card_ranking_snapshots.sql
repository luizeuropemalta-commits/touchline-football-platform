create table if not exists public.touchline_card_ranking_snapshots (
  snapshot_id text primary key,
  league_key text not null,
  season_id text not null,
  round_id text not null,
  source text not null check (source = 'sportmonks-audited'),
  status text not null check (status in ('audited', 'published')),
  generated_at timestamptz not null,
  audited_at timestamptz not null,
  published_at timestamptz,
  price_table_version text not null,
  checksum text not null unique,
  expected_player_count integer not null check (expected_player_count > 0),
  actual_player_count integer not null check (actual_player_count = expected_player_count),
  ranking_payload jsonb not null,
  selection_version text not null,
  selection_payload jsonb not null,
  audit_report jsonb not null,
  created_at timestamptz not null default now(),
  check (audited_at >= generated_at),
  check (published_at is null or published_at >= audited_at),
  check (selection_payload ? 'sourceSnapshotId'),
  check (selection_payload ? 'complete'),
  check (jsonb_typeof(selection_payload -> 'players') = 'array'),
  check (selection_payload ->> 'sourceSnapshotId' = snapshot_id),
  check ((selection_payload ->> 'complete')::boolean is true),
  check (jsonb_array_length(selection_payload -> 'players') = 11),
  check (audit_report ? 'passed'),
  check ((audit_report ->> 'passed')::boolean is true)
);

create table if not exists public.touchline_card_ranking_active_snapshots (
  league_key text primary key,
  snapshot_id text not null references public.touchline_card_ranking_snapshots(snapshot_id) on delete restrict,
  activated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists touchline_card_ranking_snapshots_round_idx
  on public.touchline_card_ranking_snapshots(league_key, season_id, round_id, created_at desc);

create or replace function public.reject_published_touchline_ranking_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'Published TouchLine ranking snapshots are immutable.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists touchline_card_ranking_snapshots_immutable on public.touchline_card_ranking_snapshots;
create trigger touchline_card_ranking_snapshots_immutable
  before update or delete on public.touchline_card_ranking_snapshots
  for each row execute function public.reject_published_touchline_ranking_mutation();

create or replace function public.publish_touchline_card_ranking_snapshot(
  requested_snapshot_id text,
  requested_league_key text,
  requested_published_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.touchline_card_ranking_snapshots%rowtype;
begin
  select *
    into candidate
    from public.touchline_card_ranking_snapshots
   where snapshot_id = requested_snapshot_id
     and league_key = requested_league_key
   for update;

  if not found then
    raise exception 'TouchLine ranking snapshot was not found.';
  end if;
  if candidate.status <> 'audited' or candidate.source <> 'sportmonks-audited' then
    raise exception 'Only an audited SportMonks snapshot can be published.';
  end if;
  if candidate.actual_player_count <> candidate.expected_player_count
     or coalesce(candidate.checksum, '') = ''
     or (candidate.audit_report ->> 'passed')::boolean is not true
     or (candidate.selection_payload ->> 'complete')::boolean is not true
     or candidate.selection_payload ->> 'sourceSnapshotId' <> candidate.snapshot_id
     or jsonb_array_length(candidate.selection_payload -> 'players') <> 11 then
    raise exception 'TouchLine ranking snapshot failed the publication barrier.';
  end if;
  if requested_published_at < candidate.audited_at then
    raise exception 'Publication cannot happen before audit.';
  end if;

  update public.touchline_card_ranking_snapshots
     set status = 'published', published_at = requested_published_at
   where snapshot_id = candidate.snapshot_id;

  insert into public.touchline_card_ranking_active_snapshots (
    league_key,
    snapshot_id,
    activated_at,
    updated_at
  ) values (
    requested_league_key,
    candidate.snapshot_id,
    requested_published_at,
    now()
  )
  on conflict (league_key) do update
    set snapshot_id = excluded.snapshot_id,
        activated_at = excluded.activated_at,
        updated_at = excluded.updated_at;

  return candidate.snapshot_id;
end;
$$;

alter table public.touchline_card_ranking_snapshots enable row level security;
alter table public.touchline_card_ranking_active_snapshots enable row level security;

revoke all on function public.reject_published_touchline_ranking_mutation() from public;
revoke all on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) from public;

grant select, insert, update, delete on public.touchline_card_ranking_snapshots to service_role;
grant select, insert, update, delete on public.touchline_card_ranking_active_snapshots to service_role;
grant execute on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) to service_role;
