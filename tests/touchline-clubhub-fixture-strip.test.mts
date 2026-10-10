import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseClubHubStripSnapshot, clubHubStripState, clubHubStripScore } from "../lib/touchlineArena/club-hub-fixture-strip.ts";
import { CLUB_HUB_STRIP_COPY, getClubHubStripCopy } from "../lib/touchlineArena/club-hub-fixture-strip-i18n.ts";

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
test("live expires on clock advance independently of a new fetch", () => {
  assert.equal(clubHubStripState(fixture, metadata, now), "live");
  assert.equal(clubHubStripState(fixture, metadata, now + 5 * 60_000), "stale");
  for (const fetchedAt of [undefined, "bad timestamp", "2026-10-01T12:21:00Z"]) {
    assert.equal(clubHubStripState(fixture, { ...metadata, fetchedAt }, now), "stale");
  }
});
test("pause/resume available in all eight catalogues behind existing locale gate", () => {
  assert.equal(Object.keys(CLUB_HUB_STRIP_COPY).length, 8);
  for (const locale of Object.keys(CLUB_HUB_STRIP_COPY)) {
    const copy = getClubHubStripCopy(locale, true);
    assert.ok(copy.pause && copy.play && copy.pause !== copy.play);
  }
});
test("component uses durable read only, cancellation, stable IDs and accessible motion", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/football-data\/fantasy\/livescores/);
  assert.doesNotMatch(source, /router\.refresh|sportmonks/);
  assert.match(source, /setInterval\(updateClock, 15_000\)/);
  assert.match(source, /failed \|\| !snapshot \? copy.liveDataUpdating/);
  for (const token of ["AbortController", 'document.hidden', 'visibilitychange', 'cancelAnimationFrame', 'prefers-reduced-motion', 'key={fixture.providerId}', 'aria-pressed={paused}', 'onFocusCapture', 'onPointerDown', 'controls.link']) assert.ok(source.includes(token), token);
  const css = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.module.css", import.meta.url), "utf8");
  assert.match(css, /overflow-x: auto/);
  assert.doesNotMatch(css, /animation:|@keyframes/);
});
