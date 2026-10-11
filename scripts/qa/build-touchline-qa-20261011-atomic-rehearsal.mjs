// LOCAL REHEARSAL ONLY. This builder cannot connect, execute SQL, or invoke a
// Supabase CLI. It emits SQL text solely for the companion PGlite rehearsal;
// the caller, not a comment, remains responsible for never using that text as
// a remote command. The guarded 060 source remains a DRAFT.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  TOUCHLINE_QA_MIGRATION_BATCH_20261011,
  prepareTouchlineQaMigrationPayload,
} from "./verify-touchline-qa-migration-batch-20261011.mjs";

const preimage = Object.freeze({
  file: "supabase/qa/060_touchline_qa_20261011_batch_preimage_DRAFT.sql",
  sourceSha256: "407cd72971596754c6c8c815055a6272979b17fc1d53cb4394fdd3765f7a7a48",
  beginLine: 4,
  draftGuardLine: 5,
  commitLine: 201,
});
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const validSha = (value, length) => typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const validUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export const TOUCHLINE_QA_20261011_PREIMAGE_DRAFT = preimage;

// This is not a SQL parser. It accepts only the current exact, hash-bound
// DRAFT and reconstructs it byte-for-byte after removing its three known
// envelope/guard lines. A changed DRAFT must be independently reviewed.
export function prepareTouchlineQaBatchPreimageDraft(source) {
  assert(Buffer.isBuffer(source), "060 source must be bytes");
  assert.equal(sha256(source), preimage.sourceSha256, "TL_QA_BATCH_PREIMAGE_DRAFT_HASH_MISMATCH");
  const text = source.toString("utf8");
  assert(Buffer.from(text).equals(source), "TL_QA_BATCH_PREIMAGE_DRAFT_ENCODING_INVALID");
  const lines = text.split("\n");
  assert.equal(lines[preimage.beginLine - 1], "begin;", "TL_QA_BATCH_PREIMAGE_DRAFT_BEGIN_MISMATCH");
  assert.equal(lines[preimage.draftGuardLine - 1], "do $not_approved$ begin raise exception 'TL_QA_PREIMAGE_DRAFT_NOT_APPROVED'; end $not_approved$;", "TL_QA_BATCH_PREIMAGE_DRAFT_GUARD_MISMATCH");
  assert.equal(lines[preimage.commitLine - 1], "commit;", "TL_QA_BATCH_PREIMAGE_DRAFT_COMMIT_MISMATCH");
  assert.equal(lines.length, preimage.commitLine + 1, "TL_QA_BATCH_PREIMAGE_DRAFT_TRAILING_CONTENT_INVALID");
  assert.equal(lines.at(-1), "", "TL_QA_BATCH_PREIMAGE_DRAFT_FINAL_NEWLINE_REQUIRED");
  assert.deepEqual(lines.flatMap((line, index) => /^(begin|commit|rollback);$/i.test(line) ? [index + 1] : []), [preimage.beginLine, preimage.commitLine], "TL_QA_BATCH_PREIMAGE_DRAFT_TRANSACTION_ENVELOPE_INVALID");
  const retained = lines.filter((_, index) => ![preimage.beginLine, preimage.draftGuardLine, preimage.commitLine].includes(index + 1));
  const restored = [...retained];
  restored.splice(preimage.beginLine - 1, 0, "begin;");
  restored.splice(preimage.draftGuardLine - 1, 0, "do $not_approved$ begin raise exception 'TL_QA_PREIMAGE_DRAFT_NOT_APPROVED'; end $not_approved$;");
  restored.splice(preimage.commitLine - 1, 0, "commit;");
  assert(Buffer.from(restored.join("\n")).equals(source), "TL_QA_BATCH_PREIMAGE_DRAFT_RECONSTRUCTION_MISMATCH");
  const payload = Buffer.from(retained.join("\n"));
  return Object.freeze({ payload, metadata: Object.freeze({
    file: preimage.file,
    sourceSha256: preimage.sourceSha256,
    payloadSha256: sha256(payload),
    sourceBytes: source.length,
    payloadBytes: payload.length,
    removedLines: Object.freeze([preimage.beginLine, preimage.draftGuardLine, preimage.commitLine]),
    draftGuard: "TL_QA_PREIMAGE_DRAFT_NOT_APPROVED",
  }) });
}

function assertReleaseIdentity(releaseSha, manifestSha256) {
  assert(validSha(releaseSha, 40), "TL_QA_BATCH_RELEASE_SHA_INVALID");
  assert(validSha(manifestSha256, 64), "TL_QA_BATCH_MANIFEST_SHA_INVALID");
}

function vipGrantCutoverSql(grant) {
  if (grant === undefined) return "";
  assert(grant !== null && typeof grant === "object" && !Array.isArray(grant), "TL_QA_BATCH_VIP_GRANT_INVALID");
  assert.deepEqual(Object.keys(grant).sort(), ["actorEmail", "actorId", "commandId", "expectedAppMetadataMd5", "expectedEntitlementMd5", "reason", "targetEmail", "targetId"].sort(), "TL_QA_BATCH_VIP_GRANT_FIELDS_INVALID");
  for (const field of ["actorId", "targetId", "commandId"]) assert(validUuid(grant[field]), `TL_QA_BATCH_VIP_${field.toUpperCase()}_INVALID`);
  for (const field of ["actorEmail", "targetEmail"]) {
    assert(typeof grant[field] === "string" && grant[field] === grant[field].trim().toLowerCase()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(grant[field]), `TL_QA_BATCH_VIP_${field.toUpperCase()}_INVALID`);
  }
  assert(grant.actorId !== grant.targetId && grant.actorEmail !== grant.targetEmail, "TL_QA_BATCH_VIP_SELF_GRANT_INVALID");
  for (const field of ["expectedAppMetadataMd5", "expectedEntitlementMd5"])
    assert(validSha(grant[field], 32), `TL_QA_BATCH_VIP_${field.toUpperCase()}_INVALID`);
  assert(typeof grant.reason === "string" && grant.reason === grant.reason.trim()
    && grant.reason.length >= 2 && grant.reason.length <= 240 && !/[\x00-\x1f\x7f]/.test(grant.reason), "TL_QA_BATCH_VIP_REASON_INVALID");
  const actorId = sqlLiteral(grant.actorId);
  const actorEmail = sqlLiteral(grant.actorEmail);
  const targetId = sqlLiteral(grant.targetId);
  const targetEmail = sqlLiteral(grant.targetEmail);
  const commandId = sqlLiteral(grant.commandId);
  const appMetadataMd5 = sqlLiteral(grant.expectedAppMetadataMd5);
  const entitlementMd5 = sqlLiteral(grant.expectedEntitlementMd5);
  return `-- LOCAL VIP CUTOVER REHEARSAL, not an approved QA command.
do $qa_vip_pregrant$
begin
  perform 1 from auth.users where id=${targetId}::uuid
    and lower(email)=${targetEmail} and email_confirmed_at is not null
    and md5(coalesce(raw_app_meta_data,'{}'::jsonb)::text)=${appMetadataMd5} for update;
  if not found then
    raise exception 'TL_QA_BATCH_VIP_TARGET_PREIMAGE_MISMATCH';
  end if;
  perform 1 from public.touchline_fantasy_entitlements
    where user_id=${targetId}::uuid and entitlement_key='fantasy_access'
      and status='active' and source='qa_grant' and plan_key is null
      and md5((to_jsonb(touchline_fantasy_entitlements)-'plan_key')::text)=${entitlementMd5} for update;
  if not found then
    raise exception 'TL_QA_BATCH_VIP_ENTITLEMENT_PREIMAGE_MISMATCH';
  end if;
end
$qa_vip_pregrant$;
select public.touchline_fantasy_grant_vip_access(${actorId}::uuid,${actorEmail},${targetEmail},${sqlLiteral(grant.reason)},${commandId}::uuid);
do $qa_vip_postgrant$
begin
  if (select count(*) from public.touchline_fantasy_vip_grants
      where command_id=${commandId}::uuid and actor_id=${actorId}::uuid
        and target_user_id=${targetId}::uuid and target_email=${targetEmail}
        and md5((before_entitlement-'plan_key')::text)=${entitlementMd5}) <> 1
    or (select count(*) from public.touchline_fantasy_entitlements
      where user_id=${targetId}::uuid and entitlement_key='fantasy_access'
        and status='active' and source='owner_vip_grant' and plan_key='vip'
        and current_period_start is null and current_period_end is null) <> 1 then
    raise exception 'TL_QA_BATCH_VIP_POSTIMAGE_MISMATCH';
  end if;
end
$qa_vip_postgrant$;`;
}

function postimageChecks({ releaseSha, manifestSha256, preparedBatch, lockReceipt = true }) {
  const expectedVersions = preparedBatch.map(({ entry }) => sqlLiteral(entry.version)).join(",");
  const exactHistory = preparedBatch.map(({ entry, source }) => `
    if not exists (select 1 from supabase_migrations.schema_migrations
      where version=${sqlLiteral(entry.version)}
        and name=${sqlLiteral(entry.file.split("/").at(-1).replace(/\.sql$/, ""))}
        and statements=array[${sqlLiteral(source.toString("utf8"))}]) then
      raise exception 'TL_QA_BATCH_POSTIMAGE_HISTORY_MISMATCH: ${entry.version}';
    end if;`).join("\n");
  return `-- PARTIAL POSTIMAGE: receipt/history, selected RPC ACL, receipt-table
-- RLS/ACL, and named column/constraint contracts only. It does not assert a
-- complete remote catalog, every grant/policy, or an operational postflight.
do $postimage$
declare
  v_receipt public.touchline_qa_20261011_batch_preimage_receipts%rowtype;
  v_constraint_mismatch text;
begin
  select * into v_receipt from public.touchline_qa_20261011_batch_preimage_receipts
    where receipt_key='20261011005000-20261011015000' ${lockReceipt ? "for update" : ""};
  if not found
    or v_receipt.state is distinct from 'PREIMAGE_CAPTURED'
    or v_receipt.snapshot ->> 'release_sha' is distinct from ${sqlLiteral(releaseSha)}
    or v_receipt.snapshot ->> 'manifest_sha256' is distinct from ${sqlLiteral(manifestSha256)}
    or v_receipt.snapshot_md5 is distinct from md5(v_receipt.snapshot::text) then
    raise exception 'TL_QA_BATCH_POSTIMAGE_PREIMAGE_RECEIPT_MISMATCH';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in (${expectedVersions})) <> ${preparedBatch.length} then
    raise exception 'TL_QA_BATCH_POSTIMAGE_HISTORY_COUNT_MISMATCH';
  end if;
  ${exactHistory}
  if to_regprocedure('public.touchline_arena_quick_substitution_apply(uuid,uuid,uuid,bigint,text,text,text,uuid,uuid)') is null
    or to_regprocedure('public.touchline_live_presentation_publish_current()') is null
    or to_regprocedure('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)') is null
    or to_regprocedure('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)') is null
    or to_regprocedure('public.touchline_fantasy_lock_gameweek(uuid)') is null then
    raise exception 'TL_QA_BATCH_POSTIMAGE_FUNCTION_MISSING';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='touchline_arena_quick_substitution_sessions' and column_name='gameweek_id')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='touchline_arena_quick_substitution_events' and column_name='command_hash')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='touchline_fantasy_entitlements' and column_name='plan_key')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='touchline_fantasy_user_gameweeks' and column_name='market_plan_key_snapshot')
    or to_regclass('public.touchline_fantasy_vip_grants') is null
    or to_regclass('public.touchline_fantasy_beta_enrollments') is null then
    raise exception 'TL_QA_BATCH_POSTIMAGE_SCHEMA_MISMATCH';
  end if;
  -- The batch grants these externally callable RPCs only to service_role.
  -- Trigger helpers deliberately have no executable grant, so they are not
  -- treated as RPCs here.
  if exists (
    select 1
    from (values
      (to_regprocedure('public.touchline_arena_quick_substitution_start(uuid,uuid,text,uuid[],uuid[])')),
      (to_regprocedure('public.touchline_arena_quick_substitution_apply(uuid,uuid,uuid,bigint,text,text,text,uuid,uuid)')),
      (to_regprocedure('public.touchline_live_presentation_publish_current()')),
      (to_regprocedure('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)')),
      (to_regprocedure('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)')),
      (to_regprocedure('public.touchline_fantasy_lock_gameweek(uuid)')),
      (to_regprocedure('public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid)')),
      (to_regprocedure('public.touchline_fantasy_enroll_beta(uuid,text)'))
    ) expected(procedure_oid)
    left join pg_proc procedure_row on procedure_row.oid = expected.procedure_oid::oid
    where expected.procedure_oid is null
      or not has_function_privilege('service_role', expected.procedure_oid::oid, 'EXECUTE')
      or has_function_privilege('anon', expected.procedure_oid::oid, 'EXECUTE')
      or has_function_privilege('authenticated', expected.procedure_oid::oid, 'EXECUTE')
      or exists (
        select 1
        from aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) grant_row
        where grant_row.grantee = 0 and grant_row.privilege_type = 'EXECUTE'
      )
  ) then
    raise exception 'TL_QA_BATCH_POSTIMAGE_FUNCTION_ACL_MISMATCH';
  end if;
  -- VIP/Beta receipts are private audit tables: RLS stays enabled and only
  -- service_role may read them. Their immutable writes happen in definer RPCs.
  if exists (
    select 1
    from (values ('touchline_fantasy_vip_grants'), ('touchline_fantasy_beta_enrollments')) expected(table_name)
    left join pg_class table_row on table_row.relname = expected.table_name
    left join pg_namespace table_schema on table_schema.oid = table_row.relnamespace and table_schema.nspname = 'public'
    where table_schema.oid is null
      or not table_row.relrowsecurity
      or not has_table_privilege('service_role', table_row.oid, 'SELECT')
      or has_table_privilege('service_role', table_row.oid, 'INSERT')
      or has_table_privilege('service_role', table_row.oid, 'UPDATE')
      or has_table_privilege('service_role', table_row.oid, 'DELETE')
      or has_table_privilege('service_role', table_row.oid, 'TRUNCATE')
      or has_table_privilege('anon', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or exists (
        select 1
        from aclexplode(coalesce(table_row.relacl, acldefault('r', table_row.relowner))) grant_row
        where grant_row.grantee = 0 and grant_row.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
      )
      or exists (
        select 1
        from pg_attribute column_acl
        where column_acl.attrelid = table_row.oid and column_acl.attnum > 0 and not column_acl.attisdropped
          and (
            has_column_privilege('anon', table_row.oid, column_acl.attname, 'SELECT,INSERT,UPDATE,REFERENCES')
            or has_column_privilege('authenticated', table_row.oid, column_acl.attname, 'SELECT,INSERT,UPDATE,REFERENCES')
            or has_column_privilege('service_role', table_row.oid, column_acl.attname, 'INSERT,UPDATE,REFERENCES')
          )
      )
  ) then
    raise exception 'TL_QA_BATCH_POSTIMAGE_RECEIPT_TABLE_SECURITY_MISMATCH';
  end if;
  if exists (
    select 1
    from (values
      ('touchline_arena_quick_substitution_sessions','gameweek_id','uuid','uuid','NO'),
      ('touchline_arena_quick_substitution_events','command_hash','text','text','NO'),
      ('touchline_arena_quick_substitution_events','expected_roster_revision','text','text','NO'),
      ('touchline_arena_quick_substitution_events','actor_id','uuid','uuid','NO'),
      ('touchline_arena_quick_substitution_events','before_state','jsonb','jsonb','NO'),
      ('touchline_arena_quick_substitution_events','after_state','jsonb','jsonb','NO'),
      ('touchline_arena_quick_substitution_events','release_sha','text','text','NO'),
      ('touchline_fantasy_entitlements','plan_key','text','text','YES'),
      ('touchline_fantasy_vip_grants','receipt','jsonb','jsonb','NO'),
      ('touchline_fantasy_beta_enrollments','receipt','jsonb','jsonb','NO'),
      ('touchline_fantasy_user_gameweeks','budget_eur_snapshot','bigint','int8','YES'),
      ('touchline_fantasy_user_gameweeks','market_plan_key_snapshot','text','text','YES')
    ) expected(table_name,column_name,data_type,udt_name,is_nullable)
    left join information_schema.columns column_row
      on column_row.table_schema = 'public'
     and column_row.table_name = expected.table_name
     and column_row.column_name = expected.column_name
    where column_row.column_name is null
      or column_row.data_type is distinct from expected.data_type
      or column_row.udt_name is distinct from expected.udt_name
      or column_row.is_nullable is distinct from expected.is_nullable
  ) then
    raise exception 'TL_QA_BATCH_POSTIMAGE_COLUMN_CONTRACT_MISMATCH';
  end if;
  select string_agg(
    mismatches.constraint_name || '=' || coalesce(
      mismatches.actual_definition,
      (select string_agg(actual_constraint.conname || ':' || lower(pg_get_constraintdef(actual_constraint.oid)), ';' order by actual_constraint.conname)
       from pg_constraint actual_constraint
       join pg_class actual_relation on actual_relation.oid = actual_constraint.conrelid
       join pg_namespace actual_schema on actual_schema.oid = actual_relation.relnamespace
       where actual_schema.nspname = 'public' and actual_relation.relname = mismatches.table_name),
      '<missing>'
    ), E'\n'
    order by mismatches.constraint_name
  ) into v_constraint_mismatch
    from (
      select expected.table_name, expected.constraint_name, pg_get_constraintdef(constraint_row.oid, false) as actual_definition
      from (values
        ('touchline_arena_quick_substitution_events','touchline_arena_quick_substitution_events_command_hash_check','c','CHECK ((command_hash ~ ''^[0-9a-f]{64}$''::text))'),
        ('touchline_arena_quick_substitution_events','touchline_arena_quick_substituti_expected_roster_revision_check','c','CHECK (((length(btrim(expected_roster_revision)) >= 1) AND (length(btrim(expected_roster_revision)) <= 128)))'),
        ('touchline_arena_quick_substitution_events','touchline_arena_quick_substitution_events_before_state_check','c','CHECK ((jsonb_typeof(before_state) = ''object''::text))'),
        ('touchline_arena_quick_substitution_events','touchline_arena_quick_substitution_events_after_state_check','c','CHECK ((jsonb_typeof(after_state) = ''object''::text))'),
        ('touchline_arena_quick_substitution_events','touchline_arena_quick_substitution_events_release_sha_check','c','CHECK (((release_sha = ''unknown''::text) OR (release_sha ~ ''^[0-9a-f]{40}$''::text)))'),
        ('touchline_fantasy_entitlements','touchline_fantasy_entitlements_plan_key_check','c','CHECK (((plan_key IS NULL) OR (plan_key = ANY (ARRAY[''beta''::text, ''standard''::text, ''pro''::text, ''master''::text, ''vip''::text]))))'),
        ('touchline_fantasy_entitlements','touchline_fantasy_entitlements_source_check','c','CHECK ((source = ANY (ARRAY[''stripe_test''::text, ''qa_grant''::text, ''owner_vip_grant''::text, ''beta_free''::text])))'),
        ('touchline_fantasy_user_gameweeks','touchline_fantasy_user_gameweeks_budget_eur_snapshot_check','c','CHECK (((budget_eur_snapshot IS NULL) OR (budget_eur_snapshot > 0)))'),
        ('touchline_fantasy_user_gameweeks','touchline_fantasy_user_gameweeks_market_plan_key_snapshot_check','c','CHECK (((market_plan_key_snapshot IS NULL) OR (market_plan_key_snapshot = ANY (ARRAY[''beta''::text, ''standard''::text, ''pro''::text, ''master''::text, ''vip''::text]))))'),
        ('touchline_fantasy_audit_events','touchline_fantasy_audit_events_event_type_check','c','CHECK ((event_type = ANY (ARRAY[''DRAFT_SAVED''::text, ''XI_CONFIRMED''::text, ''XI_LOCKED''::text, ''XI_REJECTED''::text, ''SCORE_RECONCILED''::text, ''ENTITLEMENT_CHANGED''::text])))'),
        ('touchline_fantasy_vip_grants','touchline_fantasy_vip_grants_pkey','p','PRIMARY KEY (command_id)'),
        ('touchline_fantasy_beta_enrollments','touchline_fantasy_beta_enrollments_pkey','p','PRIMARY KEY (user_id)')
      ) expected(table_name,constraint_name,constraint_type,normalized_definition)
      left join pg_constraint constraint_row on constraint_row.conname = expected.constraint_name
      left join pg_class relation_row on relation_row.oid = constraint_row.conrelid and relation_row.relname = expected.table_name
      left join pg_namespace relation_schema on relation_schema.oid = relation_row.relnamespace and relation_schema.nspname = 'public'
      where relation_schema.oid is null
        or constraint_row.contype is distinct from expected.constraint_type
        or constraint_row.convalidated is not true
        or pg_get_constraintdef(constraint_row.oid, false) is distinct from expected.normalized_definition
    ) mismatches;
  if v_constraint_mismatch is not null then
    raise exception 'TL_QA_BATCH_POSTIMAGE_CONSTRAINT_CONTRACT_MISMATCH: %', v_constraint_mismatch;
  end if;
  if not exists (
    select 1
    from pg_index index_row
    join pg_class index_relation on index_relation.oid = index_row.indexrelid
    join pg_class table_relation on table_relation.oid = index_row.indrelid
    join pg_namespace table_schema on table_schema.oid = table_relation.relnamespace
    where index_relation.relname = 'touchline_arena_quick_substitution_events_command_hash_idx'
      and table_schema.nspname = 'public'
      and table_relation.relname = 'touchline_arena_quick_substitution_events'
      and index_row.indisunique is true and index_row.indisvalid is true and index_row.indisready is true
      and index_row.indpred is null and index_row.indexprs is null
      and index_row.indnkeyatts = 2 and index_row.indnatts = 2
      and (select array_agg(attribute_row.attname::text order by key_column.ordinality)
             from unnest(index_row.indkey::smallint[]) with ordinality key_column(attnum, ordinality)
             join pg_attribute attribute_row on attribute_row.attrelid = table_relation.oid and attribute_row.attnum = key_column.attnum
             where key_column.ordinality <= index_row.indnkeyatts) = array['session_id','command_hash']::text[]
  ) then
    raise exception 'TL_QA_BATCH_POSTIMAGE_COMMAND_DEDUPLICATION_INDEX_MISMATCH';
  end if;
  if position('TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_CONTRACT_INVALID' in pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure)) = 0
    or position('TL_FANTASY_PLAN_INVALID' in pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)) = 0
    or position('v_lock_observed_at' in pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure)) = 0 then
    raise exception 'TL_QA_BATCH_POSTIMAGE_FUNCTION_CONTRACT_MISMATCH';
  end if;
  -- The hosted QA app still calls prepare/save. A legacy active entitlement
  -- with no plan would be rejected by migration14000 after this commit.
  if exists (select 1 from public.touchline_fantasy_entitlements
    where status = 'active' and plan_key is null) then
    raise exception 'TL_QA_BATCH_POSTIMAGE_UNCLASSIFIED_ACTIVE_ENTITLEMENT';
  end if;
end
$postimage$;`;
}

export function buildTouchlineQaBatchAtomicRehearsal({ releaseSha, manifestSha256, preimageSource, batchSources, vipGrant }) {
  assertReleaseIdentity(releaseSha, manifestSha256);
  const vipCutover = vipGrantCutoverSql(vipGrant);
  const preparedPreimage = prepareTouchlineQaBatchPreimageDraft(preimageSource);
  assert(batchSources instanceof Map, "TL_QA_BATCH_SOURCES_REQUIRED");
  const preparedBatch = TOUCHLINE_QA_MIGRATION_BATCH_20261011.map((entry) => {
    const bytes = batchSources.get(entry.file);
    assert(Buffer.isBuffer(bytes), `TL_QA_BATCH_SOURCE_MISSING: ${entry.file}`);
    return Object.freeze({ entry, source: bytes, payload: prepareTouchlineQaMigrationPayload(entry, bytes).payload });
  });
  const versions = preparedBatch.map(({ entry }) => entry.version);
  const payloads = preparedBatch.map(({ entry, source, payload }) => `${payload.toString("utf8")}
insert into supabase_migrations.schema_migrations(version,name,statements)
  values(${sqlLiteral(entry.version)},${sqlLiteral(entry.file.split("/").at(-1).replace(/\.sql$/, ""))},array[${sqlLiteral(source.toString("utf8"))}]);
-- TL_QA_BATCH_AFTER_HISTORY:${entry.version}${entry.version === "20261011011000" ? `\n${vipCutover}` : ""}`).join("\n");
  const sql = `-- LOCAL REHEARSAL / DRAFT / NOT_FOR_REMOTE_EXECUTION.
-- Generated from hash-bound sources. It is not an apply command.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select set_config('touchline.release_sha',${sqlLiteral(releaseSha)},true);
select set_config('touchline.manifest_sha256',${sqlLiteral(manifestSha256)},true);
lock table supabase_migrations.schema_migrations in exclusive mode;
do $preflight$
declare v_receipt_exists boolean := false;
begin
  -- The receipt relation is first created by 060 itself. Dynamic SQL avoids
  -- parsing a reference to an absent table on a clean first run.
  if to_regclass('public.touchline_qa_20261011_batch_preimage_receipts') is not null then
    execute 'select exists (select 1 from public.touchline_qa_20261011_batch_preimage_receipts where receipt_key=''20261011005000-20261011015000'')' into v_receipt_exists;
  end if;
  if v_receipt_exists then
    raise exception 'TL_QA_BATCH_PREIMAGE_RECEIPT_EXISTS_RECONCILE';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in (${versions.map(sqlLiteral).join(",")})) then
    raise exception 'TL_QA_BATCH_HISTORY_EXISTS_RECONCILE';
  end if;
end
$preflight$;
${preparedPreimage.payload.toString("utf8")}
-- TL_QA_BATCH_AFTER_PREIMAGE_RECEIPT
${payloads}
-- TL_QA_BATCH_BEFORE_POSTIMAGE
${postimageChecks({ releaseSha, manifestSha256, preparedBatch })}
-- TL_QA_BATCH_BEFORE_COMMIT
commit;
`;
  return Object.freeze({ sql, metadata: Object.freeze({
    kind: "TOUCHLINE_QA_20261011_ATOMIC_REHEARSAL_DRAFT",
    remoteExecution: "forbidden",
    releaseSha,
    manifestSha256,
    preimage: preparedPreimage.metadata,
    postimage: "partial-structural-contract-only",
    vipCutover: vipGrant === undefined ? "missing-fails-postimage-for-active-null-plan" : "local-rehearsal-only",
    batch: Object.freeze(preparedBatch.map(({ entry, source, payload }) => Object.freeze({
      version: entry.version, file: entry.file, sourceSha256: entry.sourceSha256,
      payloadSha256: sha256(payload), sourceBytes: source.length,
    }))),
  }) });
}

// Read-only post-COMMIT reconciliation, not a repair/rollback executor. The
// same hash-bound migration sources are checked before a query is emitted.
export function buildTouchlineQaBatchPostCommitReadOnlyCheck({ releaseSha, manifestSha256, batchSources, vipGrant }) {
  assertReleaseIdentity(releaseSha, manifestSha256);
  assert(vipGrant !== undefined, "TL_QA_BATCH_POSTCOMMIT_VIP_GRANT_REQUIRED");
  vipGrantCutoverSql(vipGrant);
  assert(batchSources instanceof Map, "TL_QA_BATCH_SOURCES_REQUIRED");
  const preparedBatch = TOUCHLINE_QA_MIGRATION_BATCH_20261011.map((entry) => {
    const source = batchSources.get(entry.file);
    assert(Buffer.isBuffer(source), `TL_QA_BATCH_SOURCE_MISSING: ${entry.file}`);
    prepareTouchlineQaMigrationPayload(entry, source);
    return Object.freeze({ entry, source });
  });
  const targetId = sqlLiteral(vipGrant.targetId);
  const commandId = sqlLiteral(vipGrant.commandId);
  const actorId = sqlLiteral(vipGrant.actorId);
  const targetEmail = sqlLiteral(vipGrant.targetEmail);
  const entitlementMd5 = sqlLiteral(vipGrant.expectedEntitlementMd5);
  const sql = `-- READ ONLY POST-COMMIT RECONCILIATION; no repair or deployment.
begin transaction read only;
set local statement_timeout = '30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
${postimageChecks({ releaseSha, manifestSha256, preparedBatch, lockReceipt: false })}
do $qa_vip_postcommit$
begin
  if (select count(*) from public.touchline_fantasy_vip_grants
      where command_id=${commandId}::uuid and actor_id=${actorId}::uuid
        and target_user_id=${targetId}::uuid and target_email=${targetEmail}
        and md5((before_entitlement-'plan_key')::text)=${entitlementMd5}) <> 1
    or (select count(*) from public.touchline_fantasy_entitlements
      where user_id=${targetId}::uuid and entitlement_key='fantasy_access'
        and status='active' and source='owner_vip_grant' and plan_key='vip'
        and current_period_start is null and current_period_end is null) <> 1 then
    raise exception 'TL_QA_BATCH_POSTCOMMIT_VIP_MISMATCH';
  end if;
end
$qa_vip_postcommit$;
select 'TL_QA_BATCH_POSTCOMMIT_READ_ONLY_PASS' as result;
rollback;`;
  return Object.freeze({ sql, metadata: Object.freeze({ kind: "TOUCHLINE_QA_BATCH_POSTCOMMIT_READ_ONLY_CHECK",
    remoteMutation: "forbidden", releaseSha, manifestSha256, migrationCount: preparedBatch.length }) });
}

async function localSources() {
  const preimageSource = await readFile(new URL("../../supabase/qa/060_touchline_qa_20261011_batch_preimage_DRAFT.sql", import.meta.url));
  const batchSources = new Map(await Promise.all(TOUCHLINE_QA_MIGRATION_BATCH_20261011.map(async (entry) => [
    entry.file,
    await readFile(new URL(`../../${entry.file}`, import.meta.url)),
  ])));
  return { preimageSource, batchSources };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stdout.write(`${JSON.stringify({
      kind: "TOUCHLINE_QA_20261011_ATOMIC_REHEARSAL_DRAFT",
      remoteExecution: "forbidden",
      preimage: { ...preimage, draftGuard: "TL_QA_PREIMAGE_DRAFT_NOT_APPROVED" },
      batchVersions: TOUCHLINE_QA_MIGRATION_BATCH_20261011.map((entry) => entry.version),
    })}\n`);
  } else {
    assert.deepEqual(args.slice(0, 1), ["--emit-local-rehearsal"], "Use no arguments for metadata, or --emit-local-rehearsal --release-sha <sha> --manifest-sha256 <sha>");
    assert.equal(args.length, 5, "Local rehearsal export requires exact release and manifest SHAs");
    assert.equal(args[1], "--release-sha");
    assert.equal(args[3], "--manifest-sha256");
    const inputs = await localSources();
    process.stdout.write(buildTouchlineQaBatchAtomicRehearsal({ releaseSha: args[2], manifestSha256: args[4], ...inputs }).sql);
  }
}
