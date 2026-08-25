-- TouchLine Fantasy Gameweek V1.
--
-- Forward-only, server-owned foundation. The provider Rating remains the only
-- scoring fact; the sole Fantasy modifier is one 2x multiplier when a player
-- scores three or more goals in the same fixture. Legacy event points and
-- TouchLine Points are deliberately absent from every active scoring path.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_fantasy_configs (
  id uuid primary key default gen_random_uuid(),
  competition_key text not null check (competition_key = 'england'),
  competition_id uuid not null references public.football_competitions(id) on delete restrict,
  season_id uuid not null references public.football_seasons(id) on delete restrict,
  subscription_price_minor integer not null check (subscription_price_minor = 2990),
  subscription_currency char(3) not null check (subscription_currency = 'GBP'),
  budget_eur bigint not null check (budget_eur > 0),
  max_players_per_club integer not null default 3 check (max_players_per_club between 1 and 11),
  lock_offset_minutes integer not null default 90 check (lock_offset_minutes between 1 and 1440),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, season_id)
);

create unique index if not exists touchline_fantasy_one_active_config_idx
  on public.touchline_fantasy_configs (competition_key)
  where status = 'active';

create table if not exists public.touchline_fantasy_entitlements (
  user_id uuid not null references public.users(id) on delete restrict,
  entitlement_key text not null default 'fantasy_access' check (entitlement_key = 'fantasy_access'),
  status text not null check (status in ('active', 'inactive', 'past_due', 'canceled', 'expired')),
  source text not null check (source in ('stripe_test', 'qa_grant')),
  provider_customer_reference text,
  provider_subscription_reference text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement_key),
  check (current_period_end is null or current_period_start is null or current_period_end >= current_period_start)
);

create unique index if not exists touchline_fantasy_entitlement_subscription_idx
  on public.touchline_fantasy_entitlements (provider_subscription_reference)
  where provider_subscription_reference is not null;

create table if not exists public.touchline_fantasy_subscription_events (
  provider_event_id text primary key,
  event_type text not null,
  livemode boolean not null check (livemode = false),
  user_id uuid not null references public.users(id) on delete restrict,
  provider_subscription_reference text,
  entitlement_status text not null check (entitlement_status in ('active', 'inactive', 'past_due', 'canceled', 'expired')),
  processed_at timestamptz not null default now()
);

create table if not exists public.touchline_fantasy_gameweeks (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.football_competitions(id) on delete restrict,
  season_id uuid not null references public.football_seasons(id) on delete restrict,
  round_id uuid not null references public.football_rounds(id) on delete restrict,
  gameweek_number integer not null check (gameweek_number between 1 and 60),
  state text not null check (state in ('UPCOMING', 'MARKET_OPEN', 'LOCKED', 'LIVE', 'FINAL', 'SETTLED')),
  market_opens_at timestamptz not null,
  locks_at timestamptz not null,
  first_fixture_at timestamptz not null,
  last_fixture_at timestamptz not null,
  finalized_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id),
  unique (competition_id, season_id, gameweek_number),
  check (market_opens_at < locks_at and locks_at < first_fixture_at and first_fixture_at <= last_fixture_at)
);

create index if not exists touchline_fantasy_gameweeks_state_idx
  on public.touchline_fantasy_gameweeks (season_id, state, locks_at);

create table if not exists public.touchline_fantasy_user_gameweeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  gameweek_id uuid not null references public.touchline_fantasy_gameweeks(id) on delete restrict,
  formation_code text not null check (formation_code ~ '^[1-5](-[1-5]){2,3}$'),
  state text not null default 'DRAFT' check (state in ('DRAFT', 'CONFIRMED', 'LOCKED', 'FINAL')),
  budget_eur_snapshot bigint not null check (budget_eur_snapshot > 0),
  max_players_per_club_snapshot integer not null check (max_players_per_club_snapshot between 1 and 11),
  total_market_value_eur bigint not null default 0 check (total_market_value_eur >= 0),
  carry_source_user_gameweek_id uuid references public.touchline_fantasy_user_gameweeks(id) on delete set null,
  last_idempotency_key text check (last_idempotency_key is null or length(last_idempotency_key) between 8 and 160),
  confirmed_at timestamptz,
  locked_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gameweek_id)
);

create index if not exists touchline_fantasy_user_gameweeks_user_idx
  on public.touchline_fantasy_user_gameweeks (user_id, created_at desc);

create table if not exists public.touchline_fantasy_user_gameweek_selections (
  user_gameweek_id uuid not null references public.touchline_fantasy_user_gameweeks(id) on delete cascade,
  slot_id text not null check (length(btrim(slot_id)) between 1 and 24),
  slot_index integer not null check (slot_index between 1 and 11),
  player_id uuid not null references public.football_players(id) on delete restrict,
  club_id uuid not null references public.football_clubs(id) on delete restrict,
  formation_role text not null check (formation_role in ('goalkeeper', 'defender', 'midfielder', 'forward')),
  position_bucket text not null check (position_bucket in ('goalkeeper', 'centre-back', 'right-back', 'left-back', 'defensive-midfield', 'midfield', 'attacker', 'centre-forward')),
  market_value_eur bigint not null check (market_value_eur >= 0),
  selected_at timestamptz not null default now(),
  primary key (user_gameweek_id, slot_id),
  unique (user_gameweek_id, slot_index),
  unique (user_gameweek_id, player_id)
);

create index if not exists touchline_fantasy_selections_player_idx
  on public.touchline_fantasy_user_gameweek_selections (player_id, user_gameweek_id);

create table if not exists public.touchline_fantasy_locked_selections (
  user_gameweek_id uuid not null references public.touchline_fantasy_user_gameweeks(id) on delete restrict,
  slot_id text not null,
  slot_index integer not null check (slot_index between 1 and 11),
  player_id uuid not null references public.football_players(id) on delete restrict,
  club_id uuid not null references public.football_clubs(id) on delete restrict,
  formation_role text not null check (formation_role in ('goalkeeper', 'defender', 'midfielder', 'forward')),
  position_bucket text not null,
  market_value_eur bigint not null check (market_value_eur >= 0),
  locked_at timestamptz not null,
  primary key (user_gameweek_id, slot_id),
  unique (user_gameweek_id, slot_index),
  unique (user_gameweek_id, player_id)
);

create index if not exists touchline_fantasy_locked_player_idx
  on public.touchline_fantasy_locked_selections (player_id, user_gameweek_id);

create table if not exists public.touchline_fantasy_player_fixture_scores (
  id uuid primary key default gen_random_uuid(),
  gameweek_id uuid not null references public.touchline_fantasy_gameweeks(id) on delete restrict,
  player_id uuid not null references public.football_players(id) on delete restrict,
  fixture_id uuid not null references public.football_fixtures(id) on delete restrict,
  appearance_status text not null check (appearance_status in ('started', 'substitute', 'unused', 'absent', 'unavailable')),
  participation_status text not null check (participation_status in ('rated_appearance', 'no_provider_rating', 'did_not_play')),
  rating numeric(5,2) check (rating is null or (rating >= 0 and rating <= 10)),
  goals integer not null default 0 check (goals >= 0),
  hat_trick_multiplier integer not null default 1 check (hat_trick_multiplier in (1, 2)),
  fantasy_contribution numeric(10,2) not null default 0 check (fantasy_contribution >= 0),
  reason_code text not null check (reason_code in ('RATED_APPEARANCE', 'NO_PROVIDER_RATING', 'DID_NOT_PLAY')),
  settlement_status text not null check (settlement_status in ('PROVISIONAL', 'FINAL')),
  source_synced_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, fixture_id),
  check (
    (participation_status = 'rated_appearance' and rating is not null and reason_code = 'RATED_APPEARANCE')
    or (participation_status = 'no_provider_rating' and rating is null and fantasy_contribution = 0 and reason_code = 'NO_PROVIDER_RATING')
    or (participation_status = 'did_not_play' and rating is null and fantasy_contribution = 0 and reason_code = 'DID_NOT_PLAY')
  ),
  check (
    (goals >= 3 and hat_trick_multiplier = 2)
    or (goals < 3 and hat_trick_multiplier = 1)
  )
);

create index if not exists touchline_fantasy_player_scores_gameweek_idx
  on public.touchline_fantasy_player_fixture_scores (gameweek_id, player_id, settlement_status);

create table if not exists public.touchline_fantasy_user_gameweek_scores (
  user_gameweek_id uuid primary key references public.touchline_fantasy_user_gameweeks(id) on delete restrict,
  gameweek_score numeric(12,2) not null default 0 check (gameweek_score >= 0),
  settlement_status text not null check (settlement_status in ('PROVISIONAL', 'FINAL')),
  checksum text not null,
  calculated_at timestamptz not null default now(),
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.touchline_fantasy_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete restrict,
  gameweek_id uuid references public.touchline_fantasy_gameweeks(id) on delete restrict,
  event_type text not null check (event_type in ('DRAFT_SAVED', 'XI_CONFIRMED', 'XI_LOCKED', 'SCORE_RECONCILED', 'ENTITLEMENT_CHANGED')),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index if not exists touchline_fantasy_audit_idempotency_idx
  on public.touchline_fantasy_audit_events (idempotency_key)
  where idempotency_key is not null;

create or replace function public.touchline_fantasy_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'touchline_fantasy_configs',
    'touchline_fantasy_entitlements',
    'touchline_fantasy_gameweeks',
    'touchline_fantasy_user_gameweeks',
    'touchline_fantasy_player_fixture_scores',
    'touchline_fantasy_user_gameweek_scores'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touchline_fantasy_touch_updated_at()',
      table_name || '_updated',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.touchline_fantasy_locked_selection_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'TL_FANTASY_LOCKED_SELECTION_IMMUTABLE';
end;
$$;

drop trigger if exists touchline_fantasy_locked_selection_immutable
  on public.touchline_fantasy_locked_selections;
create trigger touchline_fantasy_locked_selection_immutable
  before update or delete on public.touchline_fantasy_locked_selections
  for each row execute function public.touchline_fantasy_locked_selection_is_immutable();

create or replace function public.touchline_fantasy_position_bucket(p_position text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_position, '')) ~ '(goalkeeper|keeper|goleiro|(^|[^a-z])gk([^a-z]|$))' then 'goalkeeper'
    when lower(coalesce(p_position, '')) ~ '(centre back|center back|central defender|zagueiro|(^|[^a-z])cb([^a-z]|$))' then 'centre-back'
    when lower(coalesce(p_position, '')) ~ '(right back|right wing back|lateral direito|(^|[^a-z])(rb|rwb)([^a-z]|$))' then 'right-back'
    when lower(coalesce(p_position, '')) ~ '(left back|left wing back|lateral esquerdo|(^|[^a-z])(lb|lwb)([^a-z]|$))' then 'left-back'
    when lower(coalesce(p_position, '')) ~ '(defensive midfield|defensive midfielder|holding midfield|volante|(^|[^a-z])(cdm|dm)([^a-z]|$))' then 'defensive-midfield'
    when lower(coalesce(p_position, '')) ~ '(centre forward|center forward|striker|centroavante|(^|[^a-z])(st|cf)([^a-z]|$))' then 'centre-forward'
    when lower(coalesce(p_position, '')) ~ '(left wing|right wing|winger|attacker|atacante|(^|[^a-z])(lw|rw|ss)([^a-z]|$))' then 'attacker'
    when lower(coalesce(p_position, '')) ~ '(midfield|midfielder|meia|(^|[^a-z])(cm|cam|am|lm|rm)([^a-z]|$))' then 'midfield'
    when lower(coalesce(p_position, '')) ~ '(defender|back)' then 'centre-back'
    when lower(coalesce(p_position, '')) ~ '(forward|wing)' then 'attacker'
    else null
  end
$$;

create or replace function public.touchline_fantasy_fixture_is_final(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_status, ''))) in (
    'ft', 'full time', 'finished', 'after penalties', 'aet', 'awarded'
  )
$$;

create or replace function public.touchline_fantasy_fixture_is_live(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_status, ''))) in (
    'live', '1st half', '2nd half', 'half time', 'extra time', 'penalties'
  )
$$;

create or replace function public.touchline_fantasy_entitlement_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.touchline_fantasy_entitlements entitlement
    where entitlement.user_id = p_user_id
      and entitlement.entitlement_key = 'fantasy_access'
      and entitlement.status = 'active'
      and (entitlement.current_period_start is null or entitlement.current_period_start <= now())
      and (entitlement.current_period_end is null or entitlement.current_period_end > now())
  )
$$;

create or replace function public.touchline_fantasy_sync_gameweeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  insert into public.touchline_fantasy_gameweeks (
    competition_id, season_id, round_id, gameweek_number, state,
    market_opens_at, locks_at, first_fixture_at, last_fixture_at
  )
  select
    round.competition_id,
    round.season_id,
    round.id,
    case when round.name ~ '^[0-9]+$' then round.name::integer else row_number() over (partition by round.season_id order by min(fixture.starts_at))::integer end,
    case
      when now() < min(fixture.starts_at) - interval '7 days' then 'UPCOMING'
      when now() < min(fixture.starts_at) - make_interval(mins => config.lock_offset_minutes) then 'MARKET_OPEN'
      when bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) then 'LIVE'
      when bool_and(public.touchline_fantasy_fixture_is_final(fixture.status)) then 'FINAL'
      else 'LOCKED'
    end,
    min(fixture.starts_at) - interval '7 days',
    min(fixture.starts_at) - make_interval(mins => config.lock_offset_minutes),
    min(fixture.starts_at),
    max(fixture.starts_at)
  from public.football_rounds round
  join public.football_fixtures fixture on fixture.round_id = round.id
  join public.touchline_fantasy_configs config
    on config.competition_id = round.competition_id
   and config.season_id = round.season_id
   and config.status = 'active'
  where fixture.starts_at is not null
  group by round.id, round.competition_id, round.season_id, round.name, config.lock_offset_minutes
  on conflict (round_id) do update
    set first_fixture_at = excluded.first_fixture_at,
        last_fixture_at = excluded.last_fixture_at,
        locks_at = excluded.locks_at,
        market_opens_at = excluded.market_opens_at,
        state = case
          when public.touchline_fantasy_gameweeks.state = 'SETTLED' then 'SETTLED'
          else excluded.state
        end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.touchline_fantasy_prepare_user_gameweek(
  p_user_id uuid,
  p_gameweek_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_config public.touchline_fantasy_configs%rowtype;
  v_existing uuid;
  v_previous public.touchline_fantasy_user_gameweeks%rowtype;
begin
  if not public.touchline_fantasy_entitlement_is_active(p_user_id) then
    raise exception 'TL_FANTASY_ENTITLEMENT_REQUIRED';
  end if;

  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  select * into v_config from public.touchline_fantasy_configs
   where competition_id = v_gameweek.competition_id and season_id = v_gameweek.season_id and status = 'active';
  if v_config.id is null then raise exception 'TL_FANTASY_CONFIG_NOT_FOUND'; end if;

  select id into v_existing from public.touchline_fantasy_user_gameweeks
   where user_id = p_user_id and gameweek_id = p_gameweek_id;
  if v_existing is not null then return v_existing; end if;

  select user_gameweek.* into v_previous
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_gameweeks gameweek on gameweek.id = user_gameweek.gameweek_id
  where user_gameweek.user_id = p_user_id
    and gameweek.season_id = v_gameweek.season_id
    and gameweek.gameweek_number < v_gameweek.gameweek_number
    and exists (
      select 1 from public.touchline_fantasy_locked_selections locked
      where locked.user_gameweek_id = user_gameweek.id
    )
  order by gameweek.gameweek_number desc
  limit 1;

  insert into public.touchline_fantasy_user_gameweeks (
    user_id, gameweek_id, formation_code, state, budget_eur_snapshot,
    max_players_per_club_snapshot, carry_source_user_gameweek_id
  ) values (
    p_user_id,
    p_gameweek_id,
    coalesce(v_previous.formation_code, '4-3-3'),
    'DRAFT',
    v_config.budget_eur,
    v_config.max_players_per_club,
    v_previous.id
  ) returning id into v_existing;

  if v_previous.id is not null then
    insert into public.touchline_fantasy_user_gameweek_selections (
      user_gameweek_id, slot_id, slot_index, player_id, club_id,
      formation_role, position_bucket, market_value_eur
    )
    select
      v_existing, locked.slot_id, locked.slot_index, locked.player_id, locked.club_id,
      locked.formation_role, locked.position_bucket, locked.market_value_eur
    from public.touchline_fantasy_locked_selections locked
    where locked.user_gameweek_id = v_previous.id
    order by locked.slot_index;

    update public.touchline_fantasy_user_gameweeks
       set total_market_value_eur = coalesce((
         select sum(selection.market_value_eur)
         from public.touchline_fantasy_user_gameweek_selections selection
         where selection.user_gameweek_id = v_existing
       ), 0)
     where id = v_existing;
  end if;

  return v_existing;
end;
$$;

create or replace function public.touchline_fantasy_save_lineup(
  p_user_id uuid,
  p_gameweek_id uuid,
  p_formation_code text,
  p_selections jsonb,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_config public.touchline_fantasy_configs%rowtype;
  v_user_gameweek_id uuid;
  v_geometry jsonb;
  v_count integer;
  v_invalid integer;
  v_total bigint;
  v_max_club integer;
begin
  if p_action not in ('draft', 'confirm') then raise exception 'TL_FANTASY_ACTION_INVALID'; end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then raise exception 'TL_FANTASY_IDEMPOTENCY_REQUIRED'; end if;
  if jsonb_typeof(p_selections) <> 'array' then raise exception 'TL_FANTASY_SELECTIONS_INVALID'; end if;
  if not public.touchline_fantasy_entitlement_is_active(p_user_id) then raise exception 'TL_FANTASY_ENTITLEMENT_REQUIRED'; end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  if v_gameweek.state <> 'MARKET_OPEN' or now() >= v_gameweek.locks_at then raise exception 'TL_FANTASY_GAMEWEEK_LOCKED'; end if;

  select * into v_config from public.touchline_fantasy_configs
   where competition_id = v_gameweek.competition_id and season_id = v_gameweek.season_id and status = 'active';
  if v_config.id is null then raise exception 'TL_FANTASY_CONFIG_NOT_FOUND'; end if;

  select geometry into v_geometry
  from public.touchline_formation_geometry_versions
  where formation_code = p_formation_code and status = 'published'
  order by geometry_version desc
  limit 1;
  if v_geometry is null then raise exception 'TL_FANTASY_FORMATION_NOT_PUBLISHED'; end if;

  select count(*), count(distinct item."playerId"), count(distinct item."slotId")
    into v_count, v_invalid, v_max_club
  from jsonb_to_recordset(p_selections) as item("playerId" text, "slotId" text);
  if v_count > 11 or v_count <> v_invalid or v_count <> v_max_club then raise exception 'TL_FANTASY_SELECTION_DUPLICATE_OR_OVERSIZED'; end if;
  if p_action = 'confirm' and v_count <> 11 then raise exception 'TL_FANTASY_XI_REQUIRES_11'; end if;

  with requested as (
    select item."playerId"::uuid player_id, item."slotId" slot_id
    from jsonb_to_recordset(p_selections) as item("playerId" text, "slotId" text)
    where item."playerId" ~* '^[0-9a-f-]{36}$' and length(btrim(item."slotId")) between 1 and 24
  ), eligible as (
    select distinct on (player.id)
      player.id player_id,
      membership.club_id,
      value.market_value_eur,
      public.touchline_fantasy_position_bucket(coalesce(membership.detailed_position, membership.position, player.detailed_position, player.position)) position_bucket
    from public.touchline_card_publications publication
    join public.football_player_market_values value on value.id = publication.market_value_id
    join public.football_players player on player.id = publication.player_id
    join public.football_squad_members membership on membership.id = publication.current_membership_id
    where publication.publication_status = 'published'
      and value.status = 'verified' and value.confidence = 'verified' and value.market_value_eur is not null
      and membership.status = 'active' and membership.club_id = player.current_club_id
    order by player.id, publication.published_at desc nulls last
  ), resolved as (
    select requested.*, eligible.club_id, eligible.market_value_eur, eligible.position_bucket,
      slot.value ->> 'role' formation_role,
      exists (
        select 1 from jsonb_array_elements_text(coalesce(slot.value -> 'allowedPositions', '[]'::jsonb)) allowed(value)
        where allowed.value = eligible.position_bucket
      ) position_allowed
    from requested
    left join eligible on eligible.player_id = requested.player_id
    left join lateral (
      select value from jsonb_array_elements(v_geometry -> 'slots') candidate(value)
      where candidate.value ->> 'id' = requested.slot_id
      limit 1
    ) slot on true
  )
  select count(*) filter (
      where club_id is null or market_value_eur is null or position_bucket is null
         or formation_role is null or not position_allowed
    ) + (v_count - count(*)),
    coalesce(sum(market_value_eur), 0),
    coalesce((select max(n) from (select club_id, count(*) n from resolved where club_id is not null group by club_id) clubs), 0)
  into v_invalid, v_total, v_max_club
  from resolved;

  if v_invalid > 0 then raise exception 'TL_FANTASY_SELECTION_INELIGIBLE'; end if;
  if v_total > v_config.budget_eur then raise exception 'TL_FANTASY_BUDGET_EXCEEDED'; end if;
  if v_max_club > v_config.max_players_per_club then raise exception 'TL_FANTASY_CLUB_LIMIT_EXCEEDED'; end if;

  insert into public.touchline_fantasy_user_gameweeks (
    user_id, gameweek_id, formation_code, state, budget_eur_snapshot,
    max_players_per_club_snapshot, total_market_value_eur, last_idempotency_key,
    confirmed_at
  ) values (
    p_user_id, p_gameweek_id, p_formation_code,
    case when p_action = 'confirm' then 'CONFIRMED' else 'DRAFT' end,
    v_config.budget_eur, v_config.max_players_per_club, v_total, p_idempotency_key,
    case when p_action = 'confirm' then now() else null end
  )
  on conflict (user_id, gameweek_id) do update
    set formation_code = excluded.formation_code,
        state = excluded.state,
        budget_eur_snapshot = excluded.budget_eur_snapshot,
        max_players_per_club_snapshot = excluded.max_players_per_club_snapshot,
        total_market_value_eur = excluded.total_market_value_eur,
        last_idempotency_key = excluded.last_idempotency_key,
        confirmed_at = excluded.confirmed_at
  returning id into v_user_gameweek_id;

  delete from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id = v_user_gameweek_id;

  insert into public.touchline_fantasy_user_gameweek_selections (
    user_gameweek_id, slot_id, slot_index, player_id, club_id,
    formation_role, position_bucket, market_value_eur
  )
  with requested as (
    select item."playerId"::uuid player_id, item."slotId" slot_id
    from jsonb_to_recordset(p_selections) as item("playerId" text, "slotId" text)
  ), eligible as (
    select distinct on (player.id)
      player.id player_id, membership.club_id, value.market_value_eur,
      public.touchline_fantasy_position_bucket(coalesce(membership.detailed_position, membership.position, player.detailed_position, player.position)) position_bucket
    from public.touchline_card_publications publication
    join public.football_player_market_values value on value.id = publication.market_value_id
    join public.football_players player on player.id = publication.player_id
    join public.football_squad_members membership on membership.id = publication.current_membership_id
    where publication.publication_status = 'published'
      and value.status = 'verified' and value.confidence = 'verified' and value.market_value_eur is not null
      and membership.status = 'active' and membership.club_id = player.current_club_id
    order by player.id, publication.published_at desc nulls last
  )
  select
    v_user_gameweek_id,
    requested.slot_id,
    (slot.value ->> 'priority')::integer,
    requested.player_id,
    eligible.club_id,
    slot.value ->> 'role',
    eligible.position_bucket,
    eligible.market_value_eur
  from requested
  join eligible using (player_id)
  join lateral (
    select value from jsonb_array_elements(v_geometry -> 'slots') candidate(value)
    where candidate.value ->> 'id' = requested.slot_id
    limit 1
  ) slot on true
  order by (slot.value ->> 'priority')::integer;

  insert into public.touchline_fantasy_audit_events (
    user_id, gameweek_id, event_type, idempotency_key,
    metadata
  ) values (
    p_user_id,
    p_gameweek_id,
    case when p_action = 'confirm' then 'XI_CONFIRMED' else 'DRAFT_SAVED' end,
    p_idempotency_key,
    jsonb_build_object('selectionCount', v_count, 'formationCode', p_formation_code, 'totalMarketValueEur', v_total)
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return jsonb_build_object(
    'ok', true,
    'userGameweekId', v_user_gameweek_id,
    'state', case when p_action = 'confirm' then 'CONFIRMED' else 'DRAFT' end,
    'selectionCount', v_count,
    'totalMarketValueEur', v_total,
    'budgetRemainingEur', v_config.budget_eur - v_total
  );
end;
$$;

create or replace function public.touchline_fantasy_lock_gameweek(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_locked integer := 0;
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-lock:' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  if now() < v_gameweek.locks_at then return jsonb_build_object('ok', false, 'reason', 'market-open'); end if;

  update public.touchline_fantasy_gameweeks
     set state = case
       when state in ('FINAL', 'SETTLED') then state
       when exists (
         select 1 from public.football_fixtures fixture
         where fixture.round_id = v_gameweek.round_id and public.touchline_fantasy_fixture_is_live(fixture.status)
       ) then 'LIVE'
       else 'LOCKED'
     end
   where id = p_gameweek_id;

  insert into public.touchline_fantasy_locked_selections (
    user_gameweek_id, slot_id, slot_index, player_id, club_id,
    formation_role, position_bucket, market_value_eur, locked_at
  )
  select
    user_gameweek.id, selection.slot_id, selection.slot_index, selection.player_id,
    selection.club_id, selection.formation_role, selection.position_bucket,
    selection.market_value_eur, v_gameweek.locks_at
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_user_gameweek_selections selection on selection.user_gameweek_id = user_gameweek.id
  where user_gameweek.gameweek_id = p_gameweek_id
    and user_gameweek.state = 'CONFIRMED'
    and (select count(*) from public.touchline_fantasy_user_gameweek_selections check_selection where check_selection.user_gameweek_id = user_gameweek.id) = 11
  on conflict do nothing;
  get diagnostics v_locked = row_count;

  update public.touchline_fantasy_user_gameweeks user_gameweek
     set state = 'LOCKED', locked_at = v_gameweek.locks_at
   where user_gameweek.gameweek_id = p_gameweek_id
     and user_gameweek.state = 'CONFIRMED'
     and (select count(*) from public.touchline_fantasy_locked_selections locked where locked.user_gameweek_id = user_gameweek.id) = 11;

  insert into public.touchline_fantasy_audit_events (user_id, gameweek_id, event_type, metadata)
  select user_gameweek.user_id, p_gameweek_id, 'XI_LOCKED', jsonb_build_object('lockedAt', v_gameweek.locks_at)
  from public.touchline_fantasy_user_gameweeks user_gameweek
  where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'LOCKED'
    and not exists (
      select 1 from public.touchline_fantasy_audit_events audit
      where audit.user_id = user_gameweek.user_id and audit.gameweek_id = p_gameweek_id and audit.event_type = 'XI_LOCKED'
    );

  return jsonb_build_object('ok', true, 'lockedSelectionRows', v_locked);
end;
$$;

create or replace function public.touchline_fantasy_reconcile_gameweek(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_all_final boolean;
  v_score_rows integer := 0;
  v_user_rows integer := 0;
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-score:' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;

  perform public.touchline_fantasy_lock_gameweek(p_gameweek_id);
  select bool_and(public.touchline_fantasy_fixture_is_final(fixture.status))
    into v_all_final
  from public.football_fixtures fixture
  where fixture.round_id = v_gameweek.round_id;
  v_all_final := coalesce(v_all_final, false);

  insert into public.touchline_fantasy_player_fixture_scores (
    gameweek_id, player_id, fixture_id, appearance_status, participation_status,
    rating, goals, hat_trick_multiplier, fantasy_contribution, reason_code,
    settlement_status, source_synced_at, settled_at
  )
  select
    p_gameweek_id,
    stats.football_player_id,
    stats.fixture_id,
    stats.appearance_status,
    case
      when stats.appearance_status in ('started', 'substitute') and stats.rating is not null then 'rated_appearance'
      when stats.appearance_status in ('started', 'substitute') then 'no_provider_rating'
      else 'did_not_play'
    end,
    case when stats.appearance_status in ('started', 'substitute') then stats.rating else null end,
    case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' then (stats.statistics_payload ->> 'goals')::integer else 0 end,
    case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' and (stats.statistics_payload ->> 'goals')::integer >= 3 then 2 else 1 end,
    case
      when stats.appearance_status in ('started', 'substitute') and stats.rating is not null
      then round(stats.rating * case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' and (stats.statistics_payload ->> 'goals')::integer >= 3 then 2 else 1 end, 2)
      else 0
    end,
    case
      when stats.appearance_status in ('started', 'substitute') and stats.rating is not null then 'RATED_APPEARANCE'
      when stats.appearance_status in ('started', 'substitute') then 'NO_PROVIDER_RATING'
      else 'DID_NOT_PLAY'
    end,
    case when public.touchline_fantasy_fixture_is_final(fixture.status) then 'FINAL' else 'PROVISIONAL' end,
    stats.source_synced_at,
    case when public.touchline_fantasy_fixture_is_final(fixture.status) then now() else null end
  from public.football_player_fixture_statistics stats
  join public.football_fixtures fixture on fixture.id = stats.fixture_id
  where fixture.round_id = v_gameweek.round_id
  on conflict (player_id, fixture_id) do update
    set gameweek_id = excluded.gameweek_id,
        appearance_status = excluded.appearance_status,
        participation_status = excluded.participation_status,
        rating = excluded.rating,
        goals = excluded.goals,
        hat_trick_multiplier = excluded.hat_trick_multiplier,
        fantasy_contribution = excluded.fantasy_contribution,
        reason_code = excluded.reason_code,
        settlement_status = excluded.settlement_status,
        source_synced_at = excluded.source_synced_at,
        settled_at = excluded.settled_at
  where row(
    public.touchline_fantasy_player_fixture_scores.appearance_status,
    public.touchline_fantasy_player_fixture_scores.participation_status,
    public.touchline_fantasy_player_fixture_scores.rating,
    public.touchline_fantasy_player_fixture_scores.goals,
    public.touchline_fantasy_player_fixture_scores.hat_trick_multiplier,
    public.touchline_fantasy_player_fixture_scores.fantasy_contribution,
    public.touchline_fantasy_player_fixture_scores.reason_code,
    public.touchline_fantasy_player_fixture_scores.settlement_status,
    public.touchline_fantasy_player_fixture_scores.source_synced_at
  ) is distinct from row(
    excluded.appearance_status, excluded.participation_status, excluded.rating,
    excluded.goals, excluded.hat_trick_multiplier, excluded.fantasy_contribution,
    excluded.reason_code, excluded.settlement_status, excluded.source_synced_at
  );
  get diagnostics v_score_rows = row_count;

  insert into public.touchline_fantasy_user_gameweek_scores (
    user_gameweek_id, gameweek_score, settlement_status, checksum,
    calculated_at, settled_at
  )
  select
    user_gameweek.id,
    coalesce(sum(score.fantasy_contribution), 0),
    case when v_all_final then 'FINAL' else 'PROVISIONAL' end,
    md5(
      user_gameweek.id::text || ':' ||
      coalesce(string_agg(locked.player_id::text || ':' || fixture.id::text || ':' || coalesce(score.fantasy_contribution, 0)::text, ',' order by locked.player_id, fixture.id), '')
    ),
    now(),
    case when v_all_final then now() else null end
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_locked_selections locked on locked.user_gameweek_id = user_gameweek.id
  join public.football_fixtures fixture on fixture.round_id = v_gameweek.round_id
  left join public.touchline_fantasy_player_fixture_scores score
    on score.player_id = locked.player_id and score.fixture_id = fixture.id
  where user_gameweek.gameweek_id = p_gameweek_id
  group by user_gameweek.id
  on conflict (user_gameweek_id) do update
    set gameweek_score = excluded.gameweek_score,
        settlement_status = excluded.settlement_status,
        checksum = excluded.checksum,
        calculated_at = excluded.calculated_at,
        settled_at = excluded.settled_at
  where public.touchline_fantasy_user_gameweek_scores.checksum is distinct from excluded.checksum
     or public.touchline_fantasy_user_gameweek_scores.settlement_status is distinct from excluded.settlement_status;
  get diagnostics v_user_rows = row_count;

  if v_all_final then
    update public.touchline_fantasy_user_gameweeks
       set state = 'FINAL', finalized_at = coalesce(finalized_at, now())
     where gameweek_id = p_gameweek_id and state = 'LOCKED';
    update public.touchline_fantasy_gameweeks
       set state = 'SETTLED', finalized_at = coalesce(finalized_at, now()), settled_at = coalesce(settled_at, now())
     where id = p_gameweek_id;
  elsif exists (
    select 1 from public.football_fixtures fixture
    where fixture.round_id = v_gameweek.round_id and public.touchline_fantasy_fixture_is_live(fixture.status)
  ) then
    update public.touchline_fantasy_gameweeks set state = 'LIVE' where id = p_gameweek_id;
  end if;

  insert into public.touchline_fantasy_audit_events (gameweek_id, event_type, metadata)
  values (p_gameweek_id, 'SCORE_RECONCILED', jsonb_build_object(
    'playerFixtureRowsChanged', v_score_rows,
    'userScoresChanged', v_user_rows,
    'allFixturesFinal', v_all_final
  ));

  return jsonb_build_object(
    'ok', true,
    'playerFixtureRowsChanged', v_score_rows,
    'userScoresChanged', v_user_rows,
    'allFixturesFinal', v_all_final
  );
end;
$$;

create or replace function public.touchline_fantasy_apply_test_subscription_event(
  p_provider_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_user_id uuid,
  p_provider_customer_reference text,
  p_provider_subscription_reference text,
  p_entitlement_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if p_livemode then raise exception 'TL_FANTASY_LIVE_BILLING_FORBIDDEN'; end if;
  if p_entitlement_status not in ('active', 'inactive', 'past_due', 'canceled', 'expired') then raise exception 'TL_FANTASY_ENTITLEMENT_STATUS_INVALID'; end if;
  if length(btrim(coalesce(p_provider_event_id, ''))) < 8 then raise exception 'TL_FANTASY_EVENT_ID_INVALID'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'TL_FANTASY_USER_NOT_FOUND'; end if;

  insert into public.touchline_fantasy_subscription_events (
    provider_event_id, event_type, livemode, user_id,
    provider_subscription_reference, entitlement_status
  ) values (
    p_provider_event_id, p_event_type, false, p_user_id,
    p_provider_subscription_reference, p_entitlement_status
  ) on conflict (provider_event_id) do nothing;
  v_claimed := found;
  if not v_claimed then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  insert into public.touchline_fantasy_entitlements (
    user_id, entitlement_key, status, source, provider_customer_reference,
    provider_subscription_reference, current_period_start, current_period_end,
    metadata
  ) values (
    p_user_id, 'fantasy_access', p_entitlement_status, 'stripe_test', p_provider_customer_reference,
    p_provider_subscription_reference, p_current_period_start, p_current_period_end,
    jsonb_build_object('lastEventId', p_provider_event_id, 'lastEventType', p_event_type)
  )
  on conflict (user_id, entitlement_key) do update
    set status = excluded.status,
        source = excluded.source,
        provider_customer_reference = excluded.provider_customer_reference,
        provider_subscription_reference = excluded.provider_subscription_reference,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        metadata = excluded.metadata;

  insert into public.touchline_fantasy_audit_events (user_id, event_type, metadata)
  values (p_user_id, 'ENTITLEMENT_CHANGED', jsonb_build_object(
    'source', 'stripe_test', 'status', p_entitlement_status, 'eventType', p_event_type
  ));

  return jsonb_build_object('ok', true, 'duplicate', false, 'status', p_entitlement_status);
end;
$$;

insert into public.touchline_fantasy_configs (
  competition_key, competition_id, season_id, subscription_price_minor,
  subscription_currency, budget_eur, max_players_per_club, lock_offset_minutes,
  status
)
select
  'england', competition.id, season.id, 2990, 'GBP', 350000000, 3, 90, 'active'
from public.football_competitions competition
join public.football_seasons season on season.competition_id = competition.id and season.is_current = true
where competition.provider = 'sportmonks' and competition.provider_competition_id = '8'
on conflict (competition_id, season_id) do update
set subscription_price_minor = excluded.subscription_price_minor,
    subscription_currency = excluded.subscription_currency,
    budget_eur = excluded.budget_eur,
    max_players_per_club = excluded.max_players_per_club,
    lock_offset_minutes = excluded.lock_offset_minutes;

select public.touchline_fantasy_sync_gameweeks();

alter table public.touchline_fantasy_configs enable row level security;
alter table public.touchline_fantasy_entitlements enable row level security;
alter table public.touchline_fantasy_subscription_events enable row level security;
alter table public.touchline_fantasy_gameweeks enable row level security;
alter table public.touchline_fantasy_user_gameweeks enable row level security;
alter table public.touchline_fantasy_user_gameweek_selections enable row level security;
alter table public.touchline_fantasy_locked_selections enable row level security;
alter table public.touchline_fantasy_player_fixture_scores enable row level security;
alter table public.touchline_fantasy_user_gameweek_scores enable row level security;
alter table public.touchline_fantasy_audit_events enable row level security;

revoke all on table public.touchline_fantasy_configs from public, anon, authenticated;
revoke all on table public.touchline_fantasy_entitlements from public, anon, authenticated;
revoke all on table public.touchline_fantasy_subscription_events from public, anon, authenticated;
revoke all on table public.touchline_fantasy_gameweeks from public, anon, authenticated;
revoke all on table public.touchline_fantasy_user_gameweeks from public, anon, authenticated;
revoke all on table public.touchline_fantasy_user_gameweek_selections from public, anon, authenticated;
revoke all on table public.touchline_fantasy_locked_selections from public, anon, authenticated;
revoke all on table public.touchline_fantasy_player_fixture_scores from public, anon, authenticated;
revoke all on table public.touchline_fantasy_user_gameweek_scores from public, anon, authenticated;
revoke all on table public.touchline_fantasy_audit_events from public, anon, authenticated;

grant select, insert, update, delete on table public.touchline_fantasy_configs to service_role;
grant select, insert, update, delete on table public.touchline_fantasy_entitlements to service_role;
grant select, insert on table public.touchline_fantasy_subscription_events to service_role;
grant select, insert, update, delete on table public.touchline_fantasy_gameweeks to service_role;
grant select, insert, update, delete on table public.touchline_fantasy_user_gameweeks to service_role;
grant select, insert, update, delete on table public.touchline_fantasy_user_gameweek_selections to service_role;
grant select, insert on table public.touchline_fantasy_locked_selections to service_role;
grant select, insert, update, delete on table public.touchline_fantasy_player_fixture_scores to service_role;
grant select, insert, update on table public.touchline_fantasy_user_gameweek_scores to service_role;
grant select, insert on table public.touchline_fantasy_audit_events to service_role;

revoke all on function public.touchline_fantasy_touch_updated_at() from public, anon, authenticated;
revoke all on function public.touchline_fantasy_locked_selection_is_immutable() from public, anon, authenticated;
revoke all on function public.touchline_fantasy_position_bucket(text) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_fixture_is_final(text) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_fixture_is_live(text) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_entitlement_is_active(uuid) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_sync_gameweeks() from public, anon, authenticated;
revoke all on function public.touchline_fantasy_prepare_user_gameweek(uuid, uuid) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_save_lineup(uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_lock_gameweek(uuid) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_reconcile_gameweek(uuid) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_apply_test_subscription_event(text, text, boolean, uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.touchline_fantasy_position_bucket(text) to service_role;
grant execute on function public.touchline_fantasy_fixture_is_final(text) to service_role;
grant execute on function public.touchline_fantasy_fixture_is_live(text) to service_role;
grant execute on function public.touchline_fantasy_entitlement_is_active(uuid) to service_role;
grant execute on function public.touchline_fantasy_sync_gameweeks() to service_role;
grant execute on function public.touchline_fantasy_prepare_user_gameweek(uuid, uuid) to service_role;
grant execute on function public.touchline_fantasy_save_lineup(uuid, uuid, text, jsonb, text, text) to service_role;
grant execute on function public.touchline_fantasy_lock_gameweek(uuid) to service_role;
grant execute on function public.touchline_fantasy_reconcile_gameweek(uuid) to service_role;
grant execute on function public.touchline_fantasy_apply_test_subscription_event(text, text, boolean, uuid, text, text, text, timestamptz, timestamptz) to service_role;

comment on table public.touchline_fantasy_entitlements is
  'Server-only monthly Fantasy entitlement. QA grants and verified Stripe Test Mode state are explicit; live billing cannot enter this boundary.';
comment on table public.touchline_fantasy_locked_selections is
  'Immutable XI snapshot captured at the canonical Gameweek deadline.';
comment on table public.touchline_fantasy_player_fixture_scores is
  'Canonical Fantasy scoring ledger: Sportmonks Rating only, multiplied once by 2 for three or more goals in one fixture. Null ratings remain null and contribute zero.';

commit;
