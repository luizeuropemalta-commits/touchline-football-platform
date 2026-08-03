import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [historicalGrants, originalArenaState, hardening] = await Promise.all([
  readFile(new URL("../supabase/migrations/005_role_grants_and_api_season.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/024_touchline_beta_analytics.sql", import.meta.url), "utf8"),
  readFile(
    new URL("../supabase/migrations/029_touchline_arena_state_server_write_boundary.sql", import.meta.url),
    "utf8",
  ),
]);

test("Arena-state hardening explicitly neutralizes the historical authenticated CRUD grant", () => {
  assert.match(
    historicalGrants,
    /grant select, insert, update, delete on all tables in schema public to authenticated/,
  );
  assert.match(
    historicalGrants,
    /alter default privileges in schema public grant select, insert, update, delete on tables to authenticated/,
  );
  assert.match(
    hardening,
    /revoke all privileges on table public\.touchline_user_arena_state\s+from public, anon, authenticated/,
  );
  assert.match(
    hardening,
    /grant select on table public\.touchline_user_arena_state to authenticated/,
  );
  assert.doesNotMatch(
    hardening,
    /grant\s+(?:select,\s*)?(?:insert|update|delete)[^;]*to authenticated/i,
  );
});

test("all legacy Arena-state policies are removed and only own-row SELECT is rebuilt", () => {
  assert.match(
    originalArenaState,
    /create policy "Users manage own arena state"[\s\S]*for all[\s\S]*with check \(auth\.uid\(\) = user_id\)/,
  );
  assert.match(
    hardening,
    /drop policy if exists "Users manage own arena state"\s+on public\.touchline_user_arena_state/,
  );
  assert.match(
    hardening,
    /from pg_policies[\s\S]*tablename = 'touchline_user_arena_state'[\s\S]*drop policy if exists/,
  );
  assert.match(
    hardening,
    /create policy "Users read own arena state"[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(auth\.uid\(\) = user_id\)/,
  );
  assert.doesNotMatch(hardening, /create policy[\s\S]*for (?:all|insert|update|delete)/i);
  assert.doesNotMatch(hardening, /with check/i);
});

test("service-role API persistence keeps explicit CRUD privileges", () => {
  assert.match(
    hardening,
    /grant select, insert, update, delete\s+on table public\.touchline_user_arena_state\s+to service_role/,
  );
  assert.match(hardening, /alter table public\.touchline_user_arena_state enable row level security/);
});
