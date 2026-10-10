import assert from "node:assert/strict";
import test from "node:test";
import { SPORTMONKS_PREQUERY_ENDPOINTS, sportmonksPrequeryEndpoint } from "../lib/football-data/sportmonks-quota-observation.ts";

const examples = {
  fixture: "/fixtures/1", date: "/fixtures/date/2026-10-10",
  between: "/fixtures/between/2026-10-10/2026-10-11",
  inplay: "/livescores/inplay", latest: "/livescores/latest",
  league: "/leagues/8", season: "/seasons/1", stages: "/stages/seasons/1",
  topscorers: "/topscorers/seasons/1", squad: "/squads/teams/19",
  squadExtended: "/squads/teams/19/extended", player: "/players/1",
  playerSearch: "/players/search/Jo%C3%A3o%20Silva", team: "/teams/19", coach: "/coaches/1",
  standings: "/standings/seasons/1", playerTransfers: "/transfers/players/1",
  teamTransfers: "/transfers/teams/19", seasons: "/seasons",
  leagueSeasons: "/seasons/leagues/8", leagues: "/leagues",
  resources: "/my/resources", enrichments: "/my/enrichments",
} satisfies Record<keyof typeof SPORTMONKS_PREQUERY_ENDPOINTS, string>;

test("every closed authority endpoint has a real adapter path", () => {
  assert.deepEqual(Object.keys(examples).sort(), Object.keys(SPORTMONKS_PREQUERY_ENDPOINTS).sort());
  for (const [endpoint, path] of Object.entries(examples)) assert.equal(sportmonksPrequeryEndpoint(path), endpoint, path);
});
test("entity pools remain shared, not split by endpoint name", () => {
  for (const endpoint of ["fixture", "date", "between", "inplay", "latest"] as const)
    assert.equal(SPORTMONKS_PREQUERY_ENDPOINTS[endpoint].entity, "Fixture");
  for (const endpoint of ["player", "playerSearch", "squadExtended"] as const)
    assert.equal(SPORTMONKS_PREQUERY_ENDPOINTS[endpoint].entity, "Player");
  assert.equal(SPORTMONKS_PREQUERY_ENDPOINTS.squad.entity, "PlayerTeam");
  assert.equal(SPORTMONKS_PREQUERY_ENDPOINTS.playerTransfers.entity, SPORTMONKS_PREQUERY_ENDPOINTS.teamTransfers.entity);
  assert.equal(SPORTMONKS_PREQUERY_ENDPOINTS.resources.entity, "Resource");
  assert.equal(SPORTMONKS_PREQUERY_ENDPOINTS.enrichments.entity, "Enrichment");
});
test("paths cannot contain origin, query, hash, traversal, noncanonical IDs or extra suffixes", () => {
  for (const path of Object.values(examples)) {
    for (const bad of [`https://api.sportmonks.com${path}`, `${path}/`, `${path}?api_token=x`, `${path}#x`, `/${path}`,
      `${path}\n`, `${path}\r`, `${path}\u2028`, `${path}\t`, `${path} `])
      assert.equal(sportmonksPrequeryEndpoint(bad), null, bad);
  }
  for (const path of ["/teams/0", "/teams/01", "/teams/-1", "/teams/1.0", "/teams/1e3", "/teams/%31",
    "/teams/123456789012345678901", "/teams/1/../2", "/my/unknown", "/players", "/coaches/search/Name",
    "/fixtures/date/2026-02-30", "/fixtures/between/2026-10-11/2026-10-10"])
    assert.equal(sportmonksPrequeryEndpoint(path), null, path);
});
test("search accepts canonical Unicode names but never encoded path injection", () => {
  for (const name of ["محمد", "João Félix", "O'Connor", "Son Heung-min", "A.B"])
    assert.equal(sportmonksPrequeryEndpoint(`/players/search/${encodeURIComponent(name)}`), "playerSearch");
  for (const term of ["", "%20", ".", "..", "%2E%2E", "%2F", "%5C", "%252F", "%00", "%0A", "%7F", "%", "%FF", "a?b", "a#b", "a/b"])
    assert.equal(sportmonksPrequeryEndpoint(`/players/search/${term}`), null, term);
});
