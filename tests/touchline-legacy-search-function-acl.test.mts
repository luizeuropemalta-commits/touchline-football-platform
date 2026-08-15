import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/056_touchline_legacy_search_function_acl_hardening.sql", import.meta.url),
  "utf8",
);

const signatures = [
  "search_global_player_profiles\\(text, integer\\)",
  "search_global_football_links\\(text, text, integer\\)",
  "search_transfermarkt_entities\\(text, text, integer\\)",
];

test("legacy SECURITY DEFINER searches revoke anonymous and implicit PUBLIC execution", () => {
  for (const signature of signatures) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
  }
});

test("legacy searches remain available to authenticated product and server callers", () => {
  for (const signature of signatures) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to authenticated, service_role`, "i"),
    );
  }
});
