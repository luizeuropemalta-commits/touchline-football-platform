import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SPORTMONKS_TWENTY_CLUB_SCOPE,
  buildSportmonksRosterSnapshot,
  projectSportmonksSquadMember,
  readSportmonksRosterReadConfig,
  readSportmonksTeamRoster,
} from "../scripts/export-sportmonks-twenty-club-rosters-readonly.mjs";

const testConfig = {
  apiBaseUrl: "https://api.sportmonks.com/v3/football",
  token: "test-token-not-a-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("read config requires read-only mode, token and the official HTTPS API origin", () => {
  assert.throws(() => readSportmonksRosterReadConfig({}), /READ_ONLY_MODE_REQUIRED/);
  assert.throws(() => readSportmonksRosterReadConfig({ TOUCHLINE_SPORTMONKS_ROSTER_READ_MODE: "read-only" }), /TOKEN_REQUIRED/);
  assert.throws(() => readSportmonksRosterReadConfig({
    TOUCHLINE_SPORTMONKS_ROSTER_READ_MODE: "read-only",
    SPORTMONKS_API_TOKEN: "test",
    SPORTMONKS_BASE_URL: "https://untrusted.example/v3/football",
  }), /BASE_URL_FORBIDDEN/);
  const config = readSportmonksRosterReadConfig({
    TOUCHLINE_SPORTMONKS_ROSTER_READ_MODE: "read-only",
    SPORTMONKS_API_TOKEN: "test",
  });
  assert.equal(config.apiBaseUrl, testConfig.apiBaseUrl);
  assert.equal(config.token, "test");
});

test("team read follows pages and projects no raw provider payload or request URL", async () => {
  const requestedPages: string[] = [];
  const scope = SPORTMONKS_TWENTY_CLUB_SCOPE[0];
  const roster = await readSportmonksTeamRoster({
    scope,
    config: testConfig,
    now: () => "2026-08-09T00:00:00.000Z",
    fetchImpl: (async (input) => {
      const url = new URL(String(input));
      requestedPages.push(url.searchParams.get("page") ?? "");
      if (url.searchParams.get("page") === "1") return json({
        data: [{ player: { id: 101, display_name: "First Player" }, jersey_number: 1, position: { name: "Goalkeeper" } }],
        pagination: { current_page: 1, has_more: true },
      });
      return json({
        data: [{ player: { id: 102, display_name: "Second Player" }, jersey_number: 2, detailedPosition: { name: "Centre Back" } }],
        pagination: { current_page: 2, has_more: false },
      });
    }) as typeof fetch,
  });
  assert.deepEqual(requestedPages, ["1", "2"]);
  assert.equal(roster.state, "ready");
  assert.deepEqual(roster.members.map((member) => member.providerPlayerId), ["101", "102"]);
  assert.equal(JSON.stringify(roster).includes("test-token-not-a-secret"), false);
  assert.equal(JSON.stringify(roster).includes("api_token"), false);
});

test("malformed members and invalid pagination fail closed", async () => {
  const scope = SPORTMONKS_TWENTY_CLUB_SCOPE[0];
  const roster = await readSportmonksTeamRoster({
    scope,
    config: testConfig,
    fetchImpl: (async () => json({
      data: [{ player: { id: "not-numeric", display_name: "Broken" } }],
      pagination: { current_page: 9, has_more: true },
    })) as typeof fetch,
  });
  assert.equal(roster.state, "partial");
  assert.deepEqual(roster.errors.map((error) => error.code), ["INVALID_PROVIDER_PLAYER_ID", "PAGINATION_METADATA_INVALID", "SPORTMONKS_SQUAD_EMPTY"]);
});

test("snapshot marks cross-club duplicate IDs and provider-only rows pending", () => {
  const first = SPORTMONKS_TWENTY_CLUB_SCOPE[0];
  const second = SPORTMONKS_TWENTY_CLUB_SCOPE[1];
  const clubs = SPORTMONKS_TWENTY_CLUB_SCOPE.map((scope) => ({
    providerTeamId: scope.providerTeamId,
    clubName: scope.clubName,
    manualValueScope: scope.manualValueScope,
    fetchedAt: "2026-08-09T00:00:00.000Z",
    state: "ready",
    errors: [],
    members: [{
      providerTeamId: scope.providerTeamId,
      clubName: scope.clubName,
      providerPlayerId: scope.providerTeamId === second.providerTeamId ? "100" : scope.providerTeamId === first.providerTeamId ? "100" : `p${scope.providerTeamId}`,
      playerName: scope.clubName === first.clubName ? "Not In Owner List" : "Known Player",
      jerseyNumber: null,
      position: null,
    }],
  }));
  const snapshot = buildSportmonksRosterSnapshot({
    clubs,
    ownerRows: [{ club_name: first.clubName, player_display_name: "Known Player", normalized_player_name: "known player" }],
    startedAt: "2026-08-09T00:00:00.000Z",
    completedAt: "2026-08-09T00:00:01.000Z",
  });
  assert.equal(snapshot.validation.state, "partial");
  assert.deepEqual(snapshot.validation.duplicateProviderPlayerIds, [{
    providerPlayerId: "100",
    clubs: [first.clubName, second.clubName].sort(),
    providerTeamIds: [first.providerTeamId, second.providerTeamId].sort((left, right) => Number(left) - Number(right)),
  }]);
  assert.equal(snapshot.validation.pendingProviderOnly.some((row) => row.playerName === "Not In Owner List" && row.manualValueState === "PENDING" && row.marketValueEur === null && row.applicationEligible === false), true);
  assert.equal(snapshot.validation.ownerOnlyReview.some((row) => row.playerName === "Known Player" && row.reconciliationState === "OWNER_ONLY_REVIEW_PENDING"), true);
  assert.equal(snapshot.validation.counts.exactNameMatches, 0);
});

test("projection rejects a missing provider ID without inventing a player", () => {
  const projected = projectSportmonksSquadMember({ player: { display_name: "No ID" } }, SPORTMONKS_TWENTY_CLUB_SCOPE[0]);
  assert.deepEqual(projected, { error: { code: "INVALID_PROVIDER_PLAYER_ID" } });
});

test("direct reader has no TouchLine database, sync or mutation integration", async () => {
  const source = await readFile(new URL("../scripts/export-sportmonks-twenty-club-rosters-readonly.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    "@supabase",
    "createClient",
    "createFootballDataProvider",
    "syncSportmonks",
    ".from(",
    ".insert(",
    ".delete(",
    ".upsert(",
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden direct-reader dependency: ${forbidden}`);
  }
});
