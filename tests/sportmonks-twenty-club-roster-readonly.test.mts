import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'server-only' ? new URL('./fixtures/server-only.mts', import.meta.url).href : specifier, context);
} });

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
  central: { enabled: true, url: 'https://authority.invalid/api/internal/football-data/quota', workerToken: 'q'.repeat(40), accountScope: 'shared' },
};
const centralEnvironment = { TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED: 'true', TOUCHLINE_SPORTMONKS_CENTRAL_URL: testConfig.central.url,
  TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN: testConfig.central.workerToken, TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE: 'shared' };
function centralResponse(init?: RequestInit) {
  const { operation } = JSON.parse(String(init?.body));
  return json(operation === 'admit' ? { allowed: true, token: '12345678-1234-4234-8234-123456789abc' } : { persisted: true });
}

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
    ...centralEnvironment,
    TOUCHLINE_SPORTMONKS_ROSTER_READ_MODE: "read-only",
    SPORTMONKS_API_TOKEN: "test",
  });
  assert.equal(config.apiBaseUrl, testConfig.apiBaseUrl);
  assert.equal(config.token, "test");
});

test("team read follows pages and projects no raw provider payload or request URL", async () => {
  const requestedPages: string[] = [];
  const events: string[] = [];
  const scope = SPORTMONKS_TWENTY_CLUB_SCOPE[0];
  const roster = await readSportmonksTeamRoster({
    scope,
    config: testConfig,
    now: () => "2026-08-09T00:00:00.000Z",
    fetchImpl: (async (input, init) => {
      const url = new URL(String(input));
      if (url.href === testConfig.central.url) {
        const { operation, args } = JSON.parse(String(init?.body));
        events.push(operation);
        if (operation === 'complete') {
          assert.equal(args.p_observation.requestedEntity, 'PlayerTeam');
          assert.equal(args.p_observation.remaining, 1500);
          assert.ok(args.p_observation.resetAt);
        }
        return centralResponse(init);
      }
      events.push('provider');
      requestedPages.push(url.searchParams.get("page") ?? "");
      if (url.searchParams.get("page") === "1") return json({
        data: [{ player: { id: 101, display_name: "First Player" }, jersey_number: 1, position: { name: "Goalkeeper" } }],
        pagination: { current_page: 1, has_more: true },
        rate_limit: { requested_entity: 'PlayerTeam', remaining: 1500, resets_in_seconds: 120 },
      });
      return json({
        data: [{ player: { id: 102, display_name: "Second Player" }, jersey_number: 2, detailedPosition: { name: "Centre Back" } }],
        pagination: { current_page: 2, has_more: false },
        rate_limit: { requested_entity: 'PlayerTeam', remaining: 1500, resets_in_seconds: 120 },
      });
    }) as typeof fetch,
  });
  assert.deepEqual(requestedPages, ["1", "2"]);
  assert.deepEqual(events, ['admit', 'provider', 'complete', 'admit', 'provider', 'complete']);
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
    fetchImpl: (async (input, init) => String(input) === testConfig.central.url ? centralResponse(init) : json({
      data: [{ player: { id: "not-numeric", display_name: "Broken" } }],
      pagination: { current_page: 9, has_more: true },
    })) as typeof fetch,
  });
  assert.equal(roster.state, "partial");
  assert.deepEqual(roster.errors.map((error) => error.code), ["INVALID_PROVIDER_PLAYER_ID", "PAGINATION_METADATA_INVALID", "SPORTMONKS_SQUAD_EMPTY"]);
});

test('central OFF, denial and completion failure prevent unsafe page reads', async () => {
  assert.throws(() => readSportmonksRosterReadConfig({ TOUCHLINE_SPORTMONKS_ROSTER_READ_MODE: 'read-only', SPORTMONKS_API_TOKEN: 'test' }), /CENTRAL_REQUIRED/);
  for (const mode of ['off', 'deny', 'receipt-failed', '429']) {
    const events: string[] = [];
    const roster = await readSportmonksTeamRoster({ scope: SPORTMONKS_TWENTY_CLUB_SCOPE[0],
      config: mode === 'off' ? { ...testConfig, central: { ...testConfig.central, enabled: false } } : testConfig,
      fetchImpl: (async (input, init) => {
        if (String(input) === testConfig.central.url) {
          assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${testConfig.central.workerToken}`);
          const { operation, args } = JSON.parse(String(init?.body)); events.push(operation);
          assert.equal(args.p_account_scope, 'shared'); assert.equal(args.p_endpoint, 'squad');
          assert.equal(args.p_attempt, 1);
          if (operation === 'admit' && mode === 'deny') return json({ allowed: false });
          if (operation === 'complete') {
            assert.equal(args.p_observation.status, mode === '429' ? 429 : 200);
            if (mode === 'receipt-failed') return json({ persisted: false });
          }
          return centralResponse(init);
        }
        events.push('provider');
        assert.ok(!String(input).includes(testConfig.central.workerToken));
        assert.equal(init?.redirect, 'error'); assert.equal('fetchImpl' in (init ?? {}), false);
        return json({ data: [{ player: { id: 101, name: 'Synthetic' } }], pagination: { current_page: 1, has_more: true },
          rate_limit: { requested_entity: 'PlayerTeam', remaining: mode === '429' ? 0 : 1500, resets_in_seconds: 120 } }, mode === '429' ? 429 : 200);
      }) as typeof fetch,
    });
    assert.equal(roster.state, 'partial'); assert.equal(roster.members.length, 0);
    assert.deepEqual(events, mode === 'off' ? [] : mode === 'deny' ? ['admit'] : ['admit', 'provider', 'complete']);
    assert.ok(!JSON.stringify(roster).includes(testConfig.token));
  }
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
