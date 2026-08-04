import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TouchlineFixture } from "../lib/football-data/types.ts";
import { selectArenaFixtureRound } from "../lib/touchlineArena/arena-fixture-round.ts";

function fixture(index: number, startsAt: string, status = "Not Started"): TouchlineFixture {
  const homeId = String(index * 2 + 1);
  const awayId = String(index * 2 + 2);
  return {
    id: `sportmonks:${index}`,
    provider: "sportmonks",
    providerId: String(index),
    startsAt,
    status,
    homeTeam: { id: `sportmonks:${homeId}`, provider: "sportmonks", providerId: homeId, name: `Home ${index}`, source: { provider: "sportmonks", providerId: homeId } },
    awayTeam: { id: `sportmonks:${awayId}`, provider: "sportmonks", providerId: awayId, name: `Away ${index}`, source: { provider: "sportmonks", providerId: awayId } },
    source: { provider: "sportmonks", providerId: String(index) },
  };
}

test("Arena carousel selects one coherent ten-match canonical round instead of mixing weeks", () => {
  const firstRound = Array.from({ length: 10 }, (_, index) => fixture(index + 1, `2026-08-${String(21 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  const nextRound = Array.from({ length: 10 }, (_, index) => fixture(index + 11, `2026-08-${String(28 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  // A second round necessarily repeats every England club; use the same IDs
  // so a selector cannot silently append a second matchweek.
  nextRound.forEach((item, index) => {
    const homeId = String(index * 2 + 1);
    const awayId = String(index * 2 + 2);
    item.homeTeam = { ...item.homeTeam!, id: `sportmonks:${homeId}`, providerId: homeId };
    item.awayTeam = { ...item.awayTeam!, id: `sportmonks:${awayId}`, providerId: awayId };
  });

  const selected = selectArenaFixtureRound([...firstRound, ...nextRound], Date.parse("2026-08-03T12:00:00Z"));
  assert.equal(selected.length, 10);
  assert.deepEqual(selected.map((item) => item.id), firstRound.map((item) => item.id));
});

test("a live fixture keeps its complete round visible even when it is not the first kickoff", () => {
  const fixtures = Array.from({ length: 10 }, (_, index) => fixture(index + 1, `2026-08-21T${String(12 + index).padStart(2, "0")}:00:00Z`));
  fixtures[5] = { ...fixtures[5], status: "LIVE" };

  const selected = selectArenaFixtureRound(fixtures, Date.parse("2026-08-21T18:00:00Z"));
  assert.equal(selected.length, 10);
  assert.ok(selected.some((item) => item.status === "LIVE"));
});

test("Arena keeps an incomplete canonical round intact instead of borrowing a match from the next round", () => {
  const firstRound = Array.from({ length: 9 }, (_, index) => fixture(index + 1, `2026-08-${String(21 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  const nextRound = Array.from({ length: 10 }, (_, index) => fixture(index + 10, `2026-08-${String(28 + Math.floor(index / 4)).padStart(2, "0")}T${String(12 + index).padStart(2, "0")}:00:00Z`));
  // The delayed first-round fixture is not in this source window. Reusing one
  // of its clubs in the next matchweek proves that the carousel must not join
  // the two canonical rounds merely to display ten tiles.
  nextRound[0].homeTeam = { ...nextRound[0].homeTeam!, id: "sportmonks:1", providerId: "1" };
  nextRound[0].awayTeam = { ...nextRound[0].awayTeam!, id: "sportmonks:20", providerId: "20" };

  const selected = selectArenaFixtureRound([...firstRound, ...nextRound], Date.parse("2026-08-03T12:00:00Z"));
  assert.deepEqual(selected.map((item) => item.id), firstRound.map((item) => item.id));
  assert.equal(selected.length, 9);
});

test("Arena keeps production coach identity out of the demo fallback and exposes persistent coach-first selection", () => {
  const arena = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const coachRoute = readFileSync(new URL("../app/api/touchline-arena/coach/route.ts", import.meta.url), "utf8");
  const stateRoute = readFileSync(new URL("../app/api/touchline-arena/state/route.ts", import.meta.url), "utf8");

  assert.match(arena, /arenaPersistencePrincipal\?\.kind === "demo"[\s\S]*?TOUCHLINE_DEMO_COACH/);
  assert.match(arena, /data-testid="arena-coach-first-gate"/);
  assert.match(arena, /const isCoachSelectionRequired = Boolean\([\s\S]*?standaloneExperience !== "live"/);
  assert.match(arena, /const shouldRenderArenaOwnerLayer = shouldRenderPlayers && standaloneExperience !== "live" && !isCoachSelectionRequired/);
  assert.match(arena, /is-market-standalone \.arena-functional-layer > :not\(\.arena-action-layer\):not\(\.arena-coach-first-gate\)/);
  assert.match(arena, /\/api\/touchline-arena\/coach/);
  assert.match(arena, /const requestTimeout = window\.setTimeout\(\(\) => controller\.abort\(\), 10_000\)/);
  assert.match(arena, /signal: controller\.signal/);
  assert.match(arena, /window\.clearTimeout\(requestTimeout\)/);
  assert.match(arena, /coachOfferStatus === "idle"[\s\S]*?Entre na sua conta para carregar as ofertas oficiais dos treinadores/);
  assert.match(arena, /const mustPersistForClubOwner = canPersistArenaAccountState/);
  assert.match(arena, /if \(!response\.ok\) \{[\s\S]*?Não foi possível salvar o treinador na sua conta/);
  assert.match(arena, /setCoachSelectionError\(message\)/);
  assert.match(arena, /className="arena-coach-selection-error" role="alert"/);
  const selectCoach = arena.slice(
    arena.indexOf("async function selectOfficialArenaCoach"),
    arena.indexOf("async function toggleArenaFullscreen"),
  );
  assert.ok(
    selectCoach.indexOf("const mustPersistForClubOwner") < selectCoach.indexOf('writeBrowserStorage("localStorage", coachStorageKey'),
    "authenticated ClubOwner coach selection must be accepted by the server before local cache is written",
  );
  assert.match(arena, /coachOffersByProviderId/);
  assert.match(arena, /offer\.displayPrice/);
  assert.match(arena, /selectArenaFixtureRound\(premierLiveFixtures\)/);
  assert.match(arena, /function isFixtureFinished\(fixture: TouchlineFixture\)/);
  assert.match(arena, /isFixtureFinished\(fixture\)[\s\S]*?\? "FT"/);
  assert.match(arena, /Every Arena paint reads the already-canonical schedule/);
  const fixtureEffect = arena.slice(
    arena.indexOf("Every Arena paint reads the already-canonical schedule"),
    arena.indexOf("Do not request a provisional fallback squad"),
  );
  assert.doesNotMatch(fixtureEffect, /if \(!isLiveDockOpen && standalonePanel !== "live"\) return;/);
  assert.match(fixtureEffect, /"\/api\/football-data\/fixture-schedule"/);
  assert.match(fixtureEffect, /function applyLiveFixtureUpdates[\s\S]*?must never replace[\s\S]*?current\.map/);
  assert.match(coachRoute, /touchlineLiveCoachForProviderId\(coachProviderId\)/);
  assert.match(coachRoute, /TL_ARENA_COACH_SCHEMA_UNAVAILABLE/);
  assert.match(stateRoute, /coach_provider_id/);
  assert.match(stateRoute, /error\?\.code === "42703"/);
});

test("the intro action remains an explicit top-right control", () => {
  const arena = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  assert.match(arena, /className="arena-intro-actions"/);
  assert.match(arena, /Watch intro/);
  assert.match(arena, /\.arena-intro-actions \{[\s\S]*?right: max\(18px, env\(safe-area-inset-right\)\)/);
});
