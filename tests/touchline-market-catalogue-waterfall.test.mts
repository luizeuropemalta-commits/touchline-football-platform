import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";

const playerId = "00000000-0000-4000-8000-000000000001";
const presentation = { tierKey: "elite", marketValueEur: 1000000, shirtNumber: 1 };
const golden = [{
  id: playerId, canonicalPlayerId: playerId, name: "Test keeper", shortName: "Test keeper",
  role: "goalkeeper", position: "Goalkeeper", clubName: "Manchester City", shirtNumber: 1,
  countryCode3: "ITA", marketValue: "€1M", marketValueSource: "verified-cache",
  marketValueState: "verified", classificationState: "verified", cardTier: "elite",
  editorialCard: presentation, touchlinePoints: 0, seasonTouchlinePoints: null,
  seasonTotalRating: null, matchRating: null,
}];
const code = (path: string) => stripTypeScriptTypes(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function scenario(failure?: string, empty = false) {
  const gates = Object.fromEntries(["players", "memberships", "presentations", "points"].map(key => [key, deferred()]));
  const reads: string[] = [];
  const failureError = new Error("controlled reader failure");
  const tables: Record<string, Array<Record<string, unknown>>> = {
    touchline_card_publications: empty ? [] : [{ player_id: playerId, publication_status: "published" }],
    football_players: [{ id: playerId, display_name: "Test keeper", current_club_id: "club", position: "Goalkeeper" }],
    football_squad_members: [{ id: "membership", player_id: playerId, club_id: "club", status: "active", position: "Goalkeeper", jersey_number: 1 }],
    football_clubs: [{ id: "club", name: "Manchester City" }],
  };
  const admin = { from(table: string) {
    assert.ok(table in tables, `unexpected table ${table}`);
    let data = tables[table];
    let start = 0; let end = Infinity;
    const query = {
      select() { return query; }, order() { return query; },
      eq(key: string, value: unknown) { data = data.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { data = data.filter(row => values.includes(row[key])); return query; },
      range(from: number, to: number) { start = from; end = to; return query; },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        reads.push(table);
        const gate = table === "football_players" ? gates.players : table === "football_squad_members" ? gates.memberships : null;
        return (gate?.promise ?? Promise.resolve()).then(() => {
          if (failure === table) throw failureError;
          return { data: data.slice(start, end + 1), count: data.length, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  const context = {
    applyTouchlineSeasonPoints,
    loadTouchlinePublishedCardPresentations: async () => {
      reads.push("presentations"); await gates.presentations.promise;
      if (failure === "presentations") throw failureError;
      return new Map([[playerId, presentation]]);
    },
    readPublicSeasonPlayerPoints: async () => {
      reads.push("points"); await gates.points.promise;
      if (failure === "points") throw failureError;
      return [];
    },
    inferArenaRole: () => "goalkeeper", makeArenaShortName: (value: string) => value,
    normalizeOfficialShirtNumber: (value: unknown) => value,
    touchlineCountryCode3FromName: () => "ITA", normalizeTouchlineCountryCode3: () => "ITA",
    hasTouchlineCountryFlag: () => true, formatTouchlineMarketValueEur: () => "€1M",
    fetch: () => assert.fail("network forbidden"),
  };
  Object.assign(context, runInNewContext(`${code("lib/touchlineArena/complete-catalogue-read-server.ts")}\n({ createCompleteTouchlineCatalogueAdmin, loadCompleteTouchlineCataloguePresentations });`, context));
  const load = runInNewContext(`${code("lib/touchlineFantasy/server.ts")}\nloadCatalogue;`, context) as (admin: unknown) => Promise<unknown>;
  return { run: () => load(admin), gates, reads, failureError, release: () => Object.values(gates).forEach(gate => gate.resolve()) };
}

test("Market reads clubs when players resolve while publication enrichment, points and memberships are pending", async () => {
  const fixture = scenario();
  let completed = false;
  const result = fixture.run().then(value => { completed = true; return value; });
  try {
    await setImmediate();
    assert.ok(fixture.reads.includes("football_players"));
    assert.ok(fixture.reads.includes("presentations"));
    assert.ok(fixture.reads.includes("points"));
    assert.ok(fixture.reads.includes("football_squad_members"));
    assert.ok(!fixture.reads.includes("football_clubs"), "clubs must wait for player club IDs");
    fixture.gates.players.resolve();
    await setImmediate();
    assert.ok(fixture.reads.includes("football_clubs"), "clubs must not wait for unrelated catalogue readers");
    assert.equal(completed, false, "the complete catalogue still requires every enrichment");
  } finally {
    fixture.release();
    assert.deepEqual(JSON.parse(JSON.stringify(await result)), golden);
  }
});

test("Market catalogue output preserves the baseline card projection", async () => {
  const fixture = scenario(); fixture.release();
  assert.deepEqual(JSON.parse(JSON.stringify(await fixture.run())), golden);
});

test("an empty publication list starts no catalogue enrichment", async () => {
  const fixture = scenario(undefined, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await fixture.run())), []);
  assert.deepEqual(fixture.reads, ["touchline_card_publications"]);
});

for (const failure of ["touchline_card_publications", "football_players", "football_clubs", "football_squad_members", "presentations", "points"]) {
  test(`Market catalogue preserves rejection from ${failure}`, async () => {
    const fixture = scenario(failure); fixture.release();
    await assert.rejects(fixture.run(), error => {
      if (failure === "presentations" || failure === "points") assert.equal(error, fixture.failureError);
      else assert.equal((error as Error).message, `TL_CATALOGUE_READ_FAILED:${failure}`);
      return true;
    });
  });
}
