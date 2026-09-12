-- Published player leadership is a snapshot-bound, immutable decision. It is
-- intentionally separate from card artwork and never inferred in the browser.
create table if not exists public.touchline_player_ranking_leadership_decisions (
  snapshot_id text primary key references public.touchline_card_ranking_snapshots(snapshot_id) on delete restrict,
  league_key text not null,
  ranking_id text not null check (ranking_id = 'touchline-player-overall'),
  status text not null check (status in ('unique-leader', 'tied', 'unavailable')),
  leader_player_id uuid references public.football_players(id) on delete restrict,
  contender_player_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(contender_player_ids) = 'array'),
  decided_at timestamptz not null,
  check ((status = 'unique-leader' and leader_player_id is not null and jsonb_array_length(contender_player_ids) = 0)
      or (status = 'tied' and leader_player_id is null and jsonb_array_length(contender_player_ids) > 1)
      or (status = 'unavailable' and leader_player_id is null and jsonb_array_length(contender_player_ids) = 0))
);

create or replace function public.reject_touchline_player_ranking_leadership_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Published TouchLine player leadership decisions are immutable.'; end if;
  return new;
end;
$$;
create trigger touchline_player_ranking_leadership_decisions_immutable
  before update or delete on public.touchline_player_ranking_leadership_decisions
  for each row execute function public.reject_touchline_player_ranking_leadership_mutation();

create or replace function public.publish_touchline_player_ranking_leadership_decision(
  requested_snapshot_id text,
  requested_league_key text,
  requested_decided_at timestamptz
) returns text language plpgsql security definer set search_path = '' as $$
declare
  snapshot public.touchline_card_ranking_snapshots%rowtype;
  leader_id uuid;
  leader_count integer;
  contenders jsonb;
begin
  select * into snapshot from public.touchline_card_ranking_snapshots
   where snapshot_id = requested_snapshot_id and league_key = requested_league_key for update;
  if not found or snapshot.status <> 'published' or snapshot.source <> 'sportmonks-audited' then
    raise exception 'Player leadership requires an immutable published SportMonks snapshot.';
  end if;
  if exists (select 1 from public.touchline_player_ranking_leadership_decisions where snapshot_id = snapshot.snapshot_id) then
    raise exception 'Player leadership decision already exists for this snapshot.';
  end if;
  with valid_players as (
    select (player ->> 'playerId')::uuid as player_id, (player ->> 'totalRating')::numeric as total_rating
      from jsonb_array_elements(
        case when jsonb_typeof(snapshot.ranking_payload -> 'players') = 'array'
          then snapshot.ranking_payload -> 'players'
          else '[]'::jsonb
        end
      ) player
     where jsonb_typeof(player) = 'object'
       and player ->> 'playerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and jsonb_typeof(player -> 'totalRating') = 'number'
       and (player ->> 'totalRating')::numeric <> 'NaN'::numeric
       and (player ->> 'totalRating')::numeric <> 'Infinity'::numeric
  ), leaders as (
    select player_id from valid_players where total_rating = (select max(total_rating) from valid_players)
  )
  select count(*), min(player_id::text)::uuid, coalesce(jsonb_agg(player_id::text order by player_id::text), '[]'::jsonb)
    into leader_count, leader_id, contenders from leaders;
  if leader_count = 1 then
    insert into public.touchline_player_ranking_leadership_decisions (snapshot_id, league_key, ranking_id, status, leader_player_id, contender_player_ids, decided_at)
    values (snapshot.snapshot_id, snapshot.league_key, 'touchline-player-overall', 'unique-leader', leader_id, '[]'::jsonb, requested_decided_at);
  elsif leader_count > 1 then
    insert into public.touchline_player_ranking_leadership_decisions (snapshot_id, league_key, ranking_id, status, leader_player_id, contender_player_ids, decided_at)
    values (snapshot.snapshot_id, snapshot.league_key, 'touchline-player-overall', 'tied', null, contenders, requested_decided_at);
  else
    insert into public.touchline_player_ranking_leadership_decisions (snapshot_id, league_key, ranking_id, status, leader_player_id, contender_player_ids, decided_at)
    values (snapshot.snapshot_id, snapshot.league_key, 'touchline-player-overall', 'unavailable', null, '[]'::jsonb, requested_decided_at);
  end if;
  return snapshot.snapshot_id;
end;
$$;

-- Backfill only immutable published snapshots. A unique rating maximum becomes
-- an explicit decision; ties and malformed data remain crownless by design.
do $$
declare row record;
begin
  for row in select snapshot_id, league_key, published_at from public.touchline_card_ranking_snapshots
    where status = 'published' and source = 'sportmonks-audited'
  loop
    perform public.publish_touchline_player_ranking_leadership_decision(row.snapshot_id, row.league_key, coalesce(row.published_at, now()));
  end loop;
end;
$$;

alter table public.touchline_player_ranking_leadership_decisions enable row level security;
revoke all privileges on table public.touchline_player_ranking_leadership_decisions from public, anon, authenticated;
revoke all on function public.reject_touchline_player_ranking_leadership_mutation() from public, anon, authenticated;
revoke all on function public.publish_touchline_player_ranking_leadership_decision(text, text, timestamptz) from public, anon, authenticated;
grant select on public.touchline_player_ranking_leadership_decisions to service_role;
grant execute on function public.publish_touchline_player_ranking_leadership_decision(text, text, timestamptz) to service_role;
