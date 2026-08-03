import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = fs.readFileSync(path.join(root, "app/api/players/search-and-build-card/route.ts"), "utf8");

test("card builder reads the normalized football foundation without writing canonical data", () => {
  assert.match(route, /\.from\("football_players"\)/);
  assert.match(route, /\.from\("football_clubs"\)/);
  assert.match(route, /\.from\("football_squad_members"\)/);
  assert.match(route, /\.from\("football_competitions"\)/);
  assert.doesNotMatch(route, /\.from\("players"\)/);
  assert.doesNotMatch(route, /\.(?:upsert|insert|update|delete)\(/);
  assert.doesNotMatch(route, /persistSportMonksCandidateCache/);
  assert.doesNotMatch(route, /country_id:\s*player\.country_code3/);
  assert.doesNotMatch(route, /position_id:\s*player\.position_code/);
  assert.doesNotMatch(route, /\["display_name",\s*"common_name"\]/);
});

test("official squad hydration is scoped to the player's current club", () => {
  assert.match(route, /\.select\("club_id,player_id,jersey_number,position,source_updated_at"\)/);
  assert.match(route, /\.in\("club_id", clubIds\)/);
  assert.match(
    route,
    /officialSquadMemberKey\(member\.player_id, member\.club_id\)/,
  );
  assert.match(
    route,
    /members\.get\(officialSquadMemberKey\(player\.id, player\.current_club_id\)\)/,
  );
  assert.match(route, /position_name:\s*position/);
  assert.doesNotMatch(route, /countryCode3\(player\.nationality\)/);
});

test("official cache hydration retains missing numeric values as null", () => {
  const numberStart = route.indexOf("function numberOrNull");
  const numberEnd = route.indexOf("function normalizeSearchText", numberStart);
  assert.notEqual(numberStart, -1);
  assert.notEqual(numberEnd, -1);

  const numberHelper = route.slice(numberStart, numberEnd);
  assert.match(numberHelper, /value === null/);
  assert.match(numberHelper, /value === undefined/);
  assert.match(numberHelper, /value === ""/);
});

test("official cache freshness requires real structure but not optional market value", () => {
  const freshnessStart = route.indexOf("function isFreshSavedPlayer");
  const freshnessEnd = route.indexOf("function cachedPlayerSearchCandidate", freshnessStart);
  assert.notEqual(freshnessStart, -1);
  assert.notEqual(freshnessEnd, -1);

  const freshness = route.slice(freshnessStart, freshnessEnd);
  assert.match(freshness, /player\?\.current_team_id/);
  assert.match(freshness, /player\?\.current_team_name/);
  assert.match(freshness, /player\?\.position_name/);
  assert.match(freshness, /player\?\.position_code/);
  assert.doesNotMatch(freshness, /market_value_eur/);
  assert.doesNotMatch(freshness, /"Free Agent"|"League"|"Player"/);
});

test("card builder keeps both schema-readiness diagnostic names", () => {
  assert.match(route, /footballPlayersSchemaReady:\s*true/);
  assert.match(route, /playersSchemaReady:\s*true/);
});

test("full card build prefers complete live data and uses official cache only as fallback", () => {
  const fullBuildStart = route.indexOf("let rawPlayer: any = null");
  const fullBuildEnd = route.indexOf("const savedPlayer = normalized", fullBuildStart);
  assert.notEqual(fullBuildStart, -1);
  assert.notEqual(fullBuildEnd, -1);

  const fullBuild = route.slice(fullBuildStart, fullBuildEnd);
  const liveLookup = fullBuild.indexOf("fetchFullSportMonksPlayer");
  const cacheLookup = fullBuild.indexOf("findSavedSportMonksPlayer");
  assert.notEqual(liveLookup, -1);
  assert.notEqual(cacheLookup, -1);
  assert.ok(liveLookup < cacheLookup);
  assert.match(fullBuild, /normalized = cachedPlayer/);
  assert.doesNotMatch(fullBuild, /enrichPlayerTeamData\(cachedPlayer\)/);
  assert.match(fullBuild, /playerDataSource = "database_fallback"/);
  assert.match(route, /playerDataSource,\n/);
  assert.doesNotMatch(route, /playerDataSource:\s*cachedPlayer\s*\?/);
});
