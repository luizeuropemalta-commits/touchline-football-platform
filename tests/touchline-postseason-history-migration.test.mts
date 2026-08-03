import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL("../supabase/migrations/040_touchline_postseason_history_foundation.sql", import.meta.url);

test("post-season history migration preserves historical summaries and honours server-side", async () => {
  const source = await readFile(fileURLToPath(migrationUrl), "utf8");

  assert.match(source, /create table if not exists public\.touchline_season_owner_summaries/i);
  assert.match(source, /unique \(user_id, season_id\)/i);
  assert.match(source, /summary_status text not null default 'draft'/i);
  assert.match(source, /validated_at timestamptz/i);
  assert.match(source, /summary_status = 'frozen'.*frozen_at is not null/is);
  assert.match(source, /create table if not exists public\.touchline_season_owner_honours/i);
  assert.match(source, /honour_type text not null check/i);
  assert.match(source, /create table if not exists public\.touchline_season_owner_history_corrections/i);
  assert.match(source, /touchline_guard_frozen_season_summary/i);
  assert.match(source, /touchline_guard_frozen_season_honour/i);
  assert.match(source, /touchline_correct_frozen_season_summary/i);
  assert.match(source, /touchline_correct_frozen_season_honours/i);
  assert.match(source, /touchline_season_owner_summaries_updated/i);
  assert.match(source, /execute function public\.touch_updated_at\(\)/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.touchline_season_owner_summaries from anon, authenticated/i);
  assert.match(source, /revoke all on table public\.touchline_season_owner_history_corrections from anon, authenticated/i);
  assert.match(source, /revoke all on function public\.touchline_correct_frozen_season_honours/i);
  assert.match(source, /grant select, insert, update on table public\.touchline_season_owner_honours to service_role/i);
  assert.match(source, /delete from public\.touchline_season_owner_honours/i);
  assert.doesNotMatch(source, /truncate/i);
});
