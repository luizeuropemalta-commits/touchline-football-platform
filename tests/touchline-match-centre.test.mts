import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineLiveReadMetadata,
  mergeTouchlineLiveFixtures,
  normalizeTouchlineMatchCentreTimeZone,
  selectTouchlineMatchCentreSchedule,
  selectTouchlineMatchCentreFixture,
  touchlineFixtureRailDateLabel,
  touchlineFixtureState,
  touchlineFixtureStatusLabel,
  touchlineMatchCentreDisplayState,
  touchlineMatchCentreHref,
} from "../lib/touchlineArena/match-centre.ts";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

function fixture(id: string, startsAt: string, status: string): TouchlineFixture {
  return {
    id: `sportmonks:${id}`,
    providerId: id,
    provider: "sportmonks",
    startsAt,
    status,
    homeTeam: { id: "sportmonks:1", providerId: "1", provider: "sportmonks", name: "Arsenal", source: { provider: "sportmonks", providerId: "1" } },
    awayTeam: { id: "sportmonks:2", providerId: "2", provider: "sportmonks", name: "Chelsea", source: { provider: "sportmonks", providerId: "2" } },
    source: { provider: "sportmonks", providerId: id },
  };
}

function roundFixture(input: {
  id: number;
  round: number;
  startsAt: string;
  status: string;
}): TouchlinePublicFixture {
  const homeId = String(input.round * 100 + input.id * 2);
  const awayId = String(input.round * 100 + input.id * 2 + 1);
  return {
    id: String(input.round * 1_000 + input.id),
    providerId: String(input.round * 1_000 + input.id),
    startsAt: input.startsAt,
    status: input.status,
    seasonId: "2026-27",
    roundId: `round-${input.round}`,
    roundName: String(input.round),
    homeTeam: { id: homeId, providerId: homeId, name: `Home ${input.round}-${input.id}` },
    awayTeam: { id: awayId, providerId: awayId, name: `Away ${input.round}-${input.id}` },
  };
}

test("Match Centre exposes only ten fixtures from the current provider round and ten previous results", () => {
  const now = Date.parse("2026-08-28T12:00:00Z");
  const previousRound = Array.from({ length: 10 }, (_, index) => roundFixture({
    id: index,
    round: 1,
    startsAt: `2026-08-${String(18 + Math.floor(index / 2)).padStart(2, "0")}T${String(12 + (index % 2) * 3).padStart(2, "0")}:00:00Z`,
    status: "Full Time",
  }));
  const currentRound = Array.from({ length: 10 }, (_, index) => roundFixture({
    id: index,
    round: 2,
    startsAt: `2026-08-${String(29 + Math.floor(index / 5)).padStart(2, "0")}T${String(12 + (index % 5) * 2).padStart(2, "0")}:00:00Z`,
    status: "Not Started",
  }));
  const laterRound = Array.from({ length: 10 }, (_, index) => roundFixture({
    id: index,
    round: 3,
    startsAt: `2026-09-${String(5 + Math.floor(index / 5)).padStart(2, "0")}T${String(12 + (index % 5) * 2).padStart(2, "0")}:00:00Z`,
    status: "Not Started",
  }));

  const schedule = selectTouchlineMatchCentreSchedule(
    [...laterRound, ...previousRound, ...currentRound],
    now,
  );

  assert.equal(schedule.currentFixtures.length, 10);
  assert.equal(schedule.recentResults.length, 10);
  assert.ok(schedule.currentFixtures.every((candidate) => candidate.roundId === "round-2"));
  assert.ok(schedule.recentResults.every((candidate) => candidate.roundId === "round-1"));
  assert.equal(new Set([...schedule.currentFixtures, ...schedule.recentResults].map((candidate) => candidate.id)).size, 20);
});

test("Match Centre keeps all ten matches in the current round after early fixtures finish", () => {
  const now = Date.parse("2026-08-30T12:00:00Z");
  const currentRound = Array.from({ length: 10 }, (_, index) => roundFixture({
    id: index,
    round: 2,
    startsAt: index < 4
      ? `2026-08-29T${String(12 + index * 2).padStart(2, "0")}:00:00Z`
      : `2026-08-30T${String(13 + (index - 4)).padStart(2, "0")}:00:00Z`,
    status: index < 4 ? "Finished" : "Not Started",
  }));

  const schedule = selectTouchlineMatchCentreSchedule(currentRound, now);

  assert.equal(schedule.currentFixtures.length, 10);
  assert.equal(schedule.recentResults.length, 0);
  assert.deepEqual(new Set(schedule.currentFixtures.map((candidate) => candidate.roundId)), new Set(["round-2"]));
});

test("Match Centre always prioritizes live, then upcoming, then finished", () => {
  const liveNow = Date.parse("2026-08-20T15:00:00Z");
  const finished = fixture("10", "2026-08-01T14:00:00Z", "Finished");
  const upcoming = fixture("20", "2026-08-21T14:00:00Z", "Not Started");
  const live = fixture("30", "2026-08-20T14:00:00Z", "2nd Half");
  assert.equal(selectTouchlineMatchCentreFixture([finished, upcoming, live], null, liveNow)?.id, live.id);
  assert.equal(selectTouchlineMatchCentreFixture([finished, upcoming], null, liveNow)?.id, upcoming.id);
  assert.equal(selectTouchlineMatchCentreFixture([finished], null, liveNow)?.id, finished.id);
  assert.equal(touchlineFixtureState(live, liveNow), "live");
  assert.equal(touchlineFixtureState(live, Date.parse("2026-08-19T15:00:00Z")), "upcoming");
});

test("Match Centre preserves an explicit fixture deep link", () => {
  const first = fixture("10", "2026-08-21T14:00:00Z", "Not Started");
  const target = fixture("20", "2026-08-22T14:00:00Z", "Not Started");
  assert.equal(selectTouchlineMatchCentreFixture([first, target], target.id)?.id, target.id);
  assert.equal(touchlineMatchCentreHref(target, "pt-BR"), "/live?fixture=sportmonks%3A20&lang=pt-BR");
});

test("fixture status labels are rendered in the selected locale without changing the provider fact", () => {
  assert.equal(touchlineFixtureStatusLabel("2nd Half", "en-GB"), "2nd Half");
  assert.equal(touchlineFixtureStatusLabel("2nd Half", "pt-BR"), "2º tempo");
  assert.equal(touchlineFixtureStatusLabel("Full Time", "pt-BR"), "Encerrado");
  assert.equal(touchlineFixtureStatusLabel("Provider-specific status", "pt-BR"), "Provider-specific status");
});

test("Club Hub suppresses a pre-match provider status before localizing its presentation", () => {
  const source = readFileSync(
    new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const rawStatus = fixture\.status\?\.trim\(\) \?\? ""/);
  assert.match(source, /rawStatus\.toLowerCase\(\) !== "not started"/);
});

test("Club Hub presents full time instead of a stale live minute or period", () => {
  const source = readFileSync(
    new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /touchlineFixtureState\(fixture\) === "finished"[\s\S]*?touchlineFixtureStatusLabel\(rawStatus, locale\)[\s\S]*?: fixture\.liveMinute !== undefined/);
});

test("Match Centre overlays a live snapshot by provider fixture ID without duplicating the matchweek", () => {
  const renderedFromServer: TouchlinePublicFixture = {
    id: "sportmonks:19722203",
    providerId: "19722203",
    name: "Arsenal vs Coventry City",
    venue: {
      id: "verified-stadium",
      name: "Verified Stadium",
      homeClubName: "Arsenal",
      imageUrl: "/stadium.webp",
      photoCredit: {
        label: "TouchLine",
        sourceUrl: "https://example.com/source",
        licenseLabel: "Verified license",
        licenseUrl: "https://example.com/license",
      },
    },
  };
  const browserSnapshot: TouchlinePublicFixture = {
    id: "19722203",
    providerId: "19722203",
    name: "Arsenal vs Coventry City",
    status: "Not Started",
  };

  const merged = mergeTouchlineLiveFixtures([renderedFromServer], [browserSnapshot]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.status, browserSnapshot.status);
  assert.equal(merged[0]?.venue, renderedFromServer.venue);
});

test("Match Centre never presents a degraded live snapshot as currently live", () => {
  const live = fixture("30", "2026-08-20T14:00:00Z", "2nd Half");
  const upcoming = fixture("20", "2026-08-21T14:00:00Z", "Not Started");
  const staleSnapshot = {
    state: "persisted-live-snapshot",
    degraded: true,
    fetchedAt: "2026-08-20T13:40:00.000Z",
  } as const;

  assert.equal(isTouchlineLiveReadMetadata(staleSnapshot), true);
  assert.equal(touchlineMatchCentreDisplayState(live, staleSnapshot, Date.parse("2026-08-20T15:00:00Z")), "stale");
  assert.equal(touchlineMatchCentreDisplayState(upcoming, staleSnapshot, Date.parse("2026-08-20T15:00:00Z")), "upcoming");
  assert.equal(touchlineMatchCentreDisplayState(live, { ...staleSnapshot, degraded: false }, Date.parse("2026-08-20T15:00:00Z")), "live");
  assert.equal(isTouchlineLiveReadMetadata({ state: "persisted-live-snapshot", degraded: "true" }), false);
  assert.equal(isTouchlineLiveReadMetadata({ state: "unknown", degraded: true }), false);
});

test("Match Centre never invents a zero score when only one side is present", () => {
  const source = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  const scoreFunction = source.match(/function score\(fixture: TouchlinePublicFixture\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(scoreFunction, /Number\.isFinite\(fixture\.homeScore\) && Number\.isFinite\(fixture\.awayScore\)/);
  assert.match(scoreFunction, /return "VS"/);
  assert.doesNotMatch(scoreFunction, /\?\? 0/);
});

test("a venue awaiting verification is not labelled as verified", () => {
  const source = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<strong>\{dictionary\.venuePending\}<\/strong><small>\{dictionary\.official\}<\/small>/);
  assert.doesNotMatch(source, /<strong>\{dictionary\.venuePending\}<\/strong><small>\{dictionary\.provider\}<\/small>/);
});

test("Match Centre renders a verified stadium card and a premium kickoff treatment", () => {
  const component = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
    "utf8",
  );

  assert.match(component, /selected\.venue \? <article className=\{styles\.venueCard\}>/);
  assert.match(component, /<VenueArtwork venue=\{selected\.venue\} \/>/);
  assert.match(component, /onError=\{\(\) => setFailedImageUrl\(venue\.imageUrl\)\}/);
  assert.match(component, /selected\.venue\.capacity/);
  assert.match(component, /className=\{styles\.heroKickoff\}/);
  assert.match(component, /<CalendarDays size=\{14\}/);
  assert.match(component, /<Clock3 size=\{15\}/);
  assert.match(styles, /\.venueCard \{[^}]*position: relative[^}]*overflow: hidden/);
  assert.match(styles, /\.venueCard::before \{[^}]*border-radius: inherit/);
  assert.match(styles, /\.venueVisual \{[^}]*border-radius:/);
  assert.match(styles, /\.venueVisual img \{[^}]*object-fit: cover/);
  assert.match(styles, /\.venueVisual\[data-fallback="true"\]/);
  assert.match(styles, /\.heroKickoff \{[^}]*border-radius: 999px/);
  assert.match(styles, /\.heroTeams \.teamMark \{[^}]*width: clamp\(96px,13vw,156px\)/);
});

test("Match Centre uses the provider round instead of mislabelling a season as matchweek", () => {
  const source = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /selected\.roundName/);
  assert.match(source, /dictionary\.roundPending/);
  assert.doesNotMatch(source, /selected\.seasonId \?\? "—"/);
  assert.doesNotMatch(source, /Matchweek 1|Rodada 1/);
});

test("Match Centre keeps the first server and browser render in one validated time zone", () => {
  assert.equal(normalizeTouchlineMatchCentreTimeZone("Europe/Malta"), "Europe/Malta");
  assert.equal(normalizeTouchlineMatchCentreTimeZone("  Europe/London  "), "Europe/London");
  assert.equal(normalizeTouchlineMatchCentreTimeZone("not/a-time-zone"), "UTC");
  assert.equal(normalizeTouchlineMatchCentreTimeZone(null), "UTC");

  const componentSource = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(new URL("../app/live/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /requestHeaders\.get\("x-vercel-ip-timezone"\)/);
  assert.match(pageSource, /initialNow=\{initialNow\}/);
  assert.match(pageSource, /initialTimeZone=\{initialTimeZone\}/);
  assert.match(componentSource, /useState\(initialNow\)/);
  assert.doesNotMatch(componentSource, /useState\(\(\) => Date\.now\(\)\)/);
  assert.match(componentSource, /new Intl\.DateTimeFormat\(locale, \{ \.\.\.options, timeZone \}\)/);
});

test("fixture rail labels expose today or a compact localized day and date", () => {
  const now = Date.parse("2026-08-28T12:00:00Z");
  const today = roundFixture({ id: 1, round: 2, startsAt: "2026-08-28T19:00:00Z", status: "Not Started" });
  const tomorrow = roundFixture({ id: 2, round: 2, startsAt: "2026-08-29T11:30:00Z", status: "Not Started" });
  const missing = { ...tomorrow, startsAt: undefined };

  assert.equal(touchlineFixtureRailDateLabel(today, "pt-BR", "Europe/Malta", now), "HOJE");
  assert.equal(touchlineFixtureRailDateLabel(today, "en-GB", "Europe/Malta", now), "TODAY");
  assert.equal(touchlineFixtureRailDateLabel(tomorrow, "pt-BR", "Europe/Malta", now), "SÁB 29 AGO");
  assert.equal(touchlineFixtureRailDateLabel(tomorrow, "en-GB", "Europe/Malta", now), "SAT 29 AUG");
  assert.equal(touchlineFixtureRailDateLabel(missing, "en-GB", "Europe/Malta", now), "—");
});

test("Match Centre lets its mobile grid shrink while keeping only the fixture rail scrollable", () => {
  const styles = readFileSync(
    new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.layout \{[^}]*min-width: 0/);
  assert.match(styles, /\.fixtureRail \{[^}]*display: grid[^}]*grid-template-rows: auto minmax\(0, 1fr\)[^}]*height: calc\(100dvh - 28px\)[^}]*min-width: 0/);
  assert.match(styles, /\.matchPanel \{[^}]*min-width: 0/);
  assert.match(styles, /\.fixtureScroller \{[^}]*min-height: 0[^}]*overflow-y: scroll[^}]*overscroll-behavior-y: contain[^}]*scrollbar-gutter: stable[^}]*touch-action: pan-y[^}]*-webkit-overflow-scrolling: touch/);
  assert.match(styles, /\.fixtureScroller::-webkit-scrollbar \{[^}]*width:/);
  assert.match(styles, /\.fixtureScroller::-webkit-scrollbar-thumb \{[^}]*border-radius:/);
  assert.match(styles, /\.fixtureScroller:focus-visible \{[^}]*outline:/);
  assert.match(styles, /@media \(max-width: 850px\)[\s\S]*?\.fixtureRail \{[^}]*display: block[^}]*height: auto[^}]*max-height: none/);
  assert.match(styles, /@media \(max-width: 850px\)[\s\S]*?\.fixtureList \{[^}]*grid-auto-flow: column[^}]*overflow-x: auto/);

  const component = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /className=\{styles\.fixtureScroller\}[^>]*tabIndex=\{0\}/);
});

test("Match Centre fixture rail presents each confrontation as a vertical score card", () => {
  const component = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
    "utf8",
  );

  assert.match(component, /league: "TouchLine England League"/);
  assert.match(component, /className=\{styles\.englandFlag\}/);
  assert.match(component, /className=\{styles\.fixtureStack\}/);
  assert.match(component, /className=\{styles\.fixtureTeam\}>\s*<TeamMark fixture=\{fixture\} side="home"/);
  assert.match(component, /className=\{styles\.fixtureTeam\}>\s*<TeamMark fixture=\{fixture\} side="away"/);
  assert.match(component, /className=\{styles\.fixtureCentre\}/);
  assert.match(component, /const railFixtures = section\.fixtures;/);
  assert.match(component, /fixtureSections\.map\(\(section\) =>/);
  assert.match(component, /currentFixtures: "Confrontos desta semana"/);
  assert.match(component, /recentResults: "Últimos resultados"/);
  assert.match(component, /data-section=\{section\.id\}/);
  assert.match(component, /className=\{styles\.fixtureList\}/);
  assert.match(component, /\{schedule\.currentFixtures\.length\} \+ \{schedule\.recentResults\.length\}/);
  assert.match(component, /railFixtures\.map\(\(fixture\) =>/);
  assert.match(component, /function fixtureRailStatus\(/);
  assert.match(component, /function fixtureScorePair\(fixture: TouchlinePublicFixture\) \{\s*if \(Number\.isFinite\(fixture\.homeScore\) && Number\.isFinite\(fixture\.awayScore\)\)/);
  assert.match(component, /return null;/);
  assert.match(component, /const liveSnapshot = Array\.isArray\(payload\.data\) \? payload\.data : null;/);
  assert.match(component, /setFixtures\(\(current\) => mergeTouchlineLiveFixtures\(current, liveSnapshot\)\)/);
  assert.doesNotMatch(component, /return copy\[language\]\.next;/);
  assert.doesNotMatch(component, /homeScore \?\? 0|awayScore \?\? 0/);
  assert.match(component, /touchlineFixtureRailDateLabel\(fixture, language, initialTimeZone, now\)/);
  assert.match(component, /className=\{styles\.fixtureDay\}/);
  assert.match(component, /className=\{styles\.fixtureKickoff\}/);
  assert.match(component, /className=\{styles\.fixtureScore\}/);
  assert.match(component, /BellRing/);
  assert.match(styles, /\.fixture, \.selectedFixture \{[^}]*min-height: 104px/);
  assert.match(styles, /\.fixtureStack \{[^}]*grid-template-columns: 86px minmax\(0,1fr\)[^}]*gap: 6px/);
  assert.match(styles, /\.fixtureScore \{[^}]*top: 50%[^}]*right: 47px[^}]*translateY\(-50%\)/);
  assert.match(styles, /\.teamMark \{[^}]*width: 34px[^}]*height: 34px[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(styles, /\.teamMark \{[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(styles, /\.englandFlag \{[^}]*#cf2540/);
});

test("Live highlights use only verified match ratings and a final winning coach", () => {
  const component = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );

  const topRatedFunction = component.match(/function topRatedPlayers\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(topRatedFunction, /Number\.isFinite\(row\.rating\)/);
  assert.match(topRatedFunction, /appearanceStatus === "started"[\s\S]*?appearanceStatus === "substitute"/);
  assert.match(topRatedFunction, /slice\(0, 3\)/);
  assert.doesNotMatch(topRatedFunction, /touchlinePoints/);
  assert.match(component, /touchlineFixtureState\(selected, now\) !== "finished"/);
  assert.match(component, /touchlineLiveCoachForTeam\(winningTeamId\(selected\)\)/);
  assert.match(component, /highlights: "Destaques da partida"/);
  assert.match(component, /highlights: "Match Highlights"/);
  assert.match(component, /bestCoach: "Treinador vencedor"/);
  assert.match(component, /bestCoach: "Winning Coach"/);
  assert.match(component, /bestCards: "Melhores cards da partida"/);
  assert.match(component, /bestCards: "Top Match Cards"/);
  assert.doesNotMatch(component, /bestCoach: "Best Coach"/);
});

test("Match Centre keeps the live pitch at a real football-field proportion", () => {
  const styles = readFileSync(
    new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.hero \{[^}]*box-sizing: border-box[^}]*aspect-ratio: 105 \/ 68/);
  assert.match(styles, /\.hero \{[^}]*align-content: center/);
});
