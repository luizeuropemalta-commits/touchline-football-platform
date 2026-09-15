import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260915120000_touchline_agency_command_authorization_hardening.sql", import.meta.url),
  "utf8",
);

const legacyPolicies = [
  "agency members access agency",
  "tenant clubs",
  "tenant players",
  "tenant deals",
  "tenant contracts",
  "tenant invoices",
  "tenant documents",
  "tenant videos",
  "tenant notes",
  "tenant market snapshots",
  "tenant market radar links",
  "tenant club agent follows",
  "tenant player opportunities",
  "tenant player interests",
  "tenant negotiation rooms",
  "tenant negotiation messages",
  "tenant negotiation files",
  "tenant football live items",
  "tenant community posts phase2",
  "tenant match predictions",
];

test("every broad same-agency policy is removed and no replacement uses FOR ALL", () => {
  for (const policy of legacyPolicies) {
    assert.match(migration, new RegExp(`drop policy if exists "${policy}"`, "i"), policy);
  }
  assert.doesNotMatch(migration, /create policy[^;]+for all/is);
});

test("authenticated grants are reset before precise read and mutation grants", () => {
  assert.match(migration, /alter default privileges[\s\S]*revoke insert, update, delete on tables from authenticated/i);
  assert.match(migration, /revoke all privileges on table[\s\S]*public\.match_predictions[\s\S]*from authenticated/i);
  assert.match(migration, /grant select on table[\s\S]*public\.match_predictions[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant insert[^;]*public\.match_predictions[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /grant update[^;]*public\.match_predictions[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /grant delete[^;]*public\.match_predictions[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /grant update[^;]*points_awarded[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /grant update[^;]*resolved_at[^;]*to authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table[\s\S]*public\.match_predictions[\s\S]*to service_role/i);
});

test("agency roots cannot be deleted and owner/admin guard tenant administration", () => {
  assert.match(migration, /grant update on table public\.agencies to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*public\.agencies[^;]*to authenticated/i);
  assert.doesNotMatch(migration, /on public\.agencies for delete/i);
  assert.match(migration, /agency administrators update agency[\s\S]*current_agency_role\(\) in \('owner'::public\.agency_role, 'admin'::public\.agency_role\)/i);
  for (const table of ["clubs", "contracts", "player_market_snapshots"]) {
    assert.match(migration, new RegExp(`'${table}'`), table);
  }
  const tenantAdminBlock = migration.match(/Owner\/admin-only tenant[\s\S]*?end\n\$policy\$;/i)?.[0] ?? "";
  assert.equal((tenantAdminBlock.match(/'player_market_snapshots'/g) ?? []).length, 1);
});

test("role matrix keeps finance invoice-only and binds agent-owned workflows", () => {
  assert.match(migration, /agency finance insert invoices[\s\S]*'finance'::public\.agency_role/i);
  assert.equal((migration.match(/'finance'::public\.agency_role/g) ?? []).length, 4);
  assert.doesNotMatch(migration, /'(?:viewer|analyst)'::public\.agency_role/i);

  const ownedOperationalTables = [
    ["players", "agent_id"],
    ["deals", "owner_id"],
    ["player_documents", "uploaded_by"],
    ["player_notes", "author_id"],
    ["club_agent_follows", "followed_by"],
    ["player_opportunities", "created_by"],
    ["player_interests", "created_by"],
    ["negotiation_rooms", "created_by"],
    ["negotiation_messages", "sender_id"],
    ["negotiation_files", "uploaded_by"],
    ["market_radar_links", "created_by"],
  ];
  for (const [table, author] of ownedOperationalTables) {
    assert.match(migration, new RegExp(`\\('${table}', '${author}'\\)`), `${table}.${author}`);
  }
  assert.match(migration, /current_agency_role\(\) = ''agent''::public\.agency_role and %I = auth\.uid\(\)/i);
  assert.match(migration, /if item\.table_name in \('players', 'negotiation_rooms'\)[\s\S]*agency administrators delete/i);
  assert.match(migration, /agency administrators insert player videos[\s\S]*'owner'::public\.agency_role,[\s\S]*'admin'::public\.agency_role/i);
  assert.match(migration, /agency administrators delete player videos[\s\S]*'owner'::public\.agency_role,[\s\S]*'admin'::public\.agency_role/i);
});

test("global rows are read-only, authored community rows are bound, and predictions are service-written", () => {
  assert.match(migration, /array\['football_live_items'\]/i);
  assert.match(migration, /for select to authenticated using \(agency_id is null or agency_id = public\.current_agency_id\(\)\)/i);
  assert.match(migration, /for insert to authenticated with check \(agency_id = public\.current_agency_id\(\)/i);

  assert.match(migration, /members read global or agency community_posts_phase2[\s\S]*agency_id is null or agency_id = public\.current_agency_id\(\)/i);
  assert.match(migration, /agency operators insert tenant community_posts_phase2[\s\S]*author_id = auth\.uid\(\)/i);
  assert.match(migration, /agency operators update tenant community_posts_phase2[\s\S]*author_id = auth\.uid\(\)[\s\S]*with check[\s\S]*author_id = auth\.uid\(\)/i);
  assert.match(migration, /agency operators delete tenant community_posts_phase2[\s\S]*author_id = auth\.uid\(\)/i);

  assert.match(migration, /members read own predictions[\s\S]*user_id = auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /create policy "members insert own/i);
  assert.doesNotMatch(migration, /create policy "members update own predictions"/i);
  assert.doesNotMatch(migration, /create policy "members delete own predictions"/i);
  assert.match(migration, /clients receive[\s\S]*read-only access/i);
  assert.match(migration, /revoke update \(prediction\) on table public\.match_predictions from authenticated/i);
});

test("migration is transaction-bounded and drops replacement policies before recreating them", () => {
  assert.match(migration, /begin;\s*set local lock_timeout = '5s';/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /drop policy if exists "agency administrators update agency"/i);
  assert.match(migration, /drop policy if exists %I on public\.%I[\s\S]*agency administrators update/i);
  assert.match(migration, /drop policy if exists %I on public\.%I[\s\S]*agency operators update/i);
  assert.match(migration, /drop policy if exists "agency administrators update tenant community_posts_phase2"/i);
  assert.match(migration, /drop policy if exists "members update own unsettled predictions"/i);
  assert.match(migration, /drop policy if exists "agency operators update player videos"/i);
});
