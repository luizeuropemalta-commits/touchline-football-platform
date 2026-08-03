import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/(app)/admin/football-data/page.tsx", import.meta.url),
  "utf8",
);

test("football admin reads the canonical normalized schema", () => {
  for (const column of [
    "country",
    "venue_id",
    "photo_url",
    "first_name",
    "last_name",
    "position",
    "nationality",
    "source_updated_at",
    "completed_at",
  ]) {
    assert.match(source, new RegExp(`\\b${column}\\b`), `missing canonical column: ${column}`);
  }

  for (const staleColumn of [
    "country_name",
    "venue_name",
    "image_url",
    "firstname",
    "lastname",
    "position_name",
    "nationality_name",
    "is_current",
    "finished_at",
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${staleColumn}\\b`), `stale column remains: ${staleColumn}`);
  }

  assert.match(source, /\.eq\("status", "active"\)/);
});

test("football admin reports query failures without exposing raw diagnostics", () => {
  assert.match(source, /competitionsResult\.error/);
  assert.match(source, /clubsResult\.error/);
  assert.match(source, /syncRunsResult\.error/);
  assert.match(source, /squadResult\.error/);
  assert.match(source, /playersResult\.error/);
  assert.match(source, /read unavailable/);
  assert.match(source, /No credentials or provider payloads are shown here/);
  assert.doesNotMatch(source, /\{run\.error_message\}/);
});

test("football admin uses the canonical provider and sync status contracts", () => {
  assert.match(source, /getConfiguredFootballDataProviderName\(\)/);
  assert.match(source, /status === "error"/);
  assert.match(source, /status === "not_configured"/);
  assert.doesNotMatch(source, /status === "failed"/);
  assert.doesNotMatch(source, /process\.env\.FOOTBALL_DATA_PROVIDER/);
});
