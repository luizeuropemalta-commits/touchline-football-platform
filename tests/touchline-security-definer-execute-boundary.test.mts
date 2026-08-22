import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationsDirectory = path.resolve("supabase/migrations");
const migrationName = "restrict_public_security_definer_function_execution.sql";
const migrationFile = readdirSync(migrationsDirectory).find((file) => file.endsWith(migrationName));

test("security-definer helper grants are explicit and deny anonymous execution", () => {
  assert.ok(migrationFile, `expected a migration ending in ${migrationName}`);
  const source = readFileSync(path.join(migrationsDirectory, migrationFile), "utf8");

  for (const signature of [
    "public.create_ecosystem_organization(text, text, public.organization_type, char)",
    "public.current_agency_id()",
    "public.is_organization_admin(uuid)",
    "public.is_organization_member(uuid)",
  ]) {
    assert.match(source, new RegExp(`revoke all on function ${signature.replace(/[().]/g, "\\$&")}`));
    assert.match(source, new RegExp(`grant execute on function ${signature.replace(/[().]/g, "\\$&")}\\s+to authenticated, service_role`));
  }

  assert.match(source, /revoke all on function public\.handle_new_user\(\)/);
  assert.doesNotMatch(source, /grant execute on function public\.handle_new_user/);
});
