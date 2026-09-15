-- QA-only rollback for the three local Social Studio proposals:
--   20260914212250_touchline_social_studio_review_plans.sql
--   20260914222454_touchline_social_studio_review_desk.sql
--   20260915110000_touchline_social_studio_server_review_evidence.sql
--
-- This rollback is intentionally conservative. It refuses to delete persisted
-- plans, review history, delivery evidence or server-timed review evidence.
-- It does not enable or invoke any outbound publisher, queue or scheduler.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Require the exact three-migration surface. A partial or later schema must be
-- reviewed separately instead of being coerced with broad dependency removal.
do $$
begin
  if pg_catalog.to_regclass('public.touchline_social_studio_records') is null
    or pg_catalog.to_regclass('public.touchline_social_studio_history') is null
    or pg_catalog.to_regclass('public.touchline_social_studio_deliveries') is null
    or pg_catalog.to_regclass('public.touchline_social_studio_review_evidence') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_save(text,integer,jsonb,uuid,uuid,text,text)') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_save_v2(text,integer,jsonb,uuid,uuid,text,text,uuid,integer)') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_save_v3(text,integer,jsonb,uuid,uuid,text,text,uuid,integer,uuid,text)') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_capabilities()') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_review_start(uuid,uuid,text,integer,text,numeric)') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_review_tick(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('public.touchline_social_studio_review_invalidate(uuid,uuid)') is null
    or (select count(*) from pg_catalog.pg_tables
        where schemaname = 'public' and tablename like 'touchline_social_studio%') <> 4
    or (select count(*) from pg_catalog.pg_proc
        where pronamespace = 'public'::pg_catalog.regnamespace
          and proname like 'touchline_social_studio%') <> 7
    or exists (select 1 from pg_catalog.pg_policies
        where schemaname = 'public' and tablename like 'touchline_social_studio%') then
    raise exception using errcode = 'P0001', message = 'TL_SOCIAL_STUDIO_054_SCHEMA_MISMATCH';
  end if;
end
$$;

-- One lock acquisition order closes writes through every Studio RPC before the
-- emptiness gate. The transaction retains these locks until every DROP commits.
lock table
  public.touchline_social_studio_records,
  public.touchline_social_studio_history,
  public.touchline_social_studio_deliveries,
  public.touchline_social_studio_review_evidence
in access exclusive mode;

-- Table locks precede the detailed signature check so no concurrent ALTER can
-- enter between validation and removal.  Column signatures cover ordinal
-- position, type/typmod, nullability and defaults.  Constraint and index
-- signatures reject additions/removals and material key/order changes.  These
-- migrations intentionally create no user triggers.
do $$
begin
  if exists (
    with expected(table_name, signature) as (values
      ('touchline_social_studio_records',
        'record_key:text:true:|revision:integer:true:0|document:jsonb:true:|updated_at:timestamp with time zone:true:now()'),
      ('touchline_social_studio_history',
        'request_id:uuid:true:|record_key:text:true:|actor_id:uuid:true:|request_checksum:text:true:|action:text:true:|revision:integer:true:|document:jsonb:true:|created_at:timestamp with time zone:true:now()'),
      ('touchline_social_studio_deliveries',
        'id:uuid:true:|record_key:text:true:|instance_id:text:true:|platform:text:true:|account_id:text:true:|placement:text:true:|media_identity:text:true:|revision:integer:true:0|state:text:true:|receipt_id:text:false:|error:text:false:|retryable:boolean:true:false|source_current:boolean:true:false|source_valid_until:timestamp with time zone:true:|attempt_count:integer:true:0|last_attempt_at:timestamp with time zone:false:|retry_requested_at:timestamp with time zone:false:'),
      ('touchline_social_studio_review_evidence',
        'id:uuid:true:|actor_id:uuid:true:|record_key:text:true:|record_revision:integer:true:|media_identity:text:true:|media_duration_seconds:numeric(8,3):true:|started_at:timestamp with time zone:true:now()|last_tick_at:timestamp with time zone:true:now()|observed_seconds:numeric(10,3):true:0|completed_loops:integer:true:0|completed_at:timestamp with time zone:false:|invalidated_at:timestamp with time zone:false:|consumed_by_request_id:uuid:false:|consumed_action:text:false:|consumed_at:timestamp with time zone:false:')
    ), actual as (
      select c.relname::text as table_name,
        string_agg(
          a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
          || ':' || a.attnotnull::text || ':'
          || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), ''),
          '|' order by a.attnum
        ) as signature
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
        and a.attnum > 0 and not a.attisdropped
      left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname like 'touchline_social_studio%'
      group by c.relname
    ), mismatch as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select 1 from mismatch
  ) then
    raise exception using errcode = 'P0001', message = 'TL_SOCIAL_STUDIO_054_SCHEMA_MISMATCH';
  end if;

  if exists (
    with expected(table_name, signature) as (values
      ('touchline_social_studio_records',
        'touchline_social_studio_records_document_check:c,touchline_social_studio_records_pkey:p,touchline_social_studio_records_record_key_check:c,touchline_social_studio_records_revision_check:c'),
      ('touchline_social_studio_history',
        'touchline_social_studio_history_action_check:c,touchline_social_studio_history_actor_id_fkey:f,touchline_social_studio_history_pkey:p,touchline_social_studio_history_record_key_fkey:f,touchline_social_studio_history_record_key_revision_key:u,touchline_social_studio_history_request_checksum_check:c,touchline_social_studio_history_revision_check:c'),
      ('touchline_social_studio_deliveries',
        'touchline_social_studio_deliv_instance_id_platform_account__key:u,touchline_social_studio_deliveries_account_id_check:c,touchline_social_studio_deliveries_attempt_count_check:c,touchline_social_studio_deliveries_check:c,touchline_social_studio_deliveries_check1:c,touchline_social_studio_deliveries_check2:c,touchline_social_studio_deliveries_instance_id_check:c,touchline_social_studio_deliveries_media_identity_check:c,touchline_social_studio_deliveries_pkey:p,touchline_social_studio_deliveries_platform_check:c,touchline_social_studio_deliveries_record_key_fkey:f,touchline_social_studio_deliveries_revision_check:c,touchline_social_studio_deliveries_state_check:c'),
      ('touchline_social_studio_review_evidence',
        'touchline_social_studio_review_evi_media_duration_seconds_check:c,touchline_social_studio_review_evidence_actor_id_fkey:f,touchline_social_studio_review_evidence_check:c,touchline_social_studio_review_evidence_check1:c,touchline_social_studio_review_evidence_completed_loops_check:c,touchline_social_studio_review_evidence_consumed_action_check:c,touchline_social_studio_review_evidence_media_identity_check:c,touchline_social_studio_review_evidence_observed_seconds_check:c,touchline_social_studio_review_evidence_pkey:p,touchline_social_studio_review_evidence_record_key_check:c,touchline_social_studio_review_evidence_record_revision_check:c')
    ), actual as (
      select c.relname::text as table_name,
        string_agg(k.conname || ':' || k.contype::text, ',' order by k.conname) as signature
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'touchline_social_studio%'
        -- PostgreSQL 18 also exposes NOT NULL through pg_constraint. Nullability
        -- is already pinned by the version-independent column signature above.
        and k.contype::text <> 'n'
      group by c.relname
    ), mismatch as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select 1 from mismatch
  ) then
    raise exception using errcode = 'P0001', message = 'TL_SOCIAL_STUDIO_054_SCHEMA_MISMATCH';
  end if;

  if exists (
    with expected(table_name, signature) as (values
      ('touchline_social_studio_records',
        'touchline_social_studio_records_pkey:true:true:1:0'),
      ('touchline_social_studio_history',
        'touchline_social_studio_history_pkey:true:true:1:0,touchline_social_studio_history_record_created_idx:false:false:2 8:0 3,touchline_social_studio_history_record_key_revision_key:true:false:2 6:0 0'),
      ('touchline_social_studio_deliveries',
        'touchline_social_studio_deliv_instance_id_platform_account__key:true:false:3 4 5 6:0 0 0 0,touchline_social_studio_deliveries_pkey:true:true:1:0,touchline_social_studio_deliveries_record_idx:false:false:2 16:0 3'),
      ('touchline_social_studio_review_evidence',
        'touchline_social_studio_review_evidence_actor_idx:false:false:2 3 5 7:0 0 0 3,touchline_social_studio_review_evidence_pkey:true:true:1:0')
    ), actual as (
      select t.relname::text as table_name,
        string_agg(
          i.relname || ':' || x.indisunique::text || ':' || x.indisprimary::text
          || ':' || x.indkey::text || ':' || x.indoption::text,
          ',' order by i.relname
        ) as signature
      from pg_catalog.pg_index x
      join pg_catalog.pg_class t on t.oid = x.indrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
      join pg_catalog.pg_class i on i.oid = x.indexrelid
      where n.nspname = 'public' and t.relname like 'touchline_social_studio%'
      group by t.relname
    ), mismatch as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select 1 from mismatch
  ) or exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname like 'touchline_social_studio%'
      and not trigger_row.tgisinternal
  ) then
    raise exception using errcode = 'P0001', message = 'TL_SOCIAL_STUDIO_054_SCHEMA_MISMATCH';
  end if;
end
$$;

do $$
declare
  v_capabilities jsonb;
begin
  select public.touchline_social_studio_capabilities() into v_capabilities;
  if coalesce(v_capabilities->>'outbound', '') <> 'DISABLED'
    or coalesce((v_capabilities->>'schemaVersion')::integer, 0) <> 3
    or coalesce(v_capabilities->>'reviewEvidence', '') <> 'SERVER_TIMED' then
    raise exception using errcode = 'P0001', message = 'TL_SOCIAL_STUDIO_054_OUTBOUND_NOT_DISABLED';
  end if;

  if exists (select 1 from public.touchline_social_studio_records)
    or exists (select 1 from public.touchline_social_studio_history)
    or exists (select 1 from public.touchline_social_studio_deliveries)
    or exists (select 1 from public.touchline_social_studio_review_evidence) then
    raise exception using errcode = 'P0001', message = 'TL_SOCIAL_STUDIO_054_NONEMPTY';
  end if;
end
$$;

-- Reverse dependency order. Exact signatures and restrictive drops make drift fail
-- closed. The migrations created RLS with no policies, which the schema gate
-- above verifies before any object is removed.
drop function public.touchline_social_studio_save_v3(
  text, integer, jsonb, uuid, uuid, text, text, uuid, integer, uuid, text
);
drop function public.touchline_social_studio_review_invalidate(uuid, uuid);
drop function public.touchline_social_studio_review_tick(uuid, uuid);
drop function public.touchline_social_studio_review_start(uuid, uuid, text, integer, text, numeric);
drop function public.touchline_social_studio_save_v2(
  text, integer, jsonb, uuid, uuid, text, text, uuid, integer
);
drop function public.touchline_social_studio_capabilities();
drop function public.touchline_social_studio_save(
  text, integer, jsonb, uuid, uuid, text, text
);

drop table public.touchline_social_studio_review_evidence;
drop table public.touchline_social_studio_deliveries;
drop table public.touchline_social_studio_history;
drop table public.touchline_social_studio_records;

commit;
