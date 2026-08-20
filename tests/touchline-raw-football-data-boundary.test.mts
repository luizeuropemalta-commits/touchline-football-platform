import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260820055004_qa_raw_football_data_browser_boundary.sql", import.meta.url),
  "utf8",
);
const triggerMigration = await readFile(
  new URL("../supabase/migrations/20260820060148_qa_raw_football_trigger_execute_boundary.sql", import.meta.url),
  "utf8",
);
const serviceGrantMigration = await readFile(
  new URL("../supabase/migrations/20260820061016_qa_raw_football_service_role_minimum_grants.sql", import.meta.url),
  "utf8",
);
const foundationRoute = await readFile(
  new URL("../app/api/football-data/foundation/route.ts", import.meta.url),
  "utf8",
);
const publicSquadRoute = await readFile(
  new URL("../app/api/football-data/premier-squad/route.ts", import.meta.url),
  "utf8",
);
const routeManifest = await readFile(
  new URL("../scripts/qa/build-touchline-route-audit-manifest.mts", import.meta.url),
  "utf8",
);

const rawTables = [
  "football_players",
  "football_clubs",
  "football_squad_members",
  "football_seasons",
];

test("QA raw football-table migration removes browser policies and grants together", () => {
  assert.match(migration, /QA-only forward hardening/);
  assert.match(migration, /xgxbwqxjssxxuihuwmgy/);
  assert.match(migration, /from pg_policies/);
  assert.match(migration, /drop policy if exists %I on public\.%I/);
  assert.match(migration, /revoke all privileges on table public\.%I from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.%I to service_role/);

  for (const table of rawTables) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /grant select[^\n]*to authenticated/i);
  for (const triggerFunction of ["football_clubs_search_update", "football_players_search_update"]) {
    assert.match(triggerMigration, new RegExp(`revoke all on function public\\.${triggerFunction}\\(\\)[\\s\\S]*?from public, anon, authenticated`));
    assert.match(triggerMigration, new RegExp(`grant execute on function public\\.${triggerFunction}\\(\\) to service_role`));
  }
  assert.match(serviceGrantMigration, /revoke all privileges on table public\.%I from service_role/);
  assert.match(serviceGrantMigration, /grant select, insert, update, delete on table public\.%I to service_role/);
});

test("foundation is owner/server-only and maps raw rows through named DTOs", () => {
  assert.match(foundationRoute, /isOwnerEmail\(user\?\.email\)/);
  assert.match(foundationRoute, /hasTouchLineArenaAccess\(user\)/);
  assert.match(foundationRoute, /return \{ client: admin, mode: "owner_session" \}/);
  assert.match(foundationRoute, /function competitionDto/);
  assert.match(foundationRoute, /function seasonDto/);
  assert.match(foundationRoute, /function clubDto/);
  assert.match(foundationRoute, /function squadMemberDto/);
  assert.match(foundationRoute, /function playerDto/);
  assert.match(foundationRoute, /function syncRunDto/);
  assert.match(foundationRoute, /Owner session or football data read secret required/);
  assert.doesNotMatch(foundationRoute, /publicFoundationRecord|provider_player_id|market_value_currency|contract_until|source_payload|error_message/);
});

test("foundation raw-player query excludes provider valuation and contract metadata", () => {
  const marker = '.from("football_players")';
  const start = foundationRoute.indexOf(marker);
  const end = foundationRoute.indexOf(".in(\"id\", playerIds)", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const playerQuery = foundationRoute.slice(start, end);

  assert.match(playerQuery, /id,current_club_id,name,display_name,age,nationality,position,source_updated_at/);
  assert.doesNotMatch(playerQuery, /provider|market_value|contract_until|photo_url|date_of_birth|height|weight/);
});

test("public product surface remains a dedicated squad/card allowlist", () => {
  assert.match(publicSquadRoute, /loadTouchlinePublicPlayerProjections/);
  assert.match(publicSquadRoute, /loadTouchlinePublishedCardPresentations/);
  assert.match(publicSquadRoute, /Public card presentation is\s*\/\/ editorial/);
  assert.match(routeManifest, /OWNER_DIAGNOSTIC_ALLOWLIST/);
  assert.match(routeManifest, /CANONICAL_SQUAD_AND_EDITORIAL_CARD_READ/);
});
