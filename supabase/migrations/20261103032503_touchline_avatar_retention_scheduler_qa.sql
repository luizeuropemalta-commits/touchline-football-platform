begin;
set local lock_timeout='5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
create function touchline_avatar_private.schedule_retention()
returns bigint language plpgsql security definer set search_path='' as $$
declare trigger_secret text; request_id bigint;
begin
  select decrypted_secret into strict trigger_secret from vault.decrypted_secrets
    where name='touchline_qa_avatar_retention_scheduler';
  if trigger_secret !~ '^[A-Za-z0-9_-]{43,128}$' then raise exception 'AVATAR_SCHEDULER_CONFIGURATION'; end if;
  select net.http_post(
    url:='https://xgxbwqxjssxxuihuwmgy.supabase.co/functions/v1/touchline-avatar-retention-scheduler',
    headers:=jsonb_build_object('Content-Type','application/json','x-touchline-avatar-retention-secret',trigger_secret),
    body:='{}'::jsonb,timeout_milliseconds:=100000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function touchline_avatar_private.schedule_retention() from public,anon,authenticated,service_role;
select cron.schedule('touchline-qa-avatar-retention','*/5 * * * *',
  'select touchline_avatar_private.schedule_retention();');
commit;
