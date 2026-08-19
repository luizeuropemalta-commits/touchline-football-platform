-- Preserve every legacy QA representative fixture before removing it from the
-- canonical Sportmonks schedule. The archive stays server-only and is the
-- rollback source; no official fixture is modified by this migration.

create table if not exists public.football_fixture_legacy_quarantine (
  original_fixture_id uuid primary key,
  fixture_row jsonb not null,
  quarantine_reason text not null,
  archived_at timestamptz not null default now()
);

alter table public.football_fixture_legacy_quarantine enable row level security;
revoke all privileges on table public.football_fixture_legacy_quarantine from public, anon, authenticated;
grant select, insert, delete on table public.football_fixture_legacy_quarantine to service_role;

comment on table public.football_fixture_legacy_quarantine is
  'Server-only rollback archive for noncanonical fixture records removed from the TouchLine public fixture schedule.';

insert into public.football_fixture_legacy_quarantine (
  original_fixture_id,
  fixture_row,
  quarantine_reason
)
select
  fixture.id,
  to_jsonb(fixture),
  'Legacy QA representative fixture does not have a canonical numeric Sportmonks fixture ID.'
from public.football_fixtures as fixture
where fixture.provider = 'sportmonks'
  and fixture.provider_fixture_id like 'qa-representative-%'
on conflict (original_fixture_id) do nothing;

delete from public.football_fixtures as fixture
using public.football_fixture_legacy_quarantine as quarantine
where fixture.id = quarantine.original_fixture_id
  and quarantine.quarantine_reason = 'Legacy QA representative fixture does not have a canonical numeric Sportmonks fixture ID.';

-- Rollback: restore archived records first, then optionally remove their archive rows.
-- insert into public.football_fixtures (
--   id, provider, provider_fixture_id, competition_id, season_id,
--   home_club_id, away_club_id, starts_at, status, home_score, away_score,
--   source_updated_at, created_at, updated_at
-- )
-- select
--   source.id, source.provider, source.provider_fixture_id, source.competition_id, source.season_id,
--   source.home_club_id, source.away_club_id, source.starts_at, source.status, source.home_score, source.away_score,
--   source.source_updated_at, source.created_at, source.updated_at
-- from public.football_fixture_legacy_quarantine as quarantine
-- cross join lateral jsonb_to_record(quarantine.fixture_row) as source(
--   id uuid, provider text, provider_fixture_id text, competition_id uuid, season_id uuid,
--   home_club_id uuid, away_club_id uuid, starts_at timestamptz, status text, home_score integer, away_score integer,
--   source_updated_at timestamptz, created_at timestamptz, updated_at timestamptz
-- )
-- where quarantine.quarantine_reason = 'Legacy QA representative fixture does not have a canonical numeric Sportmonks fixture ID.'
-- on conflict (provider, provider_fixture_id) do nothing;
