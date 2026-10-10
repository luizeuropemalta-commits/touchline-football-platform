import assert from "node:assert/strict";
import test from "node:test";
import { readGameweekMatchCardIndicators } from "../lib/touchlineArena/match-card-feed-reader.ts";

const playerId = "10000000-0000-4000-8000-000000000001";
const card = { id: playerId, canonicalPlayerId: playerId, providerPlayerId: "42" };
const event = { id: "sportmonks:8", providerId: "8", provider: "sportmonks", fixtureId: "100", playerId: "42", type: "Yellowcard", status: "recorded" };

function database(input: { fixtures?: unknown[]; feeds?: unknown[]; fail?: string; round?: string } = {}) {
  const calls: Array<{ table: string; columns?: string; filters: Array<[string, unknown]> }> = [];
  const admin = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const call = { table, columns: "", filters };
      calls.push(call);
      const query = {
        select: (columns: string) => { call.columns = columns; return query; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        in: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: () => query,
        then(resolve: (result: { data: unknown; error: unknown }) => unknown) {
          const data = table === "touchline_fantasy_gameweeks"
            ? { id: "week", season_id: "season", round_id: input.round ?? "round" }
            : table === "football_fixtures"
              ? (input.fixtures ?? [{ id: "fixture", provider: "sportmonks", season_id: "season", round_id: "round", provider_fixture_id: "100" }])
              : (input.feeds ?? []);
          return Promise.resolve({ data, error: table === input.fail ? { message: "failed" } : null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { admin, calls };
}

test("current round without a persisted feed draws no card and never asks for another round", async () => {
  const { admin, calls } = database();
  assert.deepEqual(await readGameweekMatchCardIndicators(admin, "season", "week", [playerId], [card]), []);
  assert.deepEqual(calls.map((call) => call.table), ["touchline_fantasy_gameweeks", "football_fixtures", "football_fantasy_fixture_feeds"]);
  assert.deepEqual(calls[1]?.filters, [["provider", "sportmonks"], ["season_id", "season"], ["round_id", "round"]]);
  assert.ok(calls[1]?.columns?.split(",").includes("provider"));
  assert.deepEqual(calls[2]?.filters, [["provider", "sportmonks"], ["provider_fixture_id", ["100"]]]);
});

test("a colliding or missing fixture provider cannot authorize a Sportmonks feed", async () => {
  const fixture = { id: "fixture", season_id: "season", round_id: "round", provider_fixture_id: "100" };
  const feeds = [{ provider: "sportmonks", provider_fixture_id: "100", events_payload: [event] }];
  for (const provider of ["api-football", undefined, null, ""]) {
    const { admin, calls } = database({ fixtures: [{ ...fixture, provider }], feeds });
    assert.deepEqual(await readGameweekMatchCardIndicators(admin, "season", "week", [playerId], [card]), []);
    assert.equal(calls.some(call => call.table === "football_fantasy_fixture_feeds"), false);
  }
  const { admin } = database({ fixtures: [{ ...fixture, provider: "api-football" }, { ...fixture, provider: "sportmonks" }], feeds });
  assert.deepEqual(await readGameweekMatchCardIndicators(admin, "season", "week", [playerId], [card]), [{ fixtureId: "100", playerId, kind: "yellow", eventId: "8" }]);
});

test("only exact current fixture and canonical player can receive a normal card", async () => {
  const { admin } = database({ feeds: [
    { provider: "sportmonks", provider_fixture_id: "100", events_payload: [event, { ...event, providerId: "9", playerId: "43", type: "Redcard" }] },
  ] });
  assert.deepEqual(await readGameweekMatchCardIndicators(admin, "season", "week", [playerId], [card]), [
    { fixtureId: "100", playerId, kind: "yellow", eventId: "8" },
  ]);
});

test("wrong round, failed query, duplicated feed and absent canonical binding fail closed", async () => {
  const mismatched = database({ round: "other", feeds: [{ provider: "sportmonks", provider_fixture_id: "100", events_payload: [event] }] });
  assert.deepEqual(await readGameweekMatchCardIndicators(mismatched.admin, "season", "week", [playerId], [card]), []);
  const failed = database({ fail: "football_fantasy_fixture_feeds" });
  assert.equal(await readGameweekMatchCardIndicators(failed.admin, "season", "week", [playerId], [card]), null);
  const duplicate = database({ feeds: [
    { provider: "sportmonks", provider_fixture_id: "100", events_payload: [event] },
    { provider: "sportmonks", provider_fixture_id: "100", events_payload: [event] },
  ] });
  assert.deepEqual(await readGameweekMatchCardIndicators(duplicate.admin, "season", "week", [playerId], [card]), []);
  const unbound = database({ feeds: [{ provider: "sportmonks", provider_fixture_id: "100", events_payload: [event] }] });
  assert.deepEqual(await readGameweekMatchCardIndicators(unbound.admin, "season", "week", [playerId], [{ ...card, providerPlayerId: null }]), []);
});
