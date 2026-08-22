import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/qa/011_touchline_qa_sportmonks_fixture_rounds.sql", import.meta.url),
  "utf8",
);
const store = readFileSync(new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url), "utf8");
const matchCentre = readFileSync(
  new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
  "utf8",
);
const tablesPage = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
const tablesClient = readFileSync(
  new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url),
  "utf8",
);

test("QA round migration is additive, guarded, private and reversible", () => {
  assert.match(migration, /TouchLine Development QA only/);
  assert.match(migration, /xgxbwqxjssxxuihuwmgy/);
  assert.match(migration, /create table if not exists public\.football_rounds/);
  assert.match(migration, /add column if not exists round_id uuid/);
  assert.match(migration, /foreign key \(round_id\) references public\.football_rounds\(id\)/);
  assert.match(migration, /alter table public\.football_rounds force row level security/);
  assert.match(migration, /revoke all privileges on table public\.football_rounds from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.football_rounds to service_role/);
  assert.match(migration, /touchline_capture_qa_fixture_round_backup/);
  assert.match(migration, /touchline_rollback_qa_fixture_round_sync/);
  assert.match(migration, /set search_path = ''/);
});

test("fixture persistence links one provider round to competition, season and fixture", () => {
  const roundUpsert = store.indexOf('.from("football_rounds").upsert');
  const fixtureUpsert = store.indexOf('.from("football_fixtures").upsert');
  assert.ok(roundUpsert >= 0);
  assert.ok(fixtureUpsert > roundUpsert);
  assert.match(store, /provider_round_id: roundProviderId/);
  assert.match(store, /competition_id: persistedCompetition\.id/);
  assert.match(store, /season_id: seasonId/);
  assert.match(store, /round_id: fixture\.roundId \? roundsByProviderId\.get\(fixture\.roundId\) \?\? null : null/);
  assert.match(store, /roundName: asString\(round\?\.name\) \?\? undefined/);
});

test("Live and Tables render the same provider-backed round with a safe pending state", () => {
  assert.match(matchCentre, /selected\.roundName \? `\$\{dictionary\.matchweek\} · \$\{selected\.roundName\}` : dictionary\.roundPending/);
  assert.doesNotMatch(matchCentre, /dictionary\.matchweek\} · \{selected\.seasonId/);
  assert.match(tablesPage, /selectArenaFixtureRound\(publicFixtures\)/);
  assert.match(tablesPage, /fixture\.roundName\?\.trim\(\)/);
  assert.match(tablesClient, /currentProviderRoundName/);
  assert.match(tablesClient, /Matchweek awaiting provider/);
  assert.doesNotMatch(`${matchCentre}\n${tablesPage}\n${tablesClient}`, /Matchweek 1|Rodada 1/);
});
