-- Durable delivery bookkeeping only. No trigger, scheduler, HTTP or push send.
-- The server producer must verify canonical event provenance/freshness before
-- insertion. Claiming is NOT permission to send: the worker must recheck source,
-- consent, quiet hours and current subscription immediately before transport.
begin;

create table public.touchline_match_push_outbox (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.notification_devices(id) on delete cascade,
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  provider_event_id text not null check (provider_event_id ~ '^[1-9][0-9]{0,19}$'),
  source_checksum text not null check (source_checksum ~ '^sha256:[a-f0-9]{64}$'),
  source_snapshot_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096),
  state text not null default 'queued' check (state in ('queued', 'claimed', 'provider_accepted', 'cancelled', 'uncertain', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  unique (device_id, fixture_id, provider_event_id, source_checksum),
  check (expires_at > created_at),
  check (source_snapshot_at <= created_at),
  check ((state = 'claimed' and lease_token is not null and lease_until is not null)
    or (state <> 'claimed' and lease_token is null and lease_until is null)),
  check ((state in ('queued', 'claimed') and completed_at is null)
    or (state not in ('queued', 'claimed') and completed_at is not null))
);
create index touchline_match_push_outbox_queue_idx
  on public.touchline_match_push_outbox (created_at, id) where state = 'queued';
create index touchline_match_push_outbox_lease_idx
  on public.touchline_match_push_outbox (lease_until) where state = 'claimed';
alter table public.touchline_match_push_outbox enable row level security;
alter table public.touchline_match_push_outbox force row level security;
revoke all on public.touchline_match_push_outbox from public, anon, authenticated, service_role;
grant select, insert, update on public.touchline_match_push_outbox to service_role;

create function public.touchline_claim_match_push_batch(p_limit integer default 20)
returns setof public.touchline_match_push_outbox
language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'PUSH_BATCH_INVALID_LIMIT';
  end if;
  -- A crashed/timed-out sender may already have contacted the push provider.
  -- Never blindly requeue it and risk another audible notification.
  update public.touchline_match_push_outbox
    set state = 'uncertain', lease_token = null, lease_until = null, completed_at = v_now
    where state = 'claimed' and lease_until <= v_now;
  update public.touchline_match_push_outbox
    set state = 'cancelled', completed_at = v_now
    where state = 'queued' and (expires_at <= v_now or not exists (
      select 1 from public.notification_devices d
      join public.notification_preferences p on p.user_id = d.user_id
      join public.touchline_fixture_alert_subscriptions s
        on s.user_id = d.user_id and s.fixture_id = touchline_match_push_outbox.fixture_id
      where d.id = touchline_match_push_outbox.device_id
        and d.permission = 'granted' and d.push_subscription is not null
        and p.channels @> '{"push":true}'::jsonb
        and p.settings @> '{"goalsAndEvents":true}'::jsonb
        and p.frequency = 'realtime'
        and p.explicit_consent_at is not null and p.explicit_consent_at <= v_now
    ));
  v_now := clock_timestamp();
  return query
    with candidates as (
      select q.id from public.touchline_match_push_outbox q
      where q.state = 'queued' and q.expires_at > clock_timestamp()
        -- Recheck in the acquiring statement itself: consent can change or a
        -- producer can enqueue between the cleanup and this statement.
        and exists (
          select 1 from public.notification_devices d
          join public.notification_preferences p on p.user_id = d.user_id
          join public.touchline_fixture_alert_subscriptions s
            on s.user_id = d.user_id and s.fixture_id = q.fixture_id
          where d.id = q.device_id
            and d.permission = 'granted' and d.push_subscription is not null
            and p.channels @> '{"push":true}'::jsonb
            and p.settings @> '{"goalsAndEvents":true}'::jsonb
            and p.frequency = 'realtime'
            and p.explicit_consent_at is not null and p.explicit_consent_at <= v_now
        )
      order by q.created_at, q.id limit p_limit for update skip locked
    )
    update public.touchline_match_push_outbox q
      set state = 'claimed', lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '60 seconds'
      from candidates c where q.id = c.id
      returning q.*;
end;
$$;

create function public.touchline_finish_match_push(p_id uuid, p_lease_token uuid, p_state text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_count integer; v_now timestamptz := clock_timestamp();
begin
  if p_id is null or p_lease_token is null or p_state is null
    or p_state not in ('provider_accepted', 'cancelled', 'uncertain', 'failed') then
    raise exception using errcode = '22023', message = 'PUSH_COMPLETION_INVALID_INPUT';
  end if;
  -- Wait for the row before taking the clock used to fence completion.
  perform 1 from public.touchline_match_push_outbox where id = p_id for update;
  v_now := clock_timestamp();
  update public.touchline_match_push_outbox
    set state = p_state, lease_token = null, lease_until = null, completed_at = v_now
    where id = p_id and state = 'claimed' and lease_token = p_lease_token and lease_until > v_now;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.touchline_claim_match_push_batch(integer) from public, anon, authenticated, service_role;
revoke all on function public.touchline_finish_match_push(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.touchline_claim_match_push_batch(integer) to service_role;
grant execute on function public.touchline_finish_match_push(uuid, uuid, text) to service_role;
commit;
