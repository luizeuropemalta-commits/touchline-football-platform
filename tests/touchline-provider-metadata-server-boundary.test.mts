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

test("foundation exposes only a server-side sanitized sync-run projection", () => {
  assert.match(foundationRoute, /const admin = createAdminClient\(\)/);
  assert.match(foundationRoute, /admin\s*\?\s*admin[\s\S]*?\.from\("football_data_sync_runs"\)/);
  assert.match(foundationRoute, /recentSyncRuns: publicFoundationRecord\(syncRuns \?\? \[\]\)/);
});
