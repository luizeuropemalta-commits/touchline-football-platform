-- Cooperative server writes use durable CAS, including inactive interests.
-- Deploy with the revision-aware API. No push activation or consent changes.
-- Runner owns the transaction, including migration history. A history failure
-- must roll back the revision table and restore the legacy RPC atomically.

create table public.touchline_fixture_alert_revisions (
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  primary key (fixture_id, user_id)
);
create index touchline_fixture_alert_revisions_user_idx on public.touchline_fixture_alert_revisions(user_id);
alter table public.touchline_fixture_alert_revisions enable row level security;
alter table public.touchline_fixture_alert_revisions force row level security;
revoke all on public.touchline_fixture_alert_revisions from public, anon, authenticated, service_role;
grant select, insert, update on public.touchline_fixture_alert_revisions to service_role;

create or replace function public.touchline_fixture_alert_status(p_fixture_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_fixture_id is null or p_user_id is null then
    raise exception 'FIXTURE_ALERT_INVALID_INPUT' using errcode='22023';
  end if;
  -- Both facts share one MVCC statement snapshot. GET never creates state.
  select jsonb_build_object('subscribed', exists(
    select 1 from public.touchline_fixture_alert_subscriptions
    where fixture_id=p_fixture_id and user_id=p_user_id),
    'revision', coalesce((select revision::text from public.touchline_fixture_alert_revisions
      where fixture_id=p_fixture_id and user_id=p_user_id), '0')) into result;
  return result;
end $$;

-- Keeping a writable legacy overload would bypass ordering after remount.
drop function public.touchline_set_fixture_alert_subscription(uuid, uuid, boolean);
create function public.touchline_set_fixture_alert_subscription(
  p_fixture_id uuid, p_user_id uuid, p_active boolean, p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint;
begin
  if p_fixture_id is null or p_user_id is null or p_active is null
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'FIXTURE_ALERT_INVALID_INPUT' using errcode='22023';
  end if;
  if p_expected_revision = 9223372036854775807 then
    raise exception 'FIXTURE_ALERT_REVISION_OVERFLOW' using errcode='22003';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('touchline-fixture-alert:' || p_fixture_id::text || ':' || p_user_id::text, 0));
  select revision into current_revision from public.touchline_fixture_alert_revisions
    where fixture_id=p_fixture_id and user_id=p_user_id for update;
  if coalesce(current_revision, 0) <> p_expected_revision then
    return jsonb_build_object('conflict', true);
  end if;
  insert into public.touchline_fixture_alert_revisions(fixture_id,user_id,revision)
    values(p_fixture_id,p_user_id,p_expected_revision+1)
    on conflict(fixture_id,user_id) do update set revision=excluded.revision;
  if p_active then
    -- Preserve interest_created_at and enrollment on an accepted no-op.
    insert into public.touchline_fixture_alert_subscriptions(fixture_id,user_id)
      values(p_fixture_id,p_user_id) on conflict do nothing;
  else
    delete from public.touchline_fixture_alert_subscriptions
      where fixture_id=p_fixture_id and user_id=p_user_id;
  end if;
  return public.touchline_fixture_alert_status(p_fixture_id,p_user_id);
end $$;
revoke all on function public.touchline_fixture_alert_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_set_fixture_alert_subscription(uuid,uuid,boolean,bigint) from public,anon,authenticated,service_role;
grant execute on function public.touchline_fixture_alert_status(uuid,uuid) to service_role;
grant execute on function public.touchline_set_fixture_alert_subscription(uuid,uuid,boolean,bigint) to service_role;
