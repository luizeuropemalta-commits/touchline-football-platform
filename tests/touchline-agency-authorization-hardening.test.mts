import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/057_touchline_agency_identity_authorization_hardening.sql", import.meta.url),
  "utf8",
);

test("self-service profile writes cannot change agency or authorization columns", () => {
  assert.match(migration, /revoke update on table public\.users from authenticated/i);
  assert.match(
    migration,
    /grant update \(full_name, avatar_url, phone, job_title\) on table public\.users[\s\S]*?to authenticated/i,
  );
  assert.doesNotMatch(migration, /grant update \([^)]*(?:agency_id|role)[^)]*\)/i);
});

test("agency role lookup is not executable anonymously", () => {
  assert.match(migration, /create or replace function public\.current_agency_role\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.current_agency_role\(\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.current_agency_role\(\)[\s\S]*?to authenticated, service_role/i,
  );
});

test("sensitive agency tables require owner or admin for every mutation", () => {
  const tables = [
    "agent_identity_verifications",
    "agent_player_associations",
    "representation_documents",
    "representation_admin_reviews",
  ];

  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`on public\\.${table}[\\s\\S]*?for select[\\s\\S]*?to authenticated[\\s\\S]*?agency_id = public\\.current_agency_id\\(\\)`, "i"),
    );

    for (const operation of ["insert", "update", "delete"]) {
      assert.match(
        migration,
        new RegExp(`on public\\.${table}[\\s\\S]*?for ${operation}[\\s\\S]*?to authenticated[\\s\\S]*?current_agency_role\\(\\) in \\('owner'::public\\.agency_role, 'admin'::public\\.agency_role\\)`, "i"),
      );
    }
  }
});

test("legacy same-agency FOR ALL policies are removed", () => {
  assert.doesNotMatch(migration, /create policy "tenant [^"]+"[\s\S]*?for all/i);
});
