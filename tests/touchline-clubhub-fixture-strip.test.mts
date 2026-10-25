import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseClubHubStripSnapshot, clubHubStripState, clubHubStripScore, clubHubStripSeedNeedsRecovery } from "../lib/touchlineArena/club-hub-fixture-strip.ts";
import { CLUB_HUB_STRIP_COPY, getClubHubStripCopy } from "../lib/touchlineArena/club-hub-fixture-strip-i18n.ts";
import { fixtureStripFrameDistance, wrapFixtureStripOffset, normalizeFixtureStripScrollOffset } from "../lib/touchlineArena/fixture-strip-motion.ts";

const fixture = { id: "123", providerId: "123", startsAt: "2026-10-01T12:00:00Z", status: "INPLAY_1ST_HALF", homeScore: 0, awayScore: 2,
  homeTeam: { id: "1", providerId: "1", name: "Home" }, awayTeam: { id: "2", providerId: "2", name: "Away" } };
const metadata = { state: "persisted-live-snapshot", degraded: false, fetchedAt: "2026-10-01T12:19:00Z" } as const;
const now = Date.parse("2026-10-01T12:20:00Z");

test("strip accepts only canonical DTO and explicit durable metadata, rejects duplicates", () => {
  assert.equal(parseClubHubStripSnapshot({ ok: true, data: [fixture], ...metadata })?.fixtures.length, 1);
  for (const value of [null, { ok: true, data: [fixture] }, { ok: false, data: [fixture], ...metadata }, { ok: true, data: [fixture, fixture], ...metadata }, { ok: true, data: [{ ...fixture, homeScore: -1 }], ...metadata }]) assert.equal(parseClubHubStripSnapshot(value), null);
});
test("degraded or failed reads never render LIVE; score zero is preserved", () => {
  assert.equal(clubHubStripState(fixture, metadata, now), "live");
  assert.equal(clubHubStripState(fixture, { ...metadata, degraded: true }, now), "stale");
  assert.equal(clubHubStripState(fixture, null, now), "stale");
  assert.equal(clubHubStripScore(fixture), "0 – 2");
  assert.equal(clubHubStripScore({ ...fixture, awayScore: undefined }), "—");
});
test("future fixture does not become live and finished stays finished", () => {
  assert.equal(clubHubStripState(fixture, metadata, now - 86_400_000), "upcoming");
  assert.equal(clubHubStripState({ ...fixture, status: "FullTime" }, null, now), "finished");
});
test("an overdue schedule awaits an official update instead of implying live play", () => {
  const scheduled = { ...fixture, status: "Not Started", homeScore: undefined, awayScore: undefined };
  assert.equal(clubHubStripState(scheduled, metadata, now - 86_400_000), "upcoming");
  assert.equal(clubHubStripState(scheduled, metadata, now), "awaiting-update");
  assert.equal(clubHubStripState(scheduled, null, now), "awaiting-update");
  const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
  assert.match(source, /state === "awaiting-update" \? copy\.awaitingOfficialUpdate/);
});
test("live expires on clock advance independently of a new fetch", () => {
  assert.equal(clubHubStripState(fixture, metadata, now), "live");
  assert.equal(clubHubStripState(fixture, metadata, now + 5 * 60_000), "stale");
  for (const fetchedAt of [undefined, "bad timestamp", "2026-10-01T12:21:00Z"]) {
    assert.equal(clubHubStripState(fixture, { ...metadata, fetchedAt }, now), "stale");
  }
});
test("manual navigation is available in all eight catalogues behind existing locale gate", () => {
  assert.equal(Object.keys(CLUB_HUB_STRIP_COPY).length, 8);
  for (const locale of Object.keys(CLUB_HUB_STRIP_COPY)) {
    const copy = getClubHubStripCopy(locale, true);
    assert.ok(copy.previous && copy.next && copy.previous !== copy.next);
    assert.ok(copy.unavailable);
  }
});
test("component uses durable read only, cancellation, stable IDs and accessible motion", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/football-data\/fantasy\/livescores/);
  assert.doesNotMatch(source, /router\.refresh|sportmonks/);
  assert.match(source, /setInterval\(updateClock, 15_000\)/);
  assert.match(source, /failed \? motion.unavailable : !snapshot && needsInitialRead \? copy.liveDataUpdating/);
  for (const token of ["AbortController", 'document.hidden', 'visibilitychange', 'cancelAnimationFrame', 'prefers-reduced-motion', 'key={fixture.providerId}', 'data-fixture-carousel="continuous"', 'aria-label={motion.previous}', 'aria-label={motion.next}', 'controls.link', 'useTouchlinePublishedLive', 'strip.contains(document.activeElement)', 'aria-hidden={run !== "original"', 'tabIndex={run === "original" ? undefined : -1}']) assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /aria-pressed|motion\.pause|motion\.play/);
  const css = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.module.css", import.meta.url), "utf8");
  assert.match(css, /overflow-x: auto/);
  assert.doesNotMatch(css, /animation:|@keyframes/);
});

test("only an unavailable seed needs one recovery read; explicit empty is authoritative", () => {
  assert.equal(clubHubStripSeedNeedsRecovery(undefined), true);
  assert.equal(clubHubStripSeedNeedsRecovery(null), true);
  assert.equal(clubHubStripSeedNeedsRecovery([]), false);
  assert.equal(clubHubStripSeedNeedsRecovery([fixture]), false);
  assert.equal(parseClubHubStripSnapshot({ ok: true, data: [], ...metadata })?.fixtures.length, 0);
  const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!needsInitialRead\) return/);
  assert.match(source, /\}, \[needsInitialRead\]\)/);
});

test("continuous strip wraps both directions to an identical visual run without empty space", () => {
  assert.equal(wrapFixtureStripOffset(100, 100), 100);
  assert.equal(wrapFixtureStripOffset(199, 100), 199);
  assert.equal(wrapFixtureStripOffset(200, 100), 100);
  assert.equal(wrapFixtureStripOffset(99, 100), 199);
  assert.equal(wrapFixtureStripOffset(-25, 100), 175);
  assert.equal(wrapFixtureStripOffset(1, 0), 0);
});

test("continuous strip speed is elapsed-time based and never catches up after suspension", () => {
  assert.ok(Math.abs(fixtureStripFrameDistance(1000 / 60) * 60 - 30) < 1e-9);
  assert.ok(Math.abs(fixtureStripFrameDistance(1000 / 30) * 30 - 30) < 1e-9);
  assert.equal(fixtureStripFrameDistance(10_000), 1.5);
  assert.equal(fixtureStripFrameDistance(-1), 0);
});


test("integer native scroll feedback cannot oscillate at fractional loop seams", () => {
  // CI WebKit exposed 1473 / 2946 for a 1473.4375px run. Exercise the
  // animation write followed by its native scroll event, including rounding
  // policies that differ across browsers. This must retain forward motion.
  for (const cycle of [1473.4375, 1473.75, 1473]) {
    for (const quantize of [Math.floor, Math.round, Math.ceil]) {
      let offset = quantize(2 * cycle - 2);
      let distance = 0;
      for (let frame = 0; frame < 120; frame++) {
        const before = offset;
        offset = quantize(wrapFixtureStripOffset(offset + 1, cycle));
        const normalized = normalizeFixtureStripScrollOffset(offset, cycle);
        assert.equal(normalized, offset, "an animation write must not trigger a second seam jump");
        offset = quantize(normalized);
        const step = ((offset - before) % cycle + cycle) % cycle;
        assert.ok(step > 0 && step <= 2, `bounded forward step: ${cycle} ${before} -> ${offset}`);
        distance += step;
      }
      assert.ok(Math.abs(distance - 120) <= 1, "one seam may round by less than one pixel");
      for (const external of [0, cycle - 10, 2 * cycle + 10, 3 * cycle]) {
        const corrected = quantize(normalizeFixtureStripScrollOffset(external, cycle));
        assert.equal(normalizeFixtureStripScrollOffset(corrected, cycle), corrected,
          "external scrolling normalizes once and then settles");
        assert.ok(corrected >= cycle - 1 && corrected < 2 * cycle + 1);
      }
    }
  }
});
