import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/058_football_provider_metadata_server_boundary.sql", import.meta.url),
  "utf8",
);
const foundationRoute = await readFile(
  new URL("../app/api/football-data/foundation/route.ts", import.meta.url),
  "utf8",
);

test("provider mapping and raw sync metadata are closed to browser roles", () => {
  for (const table of ["football_provider_mappings", "football_data_sync_runs"]) {
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table}\\s+from public, anon, authenticated`, "s"));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table}\\s+to service_role`, "s"));
  }
  assert.doesNotMatch(migration, /create policy[\s\S]*authenticated[\s\S]*football_(?:provider_mappings|data_sync_runs)/i);
});

test("foundation keeps provider metadata behind an owner/server allowlist", () => {
  assert.match(foundationRoute, /isOwnerEmail\(user\?\.email\)/);
  assert.match(foundationRoute, /return \{ client: admin, mode: "owner_session" \}/);
  assert.match(foundationRoute, /\.from\("football_data_sync_runs"\)/);
  assert.match(foundationRoute, /recentSyncRuns: \(syncRuns \?\? \[\]\)\.map\(\(row\) => syncRunDto/);
  assert.doesNotMatch(foundationRoute, /publicFoundationRecord/);
  assert.doesNotMatch(foundationRoute, /source_payload|error_message|provider_player_id|market_value_currency|contract_until/);
});
