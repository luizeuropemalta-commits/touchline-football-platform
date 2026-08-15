import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/055_touchline_card_ranking_function_acl_hardening.sql", import.meta.url),
  "utf8",
);

test("ranking publication SECURITY DEFINER functions are unavailable to public callers", () => {
  assert.match(
    migration,
    /revoke all on function public\.reject_published_touchline_ranking_mutation\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.publish_touchline_card_ranking_snapshot\(text, text, timestamptz\)[\s\S]*from public, anon, authenticated/i,
  );
});

test("ranking publication remains available only to the server authority", () => {
  assert.match(
    migration,
    /grant execute on function public\.publish_touchline_card_ranking_snapshot\(text, text, timestamptz\)[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|authenticated|public)/i);
});
