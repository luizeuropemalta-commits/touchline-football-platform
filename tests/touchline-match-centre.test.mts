import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineLiveReadMetadata,
  normalizeTouchlineMatchCentreTimeZone,
  selectTouchlineMatchCentreFixture,
  touchlineFixtureState,
  touchlineMatchCentreDisplayState,
  touchlineMatchCentreHref,
} from "../lib/touchlineArena/match-centre.ts";
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

test("Match Centre lets its mobile grid shrink while keeping only the fixture rail scrollable", () => {
  const styles = readFileSync(
    new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.layout \{[^}]*min-width: 0/);
  assert.match(styles, /\.fixtureRail \{[^}]*min-width: 0/);
  assert.match(styles, /\.matchPanel \{[^}]*min-width: 0/);
  assert.match(styles, /\.fixtureScroller \{[^}]*overflow: auto/);
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
  assert.match(component, /const railFixtures = groups\[group\.id\];/);
  assert.match(component, /railFixtures\.map\(\(fixture\) =>/);
  assert.match(component, /function fixtureRailStatus\(/);
  assert.match(component, /function fixtureScorePair\(fixture: TouchlinePublicFixture\) \{\s*if \(Number\.isFinite\(fixture\.homeScore\) && Number\.isFinite\(fixture\.awayScore\)\)/);
  assert.match(component, /return null;/);
  assert.match(component, /const liveSnapshot = Array\.isArray\(payload\.data\) \? payload\.data : null;/);
  assert.match(component, /setFixtures\(\(current\) => mergeLiveFixtureSnapshot\(current, liveSnapshot\)\)/);
  assert.doesNotMatch(component, /return copy\[language\]\.next;/);
  assert.doesNotMatch(component, /homeScore \?\? 0|awayScore \?\? 0/);
  assert.match(component, /<time dateTime=\{fixture\.startsAt\}>\{fixtureDate\(fixture, language, initialTimeZone/);
  assert.match(component, /className=\{styles\.fixtureScore\}/);
  assert.match(component, /BellRing/);
  assert.match(styles, /\.fixture, \.selectedFixture \{[^}]*min-height: 108px/);
  assert.match(styles, /\.fixtureStack \{[^}]*grid-template-columns: 44px minmax\(0,1fr\)[^}]*gap: 4px/);
  assert.match(styles, /\.fixtureScore \{[^}]*top: 50%[^}]*right: 47px[^}]*translateY\(-50%\)/);
  assert.match(styles, /\.teamMark \{[^}]*width: 34px[^}]*height: 34px[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(styles, /\.teamMark \{[^}]*background: transparent[^}]*box-shadow: none/);
  assert.match(styles, /\.englandFlag \{[^}]*#cf2540/);
});

test("Match Centre keeps the live pitch at a real football-field proportion", () => {
  const styles = readFileSync(
    new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.hero \{[^}]*box-sizing: border-box[^}]*aspect-ratio: 105 \/ 68/);
  assert.match(styles, /\.hero \{[^}]*align-content: center/);
});
