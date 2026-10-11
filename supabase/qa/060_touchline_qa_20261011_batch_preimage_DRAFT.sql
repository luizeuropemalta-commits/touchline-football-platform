-- DRAFT / QA ONLY / NOT APPROVED FOR EXECUTION.
-- This deliberate exception keeps the entire transaction inert until local
-- rehearsal, independent review, exact SHA and QA target checks are complete.
begin;
do $not_approved$ begin raise exception 'TL_QA_PREIMAGE_DRAFT_NOT_APPROVED'; end $not_approved$;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
-- Serialize creation and replay, including the first capture with no row yet.
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-qa-20261011-batch-preimage',0));

create table if not exists public.touchline_qa_20261011_batch_preimage_receipts (
  receipt_key text primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  state text not null check (state = 'PREIMAGE_CAPTURED'),
  snapshot jsonb not null,
  snapshot_md5 text not null,
  captured_at timestamptz not null default clock_timestamp()
);
alter table public.touchline_qa_20261011_batch_preimage_receipts enable row level security;
alter table public.touchline_qa_20261011_batch_preimage_receipts force row level security;
revoke all on public.touchline_qa_20261011_batch_preimage_receipts from public, anon, authenticated, service_role;
grant select on public.touchline_qa_20261011_batch_preimage_receipts to service_role;

do $preimage$
declare
  v_key constant text := '20261011005000-20261011015000';
  v_expected constant jsonb := '{
    "public.touchline_arena_quick_substitution_apply(uuid,uuid,uuid,bigint,uuid,uuid)":"88de5ab3cab920c68b75a40d0ea09b65",
    "public.touchline_arena_quick_substitution_start(uuid,uuid,text,uuid[],uuid[])":"675f697e7cc3d1c1f0c5b26c3d414624",
    "public.touchline_live_presentation_publish_current()":"59f4ceafc650015edcce8d6e333f0e19",
    "public.touchline_live_presentation_snapshot_is_immutable()":"bcd774e7a965ddfbafa81de8ed7f9d49",
    "public.touchline_fantasy_user_gameweek_snapshot_is_immutable()":"054b492652a84f765ad631934fb4c5b4",
    "public.touchline_arena_quick_substitution_events_are_immutable()":"977112fe0375886276566972b4f12ab8",
    "public.touchline_fantasy_lock_gameweek(uuid)":"99104d42cdd78f30251d9c628dbb2073",
    "public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)":"63f97cb665363709f67bc763d46f636e",
    "public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)":"c4c11ae4a0f5b69ed57165b67df828dc",
    "public.touchline_fantasy_apply_test_subscription_event(text,timestamptz,text,boolean,uuid,text,text,text,timestamptz,timestamptz)":"5c2dfc6e3dffcec5a56a7d272b3d5b4c"
  }'::jsonb;
  v_sig text;
  v_oid oid;
  v_fn record;
  v_functions jsonb := '{}'::jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_snapshot jsonb;
  v_shape jsonb;
  v_written integer;
  v_release_sha text := current_setting('touchline.release_sha',true);
  v_manifest_sha256 text := current_setting('touchline.manifest_sha256',true);
  v_existing public.touchline_qa_20261011_batch_preimage_receipts%rowtype;
begin
  if v_release_sha is null or v_release_sha !~ '^[0-9a-f]{40}$'
    or v_manifest_sha256 is null or v_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'TL_QA_PREIMAGE_RELEASE_IDENTITY_REQUIRED';
  end if;
  select jsonb_object_agg(a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod))
    into v_shape from pg_catalog.pg_attribute a
    where a.attrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
      and a.attnum>0 and not a.attisdropped;
  if v_shape is distinct from '{"receipt_key":"text","project_ref":"text","state":"text","snapshot":"jsonb","snapshot_md5":"text","captured_at":"timestamp with time zone"}'::jsonb then
    raise exception 'TL_QA_PREIMAGE_RECEIPT_SCHEMA_MISMATCH';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute a
    where a.attrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
      and a.attnum>0 and not a.attisdropped and not a.attnotnull)
    or not exists (select 1 from pg_catalog.pg_constraint k
      where k.conrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
        and k.contype='p' and k.convalidated and k.conkey=array[
          (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid=k.conrelid and a.attname='receipt_key')]::smallint[])
    or (select count(*) from pg_catalog.pg_constraint k
      where k.conrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
        and k.contype='c' and k.convalidated and pg_catalog.pg_get_expr(k.conbin,k.conrelid) in (
          '(project_ref = ''xgxbwqxjssxxuihuwmgy''::text)',
          '(state = ''PREIMAGE_CAPTURED''::text)')) <> 2 then
    raise exception 'TL_QA_PREIMAGE_RECEIPT_CONSTRAINT_MISMATCH';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass and not t.tgisinternal)
    or exists (select 1 from pg_catalog.pg_rewrite r
      where r.ev_class='public.touchline_qa_20261011_batch_preimage_receipts'::regclass)
    or exists (select 1 from pg_catalog.pg_inherits i
      where i.inhrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
        or i.inhparent='public.touchline_qa_20261011_batch_preimage_receipts'::regclass)
    or exists (select 1 from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
        and a.attnum>0 and not a.attisdropped and (
          a.attidentity<>'' or a.attgenerated<>''
          or (a.attname='captured_at' and pg_catalog.pg_get_expr(d.adbin,d.adrelid) is distinct from 'clock_timestamp()')
          or (a.attname<>'captured_at' and d.oid is not null))) then
    raise exception 'TL_QA_PREIMAGE_RECEIPT_HOOK_MISMATCH';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c
    where c.oid='public.touchline_qa_20261011_batch_preimage_receipts'::regclass
      and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity)
    or pg_catalog.has_table_privilege('anon',
      'public.touchline_qa_20261011_batch_preimage_receipts', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated',
      'public.touchline_qa_20261011_batch_preimage_receipts', 'SELECT')
    or not pg_catalog.has_table_privilege('service_role',
      'public.touchline_qa_20261011_batch_preimage_receipts', 'SELECT') then
    raise exception 'TL_QA_PREIMAGE_RECEIPT_ACCESS_MISMATCH';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
    where version::text between '20261011005000' and '20261011015000') then
    raise exception 'TL_QA_PREIMAGE_BATCH_ALREADY_STARTED';
  end if;
  lock table public.touchline_arena_quick_substitution_sessions,
    public.touchline_arena_quick_substitution_events,
    public.touchline_live_presentation_snapshots,
    public.touchline_live_presentation_active_snapshots,
    public.touchline_fantasy_entitlements,
    public.touchline_fantasy_audit_events,
    public.touchline_fantasy_user_gameweeks,
    public.touchline_fantasy_gameweeks in share mode;

  for v_sig in select key from jsonb_each_text(v_expected) loop
    v_oid := pg_catalog.to_regprocedure(v_sig)::oid;
    if v_oid is null then raise exception 'TL_QA_PREIMAGE_FUNCTION_MISSING: %',v_sig; end if;
    select p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_catalog.pg_get_functiondef(p.oid) as definition
      into v_fn from pg_catalog.pg_proc p where p.oid=v_oid;
    if pg_catalog.md5(v_fn.definition) <> v_expected->>v_sig then
      raise exception 'TL_QA_PREIMAGE_FUNCTION_DRIFT: %',v_sig;
    end if;
    v_functions := v_functions || jsonb_build_object(v_sig,jsonb_build_object(
      'definition',v_fn.definition,'md5',pg_catalog.md5(v_fn.definition),
      'owner',pg_catalog.pg_get_userbyid(v_fn.proowner),'proacl',to_jsonb(v_fn.proacl),
      'security_definer',v_fn.prosecdef,'proconfig',to_jsonb(v_fn.proconfig)));
  end loop;

  select pg_catalog.jsonb_object_agg(c.oid::regclass::text,pg_catalog.jsonb_build_object(
    'owner',pg_catalog.pg_get_userbyid(c.relowner),'relacl',to_jsonb(c.relacl),
    'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'columns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d
        on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',k.conname,'type',k.contype,'definition',pg_catalog.pg_get_constraintdef(k.oid),
      'validated',k.convalidated) order by k.conname)
      from pg_catalog.pg_constraint k where k.conrelid=c.oid),
    'triggers',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',t.tgname,'definition',pg_catalog.pg_get_triggerdef(t.oid),
      'enabled',t.tgenabled) order by t.tgname)
      from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
    'indexes',(select pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) order by i.indexrelid)
      from pg_catalog.pg_index i where i.indrelid=c.oid))) into v_tables
  from pg_catalog.pg_class c where c.oid=any(array[
    'public.touchline_arena_quick_substitution_sessions'::regclass,
    'public.touchline_arena_quick_substitution_events'::regclass,
    'public.touchline_live_presentation_snapshots'::regclass,
    'public.touchline_live_presentation_active_snapshots'::regclass,
    'public.touchline_fantasy_entitlements'::regclass,
    'public.touchline_fantasy_audit_events'::regclass,
    'public.touchline_fantasy_user_gameweeks'::regclass,
    'public.touchline_fantasy_gameweeks'::regclass]);
  if (select count(*) from pg_catalog.jsonb_object_keys(v_tables)) <> 8 then
    raise exception 'TL_QA_PREIMAGE_TABLE_SET_MISMATCH';
  end if;
  select pg_catalog.jsonb_build_object(
    'quick_sub_sessions',(select count(*) from public.touchline_arena_quick_substitution_sessions),
    'quick_sub_events',(select count(*) from public.touchline_arena_quick_substitution_events),
    'confirmed_xi',(select count(*) from public.touchline_fantasy_user_gameweeks where state='CONFIRMED'),
    'locked_final_xi',(select count(*) from public.touchline_fantasy_user_gameweeks where state in ('LOCKED','FINAL')))
    into v_counts;
  if (v_counts->>'quick_sub_sessions')::bigint<>0 or (v_counts->>'quick_sub_events')::bigint<>0 then
    raise exception 'TL_QA_PREIMAGE_QUICK_SUB_NOT_EMPTY';
  end if;
  v_snapshot := pg_catalog.jsonb_build_object('release_sha',v_release_sha,
    'manifest_sha256',v_manifest_sha256,'functions',v_functions,'tables',v_tables,'counts',v_counts);
  select * into v_existing from public.touchline_qa_20261011_batch_preimage_receipts
    where receipt_key=v_key for update;
  if found then
    if v_existing.snapshot is distinct from v_snapshot
      or v_existing.snapshot_md5 is distinct from pg_catalog.md5(v_snapshot::text) then
      raise exception 'TL_QA_PREIMAGE_REPLAY_MISMATCH';
    end if;
    return;
  end if;
  insert into public.touchline_qa_20261011_batch_preimage_receipts
    (receipt_key,project_ref,state,snapshot,snapshot_md5)
    values(v_key,'xgxbwqxjssxxuihuwmgy','PREIMAGE_CAPTURED',v_snapshot,pg_catalog.md5(v_snapshot::text));
  get diagnostics v_written = row_count;
  if v_written <> 1 then raise exception 'TL_QA_PREIMAGE_RECEIPT_NOT_WRITTEN'; end if;
  select * into v_existing from public.touchline_qa_20261011_batch_preimage_receipts where receipt_key=v_key;
  if not found or v_existing.snapshot is distinct from v_snapshot
    or v_existing.snapshot_md5 is distinct from pg_catalog.md5(v_snapshot::text)
    or v_existing.project_ref is distinct from 'xgxbwqxjssxxuihuwmgy'
    or v_existing.state is distinct from 'PREIMAGE_CAPTURED' then
    raise exception 'TL_QA_PREIMAGE_RECEIPT_READBACK_MISMATCH';
  end if;
end
$preimage$;

commit;
