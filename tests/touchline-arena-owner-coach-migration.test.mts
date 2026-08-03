import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/047_touchline_arena_owner_coach.sql", import.meta.url),
  "utf8",
);

test("migration 047 adds only nullable coach identity state", () => {
  assert.match(
    migration,
    /alter table public\.touchline_user_arena_state\s+add column if not exists coach_provider_id text;/,
  );
  assert.doesNotMatch(migration, /coach_provider_id\s+text\s+not null/i);
  assert.match(
    migration,
    /create index if not exists touchline_user_arena_state_coach_provider_idx[\s\S]*?where coach_provider_id is not null;/,
  );
});

test("migration 047 does not alter RLS, financial state, contracts or grants", () => {
  const executableSql = migration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(executableSql, /\b(?:policy|grant|revoke|enable row level security)\b/i);
  assert.doesNotMatch(executableSql, /\b(?:wallet|credit|stripe|payment|price|contract|ledger)\b/i);
});
