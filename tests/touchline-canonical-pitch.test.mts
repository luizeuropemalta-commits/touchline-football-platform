import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_CLUB_OWNER_XI_SLOTS, TOUCHLINE_STANDARD_433_SLOTS } from "../lib/touchlineArena/pitch-layout.ts";

const clubOwnerRenderer = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");
const clubHubLineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
const clubLineupBuilder = readFileSync(new URL("../lib/touchlineArena/club-lineup.ts", import.meta.url), "utf8");
const clubHubLineupCss = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");
const clubHubPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

test("ClubOwner and ClubHub use the same canonical horizontal 4-3-3 surface", () => {
  assert.equal(TOUCHLINE_CLUB_OWNER_XI_SLOTS.length, 11);
  assert.equal(TOUCHLINE_STANDARD_433_SLOTS.length, 11);
  assert.deepEqual(TOUCHLINE_CLUB_OWNER_XI_SLOTS[0], { x: 8, y: 50 });
  assert.deepEqual(TOUCHLINE_STANDARD_433_SLOTS.at(-1), { role: "goalkeeper", x: 8, y: 50 });
  assert.deepEqual(TOUCHLINE_STANDARD_433_SLOTS.slice(0, 3).map(({ x, y }) => ({ x, y })), [
    { x: 82, y: 20 }, { x: 82, y: 50 }, { x: 82, y: 80 },
  ]);
});

test("field art is a shared component rather than separate page drawings", () => {
  assert.match(clubOwnerRenderer, /TouchlinePitchSurface/);
  assert.match(clubHubLineup, /TouchlinePitchSurface/);
  assert.match(clubLineupBuilder, /TOUCHLINE_STANDARD_433_SLOTS/);
  assert.doesNotMatch(clubOwnerRenderer, /CLUB_OWNER_PROFILE_PITCH_SLOTS/);
  assert.doesNotMatch(clubHubLineup, /styles\.goalBox/);
});

test("ClubHub formation keeps every complete player name above its card", () => {
  assert.match(clubHubLineup, /playerProfileHref=\{profileHref\}/);
  assert.match(clubHubLineup, /<span className=\{styles\.playerName\}>\{card\.name\}<\/span>/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?bottom: calc\(100% \+/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?text-transform: uppercase/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?white-space: nowrap/);
  assert.doesNotMatch(clubHubLineupCss, /\.playerLink/);
});

test("ClubHub preserves canonical player coordinates without local role refinements", () => {
  assert.doesNotMatch(clubHubLineup, /CLUB_HUB_DEFENDER_Y_REFINEMENT/);
  assert.doesNotMatch(clubHubLineup, /resolveClubHubLineupY\(/);
  assert.match(clubHubLineup, /"--lineup-x": `\$\{x\}%`, "--lineup-y": `\$\{y\}%`/);
});

test("ClubHub makes an unscheduled opponent explicit without pretending TouchLine is a club", () => {
  assert.match(clubHubPage, /touchLineT\(locale, "opponentToBeConfirmed"\)/);
  assert.match(clubHubPage, /className=\{!matchPreview\.away\.logoUrl \? "club-hub-fixture-team-pending" : undefined\}/);
  assert.match(clubHubPage, /matchPreview\.away\.shortCode/);
  assert.doesNotMatch(clubHubPage, /club-hub-fixture-pending-mark/);
});
