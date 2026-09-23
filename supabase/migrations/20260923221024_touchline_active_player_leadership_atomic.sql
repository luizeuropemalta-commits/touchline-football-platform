begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Activation and the immutable decision commit together. The existing publisher
-- remains authoritative for auditing, scoring coverage and authorization.
create or replace function public.ensure_active_touchline_player_leadership()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  candidate public.touchline_card_ranking_snapshots%rowtype;
begin
  select * into candidate from public.touchline_card_ranking_snapshots
   where snapshot_id = new.snapshot_id and league_key = new.league_key for update;
  if not found or candidate.status <> 'published'
     or candidate.source <> 'sportmonks-audited'
     or candidate.published_at is null
     or (candidate.audit_report ->> 'passed')::boolean is not true then
    raise exception 'TL_ACTIVE_LEADERSHIP_SNAPSHOT_INVALID';
  end if;
  if not exists (select 1 from public.touchline_player_ranking_leadership_decisions
                 where snapshot_id = candidate.snapshot_id) then
    perform public.publish_touchline_player_ranking_leadership_decision(
      candidate.snapshot_id, candidate.league_key, candidate.published_at);
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_active_touchline_player_leadership() from public, anon, authenticated;

create trigger touchline_active_player_leadership
after insert or update on public.touchline_card_ranking_active_snapshots
for each row execute function public.ensure_active_touchline_player_leadership();

-- Repair only current, already published/audited pointers. Never rewrite a
-- decision or backfill inactive history. Lock the same snapshot as the writer.
do $$
declare candidate record;
begin
  for candidate in
    select s.snapshot_id, s.league_key, s.published_at
    from public.touchline_card_ranking_snapshots s
    join public.touchline_card_ranking_active_snapshots a
      on a.snapshot_id = s.snapshot_id and a.league_key = s.league_key
    where s.status = 'published' and s.source = 'sportmonks-audited'
      and s.published_at is not null and (s.audit_report ->> 'passed')::boolean is true
    for update of s, a
  loop
    if not exists (select 1 from public.touchline_player_ranking_leadership_decisions
                   where snapshot_id = candidate.snapshot_id) then
      perform public.publish_touchline_player_ranking_leadership_decision(
        candidate.snapshot_id, candidate.league_key, candidate.published_at);
    end if;
  end loop;
end;
$$;
commit;
