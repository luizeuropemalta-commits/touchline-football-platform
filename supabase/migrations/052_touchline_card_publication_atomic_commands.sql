-- Atomic commands for the manual TouchLine card-publication lifecycle.
--
-- LOCAL, UNAPPLIED forward migration. It is deliberately additive: migration
-- 051 remains untouched. Do not apply this before its dry-run/cutover gate.

begin;
set local lock_timeout = '5s';

-- The older *_tc fields remain for compatibility. These columns make the
-- approved nominal GBP card-price meaning explicit; launch payable amount is
-- separate and is never stored here.
alter table public.touchline_card_publications
  add column if not exists calculated_nominal_price_gbp integer;
update public.touchline_card_publications
   set calculated_nominal_price_gbp = calculated_price_tc
 where calculated_nominal_price_gbp is null;
alter table public.touchline_card_publications
  drop constraint if exists touchline_card_publications_nominal_price_gbp_check;
alter table public.touchline_card_publications
  add constraint touchline_card_publications_nominal_price_gbp_check
  check (calculated_nominal_price_gbp is null or calculated_nominal_price_gbp >= 0);

alter table public.touchline_card_publication_history
  add column if not exists nominal_price_gbp integer;
update public.touchline_card_publication_history
   set nominal_price_gbp = nominal_price_tc
 where nominal_price_gbp is null;
alter table public.touchline_card_publication_history
  drop constraint if exists touchline_card_publication_history_nominal_price_gbp_check;
alter table public.touchline_card_publication_history
  add constraint touchline_card_publication_history_nominal_price_gbp_check
  check (nominal_price_gbp is null or nominal_price_gbp >= 0);

comment on column public.touchline_card_publications.calculated_nominal_price_gbp is
  'Canonical TouchLine nominal card price in GBP. Launch-season payable amount is separate.';
comment on column public.touchline_card_publication_history.nominal_price_gbp is
  'Immutable canonical nominal card price in GBP at the historical decision.';

create or replace function public.touchline_apply_manual_card_publication(
  p_player_id uuid,
  p_membership_id uuid,
  p_competition_id uuid,
  p_effective_season text,
  p_market_value_eur bigint,
  p_calculated_tier text,
  p_nominal_price_gbp integer,
  p_policy_version text,
  p_publication_status text,
  p_last_reviewed_at timestamptz,
  p_internal_note text,
  p_internal_source text,
  p_actor_id uuid
)
returns table (
  publication_id uuid,
  publication_status text,
  calculated_tier text,
  nominal_price_gbp integer,
  player_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.football_players%rowtype;
  v_membership public.football_squad_members%rowtype;
  v_competition public.football_competitions%rowtype;
  v_previous_value public.football_player_market_values%rowtype;
  v_value public.football_player_market_values%rowtype;
  v_previous_publication public.touchline_card_publications%rowtype;
  v_publication public.touchline_card_publications%rowtype;
  v_before_state jsonb;
  v_action text;
begin
  if p_player_id is null or p_membership_id is null or p_competition_id is null
     or p_actor_id is null or p_last_reviewed_at is null
     or p_market_value_eur < 0 or p_nominal_price_gbp is null or p_nominal_price_gbp < 0
     or p_calculated_tier is null
     or length(trim(coalesce(p_effective_season, ''))) = 0
     or length(trim(coalesce(p_policy_version, ''))) = 0
     or p_publication_status not in (
       'detected', 'market_value_required', 'ready_for_review',
       'ready_to_publish', 'published', 'inactive_in_competition', 'archived'
     )
     or p_nominal_price_gbp <> (case p_calculated_tier
       when 'ruby-red' then 0
       when 'sapphire-blue' then 1
       when 'amethyst-purple' then 2
       when 'radiant-gold' then 4
       when 'emerald-green' then 7
       when 'clear-diamond' then 10
       when 'diamond-gold' then 15
       else -1
     end) then
    raise exception using errcode = '22023', message = 'TL_CARD_PUBLICATION_COMMAND_INVALID';
  end if;

  -- The server already uses the shared card engine. Repeating its approved
  -- threshold fence inside this atomic command prevents a privileged caller
  -- from persisting a valid-looking price/tier pair for the wrong manual EUR
  -- value. This is classification validation only: it does not alter any
  -- active contract or payment amount.
  if p_calculated_tier <> (case
    when p_market_value_eur < 6000000 then 'ruby-red'
    when p_market_value_eur < 10000000 then 'sapphire-blue'
    when p_market_value_eur < 20000000 then 'amethyst-purple'
    when p_market_value_eur < 35000000 then 'radiant-gold'
    when p_market_value_eur < 50000000 then 'emerald-green'
    when p_market_value_eur < 70000000 then 'clear-diamond'
    else 'diamond-gold'
  end) then
    raise exception using errcode = '22023', message = 'TL_CARD_PUBLICATION_TIER_MISMATCH';
  end if;

  select * into v_player
    from public.football_players
   where id = p_player_id
   for update;
  if not found or v_player.current_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_PLAYER_NOT_CANONICAL';
  end if;

  select * into v_membership
    from public.football_squad_members as membership
   where membership.id = p_membership_id
     and membership.player_id = p_player_id
     and membership.club_id = v_player.current_club_id
     and membership.competition_id = p_competition_id
     and membership.provider = 'sportmonks'
     and membership.status = 'active'
   for update;
  if not found or (
    select count(*)
      from public.football_squad_members as active_membership
     where active_membership.player_id = p_player_id
       and active_membership.provider = 'sportmonks'
       and active_membership.status = 'active'
  ) <> 1 then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_MEMBERSHIP_NOT_UNIQUE';
  end if;

  if not exists (
    select 1
      from public.football_clubs
     where id = v_player.current_club_id
       and competition_id = p_competition_id
       and provider = 'sportmonks'
  ) then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_CLUB_NOT_CANONICAL';
  end if;

  select * into v_competition
    from public.football_competitions
   where id = p_competition_id
     and provider = 'sportmonks'
     and provider_competition_id = '8'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_COMPETITION_NOT_PREMIER_LEAGUE';
  end if;

  select * into v_previous_value
    from public.football_player_market_values as prior_value
   where prior_value.player_id = p_player_id
   for update;
  select * into v_previous_publication
    from public.touchline_card_publications as prior_publication
   where prior_publication.player_id = p_player_id
   for update;
  v_before_state := jsonb_build_object(
    'publication', case when v_previous_publication.id is null then null else to_jsonb(v_previous_publication) end,
    'market_value', case when v_previous_value.id is null then null else to_jsonb(v_previous_value) end
  );

  insert into public.football_player_market_values (
    player_id, market_value, currency, market_value_eur, last_verified,
    verified_season, source, confidence, status, updated_by
  ) values (
    p_player_id, p_market_value_eur, 'EUR', p_market_value_eur,
    p_last_reviewed_at, p_effective_season, 'touchline_manual_owner',
    'verified', 'verified', p_actor_id
  ) on conflict on constraint football_player_market_values_player_id_key do update set
    market_value = excluded.market_value,
    currency = excluded.currency,
    market_value_eur = excluded.market_value_eur,
    last_verified = excluded.last_verified,
    verified_season = excluded.verified_season,
    source = excluded.source,
    confidence = excluded.confidence,
    status = excluded.status,
    updated_by = excluded.updated_by
  returning * into v_value;

  insert into public.football_player_market_value_history (
    player_id, market_value, currency, market_value_eur, verified_season,
    verified_date, source, confidence, created_by
  ) values (
    p_player_id, p_market_value_eur, 'EUR', p_market_value_eur,
    p_effective_season, clock_timestamp(), 'touchline_manual_owner',
    'verified', p_actor_id
  );

  insert into public.touchline_card_publications (
    player_id, current_membership_id, competition_id, effective_season,
    market_value_id, publication_status, calculated_tier,
    calculated_price_tc, calculated_nominal_price_gbp, policy_version,
    last_reviewed_at, published_at, unpublished_at, internal_note,
    internal_source, created_by, updated_by, version
  ) values (
    p_player_id, p_membership_id, p_competition_id, p_effective_season,
    v_value.id, p_publication_status, p_calculated_tier,
    p_nominal_price_gbp, p_nominal_price_gbp, p_policy_version,
    p_last_reviewed_at,
    case when p_publication_status = 'published' then clock_timestamp() else null end,
    case when p_publication_status in ('inactive_in_competition', 'archived') then clock_timestamp() else null end,
    nullif(trim(coalesce(p_internal_note, '')), ''),
    nullif(trim(coalesce(p_internal_source, '')), ''),
    p_actor_id, p_actor_id, 1
  ) on conflict on constraint touchline_card_publications_player_id_key do update set
    current_membership_id = excluded.current_membership_id,
    competition_id = excluded.competition_id,
    effective_season = excluded.effective_season,
    market_value_id = excluded.market_value_id,
    publication_status = excluded.publication_status,
    calculated_tier = excluded.calculated_tier,
    calculated_price_tc = excluded.calculated_price_tc,
    calculated_nominal_price_gbp = excluded.calculated_nominal_price_gbp,
    policy_version = excluded.policy_version,
    last_reviewed_at = excluded.last_reviewed_at,
    published_at = excluded.published_at,
    unpublished_at = excluded.unpublished_at,
    internal_note = excluded.internal_note,
    internal_source = excluded.internal_source,
    updated_by = excluded.updated_by,
    version = public.touchline_card_publications.version + 1
  returning * into v_publication;

  v_action := case p_publication_status
    when 'published' then 'published'
    when 'ready_to_publish' then 'ready_to_publish'
    when 'market_value_required' then 'market_value_required'
    when 'inactive_in_competition' then 'inactive_in_competition'
    when 'archived' then 'archived'
    else 'reviewed'
  end;
  insert into public.touchline_card_publication_history (
    publication_id, player_id, provider_player_id, action,
    previous_market_value_eur, new_market_value_eur, currency,
    previous_tier, new_tier, nominal_price_tc, nominal_price_gbp,
    before_state, after_state, actor_id
  ) values (
    v_publication.id, p_player_id, v_player.provider_player_id, v_action,
    v_previous_value.market_value_eur, p_market_value_eur, 'EUR',
    v_previous_publication.calculated_tier, p_calculated_tier,
    p_nominal_price_gbp, p_nominal_price_gbp,
    v_before_state,
    jsonb_build_object('publication', to_jsonb(v_publication), 'market_value', to_jsonb(v_value)),
    p_actor_id
  );

  return query select v_publication.id, v_publication.publication_status,
    v_publication.calculated_tier, v_publication.calculated_nominal_price_gbp,
    v_publication.player_id;
end;
$$;

create or replace function public.touchline_revert_manual_card_publication(
  p_history_id uuid,
  p_actor_id uuid
)
returns table (
  publication_id uuid,
  publication_status text,
  calculated_tier text,
  nominal_price_gbp integer,
  player_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_history public.touchline_card_publication_history%rowtype;
  v_player public.football_players%rowtype;
  v_current_value public.football_player_market_values%rowtype;
  v_current_publication public.touchline_card_publications%rowtype;
  v_restored_value public.football_player_market_values%rowtype;
  v_restored_publication public.touchline_card_publications%rowtype;
  v_restore_value jsonb;
  v_restore_publication jsonb;
  v_before_state jsonb;
  v_restore_has_value boolean;
  v_restore_has_publication boolean;
begin
  if p_history_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'TL_CARD_PUBLICATION_REVERT_COMMAND_INVALID';
  end if;

  select * into v_history
    from public.touchline_card_publication_history
   where id = p_history_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_REVERT_HISTORY_NOT_FOUND';
  end if;
  v_restore_value := v_history.before_state -> 'market_value';
  v_restore_publication := v_history.before_state -> 'publication';
  if jsonb_typeof(v_restore_value) not in ('object', 'null')
     or jsonb_typeof(v_restore_publication) not in ('object', 'null') then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_REVERT_HISTORY_INCOMPLETE';
  end if;
  v_restore_has_value := jsonb_typeof(v_restore_value) = 'object';
  v_restore_has_publication := jsonb_typeof(v_restore_publication) = 'object';

  select * into v_player
    from public.football_players
   where id = v_history.player_id
   for update;
  if not found or v_player.current_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_REVERT_PLAYER_NOT_CANONICAL';
  end if;
  select * into v_current_publication
    from public.touchline_card_publications as current_publication
   where current_publication.id = v_history.publication_id
     and current_publication.player_id = v_history.player_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_REVERT_PUBLICATION_NOT_FOUND';
  end if;
  if not exists (
    select 1
      from public.football_squad_members as membership
      join public.football_competitions as competition on competition.id = membership.competition_id
     where membership.id = case
       when v_restore_has_publication then (v_restore_publication ->> 'current_membership_id')::uuid
       else v_current_publication.current_membership_id
     end
       and membership.player_id = v_history.player_id
       and membership.club_id = v_player.current_club_id
       and membership.provider = 'sportmonks'
       and membership.status = 'active'
       and competition.provider = 'sportmonks'
       and competition.provider_competition_id = '8'
  ) then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_REVERT_MEMBERSHIP_NOT_CANONICAL';
  end if;

  select * into v_current_value
    from public.football_player_market_values as current_value
   where current_value.player_id = v_history.player_id
   for update;
  if not found or v_current_value.id is null
     or (v_restore_has_value and v_current_value.id <> (v_restore_value ->> 'id')::uuid) then
    raise exception using errcode = 'P0001', message = 'TL_CARD_PUBLICATION_REVERT_VALUE_ID_MISMATCH';
  end if;
  v_before_state := jsonb_build_object(
    'publication', to_jsonb(v_current_publication),
    'market_value', to_jsonb(v_current_value)
  );

  if v_restore_has_value then
    update public.football_player_market_values
       set market_value = (v_restore_value ->> 'market_value')::bigint,
           currency = (v_restore_value ->> 'currency')::char(3),
           market_value_eur = (v_restore_value ->> 'market_value_eur')::bigint,
           last_verified = (v_restore_value ->> 'last_verified')::timestamptz,
           verified_season = v_restore_value ->> 'verified_season',
           source = v_restore_value ->> 'source',
           confidence = v_restore_value ->> 'confidence',
           status = v_restore_value ->> 'status',
           updated_by = p_actor_id
     where id = v_current_value.id
    returning * into v_restored_value;
  end if;

  if v_restore_has_publication then
    update public.touchline_card_publications
       set current_membership_id = (v_restore_publication ->> 'current_membership_id')::uuid,
           competition_id = (v_restore_publication ->> 'competition_id')::uuid,
           effective_season = v_restore_publication ->> 'effective_season',
           market_value_id = case when v_restore_has_value then v_restored_value.id else null end,
           publication_status = v_restore_publication ->> 'publication_status',
           calculated_tier = v_restore_publication ->> 'calculated_tier',
           calculated_price_tc = (v_restore_publication ->> 'calculated_price_tc')::integer,
           calculated_nominal_price_gbp = coalesce(
             (v_restore_publication ->> 'calculated_nominal_price_gbp')::integer,
             (v_restore_publication ->> 'calculated_price_tc')::integer
           ),
           policy_version = v_restore_publication ->> 'policy_version',
           last_reviewed_at = (v_restore_publication ->> 'last_reviewed_at')::timestamptz,
           published_at = (v_restore_publication ->> 'published_at')::timestamptz,
           unpublished_at = (v_restore_publication ->> 'unpublished_at')::timestamptz,
           internal_note = v_restore_publication ->> 'internal_note',
           internal_source = v_restore_publication ->> 'internal_source',
           current_batch_id = (v_restore_publication ->> 'current_batch_id')::uuid,
           version = v_current_publication.version + 1,
           updated_by = p_actor_id
     where id = v_current_publication.id
    returning * into v_restored_publication;
  else
    update public.touchline_card_publications
       set market_value_id = null,
           publication_status = 'market_value_required',
           calculated_tier = null,
           calculated_price_tc = null,
           calculated_nominal_price_gbp = null,
           policy_version = null,
           last_reviewed_at = null,
           published_at = null,
           unpublished_at = clock_timestamp(),
           internal_note = null,
           internal_source = null,
           current_batch_id = null,
           version = v_current_publication.version + 1,
           updated_by = p_actor_id
     where id = v_current_publication.id
    returning * into v_restored_publication;
  end if;

  if not v_restore_has_value then
    delete from public.football_player_market_values
     where id = v_current_value.id;
  end if;

  insert into public.football_player_market_value_history (
    player_id, market_value, currency, market_value_eur, verified_season,
    verified_date, source, confidence, created_by
  ) values (
    v_history.player_id,
    case when v_restore_has_value then v_restored_value.market_value else null end,
    case when v_restore_has_value then v_restored_value.currency else null end,
    case when v_restore_has_value then v_restored_value.market_value_eur else null end,
    case when v_restore_has_value then v_restored_value.verified_season else v_current_value.verified_season end,
    clock_timestamp(), 'touchline_manual_owner_revert', 'verified', p_actor_id
  );
  insert into public.touchline_card_publication_history (
    publication_id, player_id, provider_player_id, action,
    previous_market_value_eur, new_market_value_eur, currency,
    previous_tier, new_tier, nominal_price_tc, nominal_price_gbp,
    before_state, after_state, actor_id
  ) values (
    v_restored_publication.id, v_history.player_id, v_player.provider_player_id,
    'reverted', v_current_value.market_value_eur,
    case when v_restore_has_value then v_restored_value.market_value_eur else null end,
    case when v_restore_has_value then 'EUR' else null end,
    v_current_publication.calculated_tier, v_restored_publication.calculated_tier,
    v_restored_publication.calculated_price_tc,
    v_restored_publication.calculated_nominal_price_gbp,
    v_before_state,
    jsonb_build_object(
      'publication', to_jsonb(v_restored_publication),
      'market_value', case when v_restore_has_value then to_jsonb(v_restored_value) else null end
    ),
    p_actor_id
  );

  return query select v_restored_publication.id,
    v_restored_publication.publication_status,
    v_restored_publication.calculated_tier,
    v_restored_publication.calculated_nominal_price_gbp,
    v_restored_publication.player_id;
end;
$$;

revoke all on function public.touchline_apply_manual_card_publication(
  uuid, uuid, uuid, text, bigint, text, integer, text, text, timestamptz,
  text, text, uuid
) from public, anon, authenticated;
grant execute on function public.touchline_apply_manual_card_publication(
  uuid, uuid, uuid, text, bigint, text, integer, text, text, timestamptz,
  text, text, uuid
) to service_role;

revoke all on function public.touchline_revert_manual_card_publication(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_revert_manual_card_publication(uuid, uuid)
  to service_role;

commit;
