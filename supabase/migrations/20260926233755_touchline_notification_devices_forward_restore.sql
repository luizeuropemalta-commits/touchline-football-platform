-- Forward-only repair. Never replay/delete the recorded historical migration.
-- No sender, cron, consent, feature flag or existing row is created/modified.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.users') is null
     or to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'notification device prerequisites missing';
  end if;
  if to_regclass('public.notification_devices') is not null then
    if not exists (select 1 from pg_class where oid = 'public.notification_devices'::regclass and relkind = 'r') then
      raise exception 'notification devices is not an ordinary table';
    end if;
    lock table public.notification_devices in access exclusive mode;
    if exists (
      select 1 from (values
        ('id','uuid',true), ('user_id','uuid',true), ('installation_id','uuid',true),
        ('permission','text',true), ('push_subscription','jsonb',false),
        ('user_agent','text',false), ('last_seen_at','timestamp with time zone',true),
        ('created_at','timestamp with time zone',true), ('updated_at','timestamp with time zone',true)
      ) expected(name, kind, required)
      left join pg_attribute a on a.attrelid = 'public.notification_devices'::regclass
        and a.attname = expected.name and not a.attisdropped
      where a.attnum is null or format_type(a.atttypid,a.atttypmod) <> expected.kind
        or a.attnotnull <> expected.required or a.attgenerated <> '' or a.attidentity <> ''
    ) or (select count(*) from pg_attribute where attrelid = 'public.notification_devices'::regclass and attnum > 0 and not attisdropped) <> 9 then
      raise exception 'notification devices incompatible columns; preserve and review';
    end if;
    -- Unknown policies/triggers could widen access or mutate data: refuse, do not erase them.
    if exists (select 1 from pg_policy where polrelid = 'public.notification_devices'::regclass
      and polname <> 'users manage own notification devices')
      or exists (select 1 from pg_trigger where tgrelid = 'public.notification_devices'::regclass
        and not tgisinternal and (tgname <> 'notification_devices_updated'
          or tgfoid <> 'public.touch_updated_at()'::regprocedure)) then
      raise exception 'notification devices unexpected policy or trigger';
    end if;
  end if;
end $$;

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  installation_id uuid not null,
  permission text not null check (permission in ('granted','denied','default')),
  push_subscription jsonb,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,installation_id)
);

-- Require original identity constraints on any pre-existing relation.
do $$
declare ids smallint[]; owner_ids smallint[]; user_col smallint[]; parent_col smallint[];
begin
  if exists (
    select 1 from (values ('id','gen_random_uuid()'),('last_seen_at','now()'),('created_at','now()'),('updated_at','now()')) expected(name, expression)
    join pg_attribute a on a.attrelid='public.notification_devices'::regclass and a.attname=expected.name
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where d.oid is null or pg_get_expr(d.adbin,d.adrelid) <> expected.expression
  ) then raise exception 'notification devices incompatible defaults'; end if;
  select array[attnum] into ids from pg_attribute where attrelid='public.notification_devices'::regclass and attname='id';
  select array_agg(attnum order by case attname when 'user_id' then 0 else 1 end) into owner_ids from pg_attribute where attrelid='public.notification_devices'::regclass and attname in ('user_id','installation_id');
  select array[attnum] into user_col from pg_attribute where attrelid='public.notification_devices'::regclass and attname='user_id';
  select array[attnum] into parent_col from pg_attribute where attrelid='public.users'::regclass and attname='id';
  if not exists(select 1 from pg_constraint c join pg_index i on i.indexrelid=c.conindid where conrelid='public.notification_devices'::regclass and contype='p' and conkey=ids and convalidated and not condeferrable and i.indisvalid and i.indisready and i.indimmediate)
    or not exists(select 1 from pg_constraint c join pg_index i on i.indexrelid=c.conindid where conrelid='public.notification_devices'::regclass and contype='u' and conkey=owner_ids and convalidated and not condeferrable and i.indisvalid and i.indisready and i.indimmediate)
    or not exists(select 1 from pg_constraint where conrelid='public.notification_devices'::regclass and contype='f' and conkey=user_col and confrelid='public.users'::regclass and confkey=parent_col and confdeltype='c' and convalidated) then
    raise exception 'notification devices incompatible identity constraints';
  end if;
end $$;

-- SQL CHECK normally accepts NULL. IS TRUE makes missing JSON fields fail closed.
-- Ask this PostgreSQL engine to deparse the trusted expression. Never trust an
-- existing constraint merely because it uses the intended new name.
create temporary table touchline_device_check_template(permission text,push_subscription jsonb) on commit drop;
alter table touchline_device_check_template add constraint expected_device_subscription check ((
  (permission in ('denied','default') and push_subscription is null)
  or (permission = 'granted'
    and jsonb_typeof(push_subscription) = 'object'
    and jsonb_typeof(push_subscription->'endpoint') = 'string'
    and length(btrim(push_subscription->>'endpoint')) between 8 and 2048
    and btrim(push_subscription->>'endpoint') ~ '^https://[^/:?#[:space:]]+(?::[0-9]{1,5})?(?:/[^[:space:]]*)?$'
    and jsonb_typeof(push_subscription->'keys') = 'object'
    and jsonb_typeof(push_subscription->'keys'->'p256dh') = 'string'
    and length(btrim(push_subscription->'keys'->>'p256dh')) between 16 and 512
    and btrim(push_subscription->'keys'->>'p256dh') ~ '^[A-Za-z0-9_-]+$'
    and jsonb_typeof(push_subscription->'keys'->'auth') = 'string'
    and length(btrim(push_subscription->'keys'->>'auth')) between 16 and 512
    and btrim(push_subscription->'keys'->>'auth') ~ '^[A-Za-z0-9_-]+$'
  )
) is true);

do $$
declare expected text; actual record; columns smallint[];
begin
  select pg_get_expr(conbin,conrelid,false) into strict expected from pg_constraint
    where conrelid='pg_temp.touchline_device_check_template'::regclass and conname='expected_device_subscription';
  select array_agg(attnum order by attnum) into columns from pg_attribute
    where attrelid='public.notification_devices'::regclass and attname in ('permission','push_subscription');
  select *,pg_get_expr(conbin,conrelid,false) expression into actual from pg_constraint
    where conrelid='public.notification_devices'::regclass and conname='notification_devices_subscription_complete';
  if found then
    if actual.contype <> 'c' or not actual.conislocal or actual.coninhcount <> 0 or not actual.convalidated
      or (select array_agg(n order by n) from unnest(actual.conkey) n) is distinct from columns
      or actual.expression is distinct from expected then
      raise exception 'notification devices incompatible named subscription constraint';
    end if;
  else
    execute format('alter table public.notification_devices add constraint notification_devices_subscription_complete check (%s)',expected);
  end if;
end $$;

-- Trusted deparse captured from the unchanged historical migration in PostgreSQL.
-- A name alone never authorises dropping a constraint. Unknown checks are refused.
do $repair$
declare c record; matches integer := 0; subscription_column smallint; columns smallint[];
  legacy constant text := $legacy$(((permission = ANY (ARRAY['denied'::text, 'default'::text])) AND (push_subscription IS NULL)) OR ((permission = 'granted'::text) AND (jsonb_typeof(push_subscription) = 'object'::text) AND (jsonb_typeof((push_subscription -> 'endpoint'::text)) = 'string'::text) AND ((length(btrim((push_subscription ->> 'endpoint'::text))) >= 8) AND (length(btrim((push_subscription ->> 'endpoint'::text))) <= 2048)) AND (btrim((push_subscription ->> 'endpoint'::text)) ~ '^https://[^/:?#[:space:]]+(?::[0-9]{1,5})?(?:/[^[:space:]]*)?$'::text) AND (jsonb_typeof((push_subscription -> 'keys'::text)) = 'object'::text) AND (jsonb_typeof(((push_subscription -> 'keys'::text) -> 'p256dh'::text)) = 'string'::text) AND (btrim(((push_subscription -> 'keys'::text) ->> 'p256dh'::text)) ~ '^[A-Za-z0-9_-]{16,512}$'::text) AND (jsonb_typeof(((push_subscription -> 'keys'::text) -> 'auth'::text)) = 'string'::text) AND (btrim(((push_subscription -> 'keys'::text) ->> 'auth'::text)) ~ '^[A-Za-z0-9_-]{16,512}$'::text)))$legacy$;
begin
  select attnum into subscription_column from pg_attribute where attrelid='public.notification_devices'::regclass and attname='push_subscription';
  select array_agg(attnum order by attnum) into columns from pg_attribute where attrelid='public.notification_devices'::regclass and attname in ('permission','push_subscription');
  for c in select oid,conname,conkey,conislocal,coninhcount,pg_get_expr(conbin,conrelid,false) expression
    from pg_constraint where conrelid='public.notification_devices'::regclass and contype='c'
      and conname <> 'notification_devices_subscription_complete'
      and subscription_column = any(conkey)
  loop
    if (select array_agg(n order by n) from unnest(c.conkey) n) is distinct from columns or not c.conislocal or c.coninhcount <> 0 or c.expression <> legacy then
      raise exception 'notification devices unrecognised subscription constraint';
    end if;
    matches := matches + 1;
    if matches > 1 then raise exception 'notification devices ambiguous legacy constraints'; end if;
    execute format('alter table public.notification_devices drop constraint %I',c.conname);
  end loop;
end $repair$;

create index if not exists notification_devices_user_seen_idx on public.notification_devices(user_id,last_seen_at desc);
do $$
begin
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam
    where c.oid=to_regclass('public.notification_devices_user_seen_idx')
      and i.indrelid='public.notification_devices'::regclass and am.amname='btree'
      and i.indisvalid and i.indisready and not i.indisunique
      and i.indnkeyatts=2 and i.indnatts=2 and i.indexprs is null and i.indpred is null
      and i.indkey::text = (select u.attnum::text || ' ' || s.attnum::text from pg_attribute u,pg_attribute s
        where u.attrelid=i.indrelid and u.attname='user_id' and s.attrelid=i.indrelid and s.attname='last_seen_at')
      and i.indoption::text='0 3'
  ) then raise exception 'notification devices incompatible lookup index'; end if;
end $$;
drop trigger if exists notification_devices_updated on public.notification_devices;
create trigger notification_devices_updated before update on public.notification_devices
  for each row execute function public.touch_updated_at();
alter table public.notification_devices enable row level security;
alter table public.notification_devices force row level security;
drop policy if exists "users manage own notification devices" on public.notification_devices;
create policy "users manage own notification devices" on public.notification_devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_devices from public, anon, authenticated;
grant select,insert,update on public.notification_devices to authenticated;
grant select,insert,update,delete on public.notification_devices to service_role;
commit;
