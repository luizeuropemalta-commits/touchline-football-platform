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

test("a stale live status on a future kickoff cannot hide the upcoming Arena confrontations", () => {
  const futureStatus = fixture(1, "2026-08-20T20:00:00Z", "2nd Half");
  const upcoming = fixture(2, "2026-08-20T18:00:00Z");

  const selected = selectArenaFixtureRound(
    [futureStatus, upcoming],
    Date.parse("2026-08-16T12:00:00Z"),
  );

  assert.deepEqual(selected.map((item) => item.id), [upcoming.id, futureStatus.id]);
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

test("Market Transfer keeps production coach identity out of the demo fallback and owns persistent coach-first selection", () => {
  const arena = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const coachRoute = readFileSync(new URL("../app/api/touchline-arena/coach/route.ts", import.meta.url), "utf8");
  const stateRoute = readFileSync(new URL("../app/api/touchline-arena/state/route.ts", import.meta.url), "utf8");

  assert.match(arena, /arenaPersistencePrincipal\?\.kind === "demo"[\s\S]*?TOUCHLINE_DEMO_COACH/);
  assert.match(arena, /data-testid="arena-coach-first-gate"/);
  assert.match(arena, /const isCoachSelectionRequired = Boolean\([\s\S]*?standaloneExperience === "market"/);
  assert.match(
    arena,
    /const shouldRenderArenaOwnerLayer = \(shouldRenderPlayers \|\| isQuickSubstitutionSessionActive\)\s*&& standaloneExperience !== "live"\s*&& !isCoachSelectionRequired/,
  );
  assert.match(arena, /setIsArenaMatchdayViewActive\(showPlayers\)/);
  assert.match(
    arena,
    /setPlayers\(normalizeArenaPlayersForFormation\(lineupPlayers[\s\S]*?setIsArenaMatchdayViewActive\(true\)[\s\S]*?setShouldRenderPlayers\(true\)/,
  );
  assert.match(arena, /\.catch\(\(error: Error\) => \{[\s\S]*?setIsArenaMatchdayViewActive\(false\)/);
  assert.match(
    arena,
    /className="arena-coach-gated-content"[\s\S]*?inert=\{isCoachSelectionRequired \|\| isCoachSelectionBootstrapPending \? true : undefined\}[\s\S]*?aria-hidden=\{isCoachSelectionRequired \|\| isCoachSelectionBootstrapPending\}/,
  );
  assert.match(arena, /is-market-standalone \.arena-coach-gated-content > :not\(\.arena-action-layer\)/);
  assert.match(arena, /is-panel-standalone \.arena-coach-first-gate \{\s*inset: 10px;/);
  assert.match(arena, /\/api\/touchline-arena\/coach/);
  assert.match(arena, /const requestTimeout = window\.setTimeout\(\(\) => controller\.abort\(\), 10_000\)/);
  assert.match(arena, /signal: controller\.signal/);
  assert.match(arena, /window\.clearTimeout\(requestTimeout\)/);
  assert.match(arena, /coachOfferStatus === "idle"[\s\S]*?Entre na sua conta para carregar as ofertas oficiais dos treinadores/);
  assert.match(arena, /const coachFirstLoginHref = touchLineAuthEntryHref\([\s\S]*?"\/login"[\s\S]*?\/market-transfer\?lang=/);
  assert.match(arena, /className="arena-coach-login-link" href=\{coachFirstLoginHref\}/);
  assert.match(arena, /TOUCHLINE MARKET · PASSO 1 DE 10/);
  assert.match(arena, /<TouchlineSquadBuilderStage/);
  assert.match(arena, /data-testid="arena-coach-bootstrap"/);
  assert.match(arena, /params\.get\("onboarding"\) !== "market"/);
  assert.match(arena, /window\.location\.replace\(`\/market-transfer\?lang=\$\{encodeURIComponent\(siteLanguage\)\}`\)/);
  assert.match(arena, /\}, 6_500\);/);
  assert.match(arena, /className="arena-market-welcome"/);
  assert.match(arena, /arena-market-welcome-title/);
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
  assert.match(selectCoach, /standaloneExperience === "market"[\s\S]*?setMarketFormationConfirmed\(false\)/);
  assert.match(selectCoach, /confirmMarketFormation[\s\S]*?reconcileTouchlineFormationStarters/);
  assert.match(selectCoach, /confirmMarketFormation[\s\S]*?setMarketPositionBucketFilter\("all"\)/);
  assert.match(arena, /coachOffersByProviderId/);
  assert.match(arena, /offer\.displayPrice/);
  assert.match(arena, /className="arena-coach-market-header"/);
  assert.match(arena, /data-tier=\{offer\.tierKey\}/);
  assert.match(arena, /"--coach-offer-accent": tierPalette\.accent/);
  assert.match(arena, /"--coach-offer-secondary": tierPalette\.secondary/);
  assert.match(arena, /arena-coach-choice-topline/);
  assert.match(arena, /arena-coach-choice-footer/);
  assert.match(arena, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 176px\), 1fr\)\)/);
  assert.match(arena, /selectArenaFixtureRound\(premierLiveFixtures\)/);
  assert.match(arena, /function isFixtureFinished\(fixture: TouchlinePublicFixture\)/);
  assert.match(arena, /isFixtureFinished\(fixture\)[\s\S]*?\? "FT"/);
  assert.match(arena, /const shouldPollPersistedLiveSnapshot = isLiveDockOpen \|\| standalonePanel === "live"/);
  const fixtureEffect = arena.slice(
    arena.indexOf("const shouldPollPersistedLiveSnapshot = isLiveDockOpen || standalonePanel === \"live\""),
    arena.indexOf("Do not request a provisional fallback squad"),
  );
  assert.doesNotMatch(fixtureEffect, /if \(!isLiveDockOpen && standalonePanel !== "live"\) return;/);
  assert.match(fixtureEffect, /"\/api\/football-data\/fixture-schedule"/);
  assert.match(
    fixtureEffect,
    /function applyPersistedLiveSnapshot[\s\S]*?one durable server snapshot[\s\S]*?server-side rather than recomputed[\s\S]*?setLiveFixtures\(parsedFixtures\)/,
  );
  assert.doesNotMatch(fixtureEffect, /function applyLiveFixtureUpdates/);
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
