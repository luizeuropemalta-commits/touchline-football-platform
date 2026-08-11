import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/053_touchline_owner_approved_533_atomic_batch.sql", import.meta.url),
  "utf8",
);

test("the 533 owner-approved command is one additive transaction with replay protection", () => {
  assert.match(migration, /^-- All-or-nothing application command/m);
  assert.match(migration, /begin;[\s\S]*create or replace function public\.touchline_apply_owner_approved_533_card_publications[\s\S]*commit;/);
  assert.match(migration, /v_rows_count <> 533/);
  assert.match(migration, /TL_OWNER_APPROVED_533_BATCH_COUNT_INVALID/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /manifest_fingerprint_sha256 char\(64\)/);
  assert.match(migration, /create table if not exists public\.touchline_card_publication_batch_rows/);
  assert.match(migration, /preparation_history_id uuid not null/);
  assert.match(migration, /touchline_card_publication_batches_manifest_fingerprint_key/);
  assert.match(migration, /v_batch\.manifest_payload is distinct from p_rows/);
  assert.match(migration, /TL_OWNER_APPROVED_533_BATCH_FINGERPRINT_REUSED/);
  assert.match(migration, /return query select v_batch\.id, v_batch\.status, v_batch\.ready_rows, true/);
});

test("it fails before writes unless every row is a current canonical 20-club membership", () => {
  for (const required of [
    "TL_OWNER_APPROVED_533_BATCH_ROW_INVALID",
    "TL_OWNER_APPROVED_533_BATCH_DUPLICATE",
    "TL_OWNER_APPROVED_533_BATCH_SCOPE_INVALID",
    "TL_OWNER_APPROVED_533_BATCH_CANONICAL_FENCE_FAILED",
    "min(row.\"canonicalCompetitionId\")::uuid",
    "row.\"providerTeamId\" !~ '^[0-9]+$'",
    "row.\"providerPlayerId\" !~ '^[0-9]+$'",
    "player.current_club_id <> club.id",
    "membership.status <> 'active'",
    "competition.provider_competition_id <> '8'",
    "player.source_updated_at <>",
    "membership.source_updated_at <>",
    "(select count(*) from public.football_squad_members as active_membership",
  ]) assert.ok(migration.includes(required), `missing fail-closed fence: ${required}`);

  assert.match(migration, /if exists \([\s\S]*TL_OWNER_APPROVED_533_BATCH_CANONICAL_FENCE_FAILED[\s\S]*insert into public\.touchline_card_publication_batches/);
  assert.match(migration, /publicationAction" <> 'ready_to_publish'/);
  assert.match(migration, /row\.currency <> 'EUR'/);
});

test("preparation remains non-public and the separate cutover is complete-batch-only", () => {
  assert.match(migration, /from public\.touchline_apply_manual_card_publication\(/);
  assert.match(migration, /'ready_to_publish'/);
  assert.match(migration, /set current_batch_id = v_batch\.id/);
  assert.match(migration, /TL_OWNER_APPROVED_533_BATCH_HISTORY_LINK_MISSING/);
  assert.match(migration, /touchline_card_publication_batch_rows as batch_row where batch_row\.batch_id = v_batch\.id\) <> 533/);
  assert.match(migration, /create or replace function public\.touchline_publish_owner_approved_533_card_publications/);
  assert.match(migration, /TL_OWNER_APPROVED_533_PUBLISH_BATCH_NOT_READY/);
  assert.match(migration, /TL_OWNER_APPROVED_533_PUBLISH_CANONICAL_FENCE_FAILED/);
  assert.match(migration, /publication\.publication_status = 'ready_to_publish'/);
  assert.match(migration, /published_card_rows as \(/);
  assert.match(migration, /set publication_status = 'published'/);
  assert.match(migration, /return query select v_batch\.id, 'published'::text, 533, false/);
  assert.match(migration, /revoke all on function public\.touchline_apply_owner_approved_533_card_publications[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_apply_owner_approved_533_card_publications[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.touchline_publish_owner_approved_533_card_publications[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_publish_owner_approved_533_card_publications[\s\S]*to service_role/);
  assert.match(migration, /create or replace function public\.touchline_revert_owner_approved_533_card_publications/);
  assert.match(migration, /TL_OWNER_APPROVED_533_REVERT_HISTORY_LINK_COUNT_INVALID/);
  assert.match(migration, /perform \* from public\.touchline_revert_manual_card_publication/);
  assert.match(migration, /set status = 'reverted'/);
  assert.match(migration, /revoke all on function public\.touchline_revert_owner_approved_533_card_publications[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_revert_owner_approved_533_card_publications[\s\S]*to service_role/);
  assert.equal(/\bgrant\s+(?:select|insert|update|delete)\b[\s\S]*\bto\s+(?:anon|authenticated)\b/i.test(migration), false);
});
