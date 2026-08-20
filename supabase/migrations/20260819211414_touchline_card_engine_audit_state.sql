-- Audit state must describe the transition, rather than the post-save state
-- twice.  The command keeps the immutable audit table; this insert-time
-- normalizer derives the pre-save state from the protected canonical facts.
begin;
set local lock_timeout = '5s';

create or replace function public.touchline_card_editorial_override_audit_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_market public.football_player_market_values%rowtype;
  v_has_club_asset boolean := false;
  v_missing boolean := false;
begin
  select * into v_market
    from public.football_player_market_values
   where player_id = new.player_id;

  select coalesce(nullif(trim(club.logo_url), '') is not null, false)
    into v_has_club_asset
    from public.football_players as player
    join public.football_clubs as club on club.id = player.current_club_id
   where player.id = new.player_id;

  v_missing := nullif(trim(new.effective_before ->> 'displayName'), '') is null
    or coalesce((new.effective_before ->> 'shirtNumber')::integer, 0) < 1
    or coalesce(new.effective_before ->> 'countryCode3', '') !~ '^[A-Z]{3}$'
    or nullif(trim(new.effective_before ->> 'position'), '') is null
    or v_market.id is null
    or v_market.status <> 'verified'
    or v_market.confidence <> 'verified'
    or v_market.market_value_eur is null
    or v_market.market_value_eur < 0
    or nullif(trim(v_market.verified_season), '') is null
    or coalesce(v_has_club_asset, false) is not true;

  new.card_state_before := case when v_missing then 'REVIEW_REQUIRED' else 'COMPLETE' end;
  return new;
end;
$$;

revoke all on function public.touchline_card_editorial_override_audit_state() from public, anon, authenticated;
grant execute on function public.touchline_card_editorial_override_audit_state() to service_role;

drop trigger if exists touchline_card_editorial_override_audit_state on public.touchline_card_editorial_override_audit;
create trigger touchline_card_editorial_override_audit_state
  before insert on public.touchline_card_editorial_override_audit
  for each row execute function public.touchline_card_editorial_override_audit_state();

comment on function public.touchline_card_editorial_override_audit_state() is
  'Derives the immutable audit pre-save Card Engine state from protected canonical facts.';
commit;
