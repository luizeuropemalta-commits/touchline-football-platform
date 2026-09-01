-- Fail-closed rollback for the unapplied Card Engine provisional-field policy.
-- This rollback removes schema only when no provisional/resolution evidence has
-- ever been written. It never deletes a player, publication or audit record.
begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (
    select 1 from public.touchline_card_editorial_overrides
     where status = 'provisional'
        or provenance_status in (
          'PROVISIONAL_MISSING_SHIRT', 'PROVISIONAL_MISSING_MARKET_VALUE',
          'CANONICAL_LINEUP_RESOLVED', 'LICENSED_MARKET_VALUE_RESOLVED'
        )
  ) or exists (
    select 1 from public.football_player_market_values
     where status = 'provisional' or confidence = 'provisional'
        or source = 'touchline_card_engine_provisional'
  ) or exists (
    select 1 from public.touchline_card_publications
     where internal_source in (
       'touchline_card_engine_provisional_defaults',
       'touchline_card_engine_verified_market_value',
       'touchline_card_engine_verified_inputs'
     )
  ) or exists (
    select 1 from public.touchline_card_editorial_audit_events
     where event_type in ('provisional_defaulted', 'provisional_resolved')
  ) then
    raise exception using errcode = '55000', message = 'TL_CARD_PROVISIONAL_ROLLBACK_DATA_PRESENT';
  end if;
end;
$$;

drop function if exists public.touchline_card_engine_resolve_provisional_market_value(uuid,text,bigint,timestamptz,text);
drop function if exists public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamptz,jsonb);
drop function if exists public.touchline_card_engine_ensure_provisional_defaults(uuid,text,timestamptz,timestamptz,jsonb);
drop index if exists public.touchline_card_editorial_provisional_queue_idx;

alter table public.touchline_card_editorial_overrides
  drop constraint if exists touchline_card_editorial_overrides_provisional_check;
alter table public.touchline_card_editorial_overrides
  drop constraint if exists touchline_card_editorial_overrides_status_check;
alter table public.touchline_card_editorial_overrides
  add constraint touchline_card_editorial_overrides_status_check
  check (status in ('draft', 'review', 'approved', 'stale', 'reverted'));

alter table public.football_player_market_values
  drop constraint if exists football_player_market_values_confidence_check;
alter table public.football_player_market_values
  add constraint football_player_market_values_confidence_check
  check (confidence in ('pending', 'reviewed', 'verified'));
alter table public.football_player_market_values
  drop constraint if exists football_player_market_values_status_check;
alter table public.football_player_market_values
  add constraint football_player_market_values_status_check
  check (status in ('pending', 'ready', 'verified', 'rejected', 'unavailable'));

alter table public.football_player_market_value_history
  drop constraint if exists football_player_market_value_history_confidence_check;
alter table public.football_player_market_value_history
  add constraint football_player_market_value_history_confidence_check
  check (confidence in ('reviewed', 'verified'));

alter table public.touchline_card_editorial_audit_events
  drop constraint if exists touchline_card_editorial_audit_events_event_type_check;
alter table public.touchline_card_editorial_audit_events
  add constraint touchline_card_editorial_audit_events_event_type_check
  check (event_type in (
    'batch_created', 'item_resolved', 'batch_approved', 'override_published',
    'market_value_published', 'batch_reverted', 'stale_detected'
  ));

alter table public.touchline_card_editorial_overrides
  drop column if exists sources_consulted,
  drop column if exists next_verification_at,
  drop column if exists last_verification_at,
  drop column if exists provisional_reason,
  drop column if exists provenance_status;

commit;
