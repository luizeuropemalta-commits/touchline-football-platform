import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Arena has no fabricated fixture fallback and consumes the canonical snapshot", async () => {
  const arena = await readFile(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const liveRoute = await readFile(new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(arena, /FALLBACK_LIVE_FIXTURES|premier-touchline-arsenal-coventry|Demo live/);
  assert.match(liveRoute, /readPublicCompetitionFixtures/);
  assert.match(liveRoute, /mergeCanonicalFixtures/);
});

test("fixture schedule migration is normalized and server-only", async () => {
  const migration = await readFile(new URL("../supabase/migrations/046_touchline_canonical_fixture_read_model.sql", import.meta.url), "utf8");

  assert.match(migration, /create table if not exists public\.football_fixtures/);
  assert.match(migration, /unique \(provider, provider_fixture_id\)/);
  assert.match(migration, /competition_id uuid references public\.football_competitions/);
  assert.match(migration, /revoke all privileges on table public\.football_fixtures from public, anon, authenticated/);
  assert.match(migration, /fixture_schedule/);
});

test("Sportmonks fixture mapping prefers its UTC timestamp over an ambiguous local date", async () => {
  const provider = await readFile(new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url), "utf8");

  assert.match(provider, /function sportmonksFixtureStartAt/);
  assert.match(provider, /raw\.starting_at_timestamp/);
  assert.match(provider, /startsAt: sportmonksFixtureStartAt\(raw\)/);
});
