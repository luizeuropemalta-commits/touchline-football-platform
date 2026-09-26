-- Match opt-in only: does not enable push, alter channels/quiet hours or send.
-- HTTP verifies the account and resolves the canonical fixture before calling.
begin;

create table public.touchline_fixture_alert_subscriptions (
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fixture_id, user_id)
);
create index touchline_fixture_alert_subscriptions_user_idx
  on public.touchline_fixture_alert_subscriptions (user_id);
alter table public.touchline_fixture_alert_subscriptions enable row level security;
revoke all on public.touchline_fixture_alert_subscriptions from public, anon, authenticated, service_role;
grant select, insert, delete on public.touchline_fixture_alert_subscriptions to service_role;

create function public.touchline_fixture_alert_status(p_fixture_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if p_fixture_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'FIXTURE_ALERT_INVALID_INPUT';
  end if;
  return jsonb_build_object('subscribed', exists (
    select 1 from public.touchline_fixture_alert_subscriptions
    where fixture_id = p_fixture_id and user_id = p_user_id
  ));
end;
$$;

create function public.touchline_set_fixture_alert_subscription(p_fixture_id uuid, p_user_id uuid, p_active boolean)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if p_fixture_id is null or p_user_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'FIXTURE_ALERT_INVALID_INPUT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'touchline-fixture-alert:' || p_fixture_id::text || ':' || p_user_id::text, 0
  ));
  if p_active then
    insert into public.touchline_fixture_alert_subscriptions (fixture_id, user_id)
      values (p_fixture_id, p_user_id)
      on conflict (fixture_id, user_id) do nothing;
  else
    delete from public.touchline_fixture_alert_subscriptions
      where fixture_id = p_fixture_id and user_id = p_user_id;
  end if;
  return public.touchline_fixture_alert_status(p_fixture_id, p_user_id);
end;
$$;

revoke all on function public.touchline_fixture_alert_status(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_set_fixture_alert_subscription(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.touchline_fixture_alert_status(uuid, uuid) to service_role;
grant execute on function public.touchline_set_fixture_alert_subscription(uuid, uuid, boolean) to service_role;

commit;
