import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_CLUB_OWNER_XI_SLOTS, TOUCHLINE_STANDARD_433_SLOTS, touchlineCanonicalFormationSlots } from "../lib/touchlineArena/pitch-layout.ts";

const clubOwnerRenderer = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");
const clubHubLineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
const clubLineupBuilder = readFileSync(new URL("../lib/touchlineArena/club-lineup.ts", import.meta.url), "utf8");
const clubHubLineupCss = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");
const clubHubPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

test("ClubHub and Market use the same canonical formation geometry", () => {
  assert.equal(TOUCHLINE_CLUB_OWNER_XI_SLOTS.length, 11);
  assert.equal(TOUCHLINE_STANDARD_433_SLOTS.length, 11);
  assert.deepEqual(TOUCHLINE_CLUB_OWNER_XI_SLOTS[0], { x: 8, y: 50 });
  assert.deepEqual(TOUCHLINE_STANDARD_433_SLOTS.at(-1), { role: "goalkeeper", roleIndex: 0, x: 9, y: 50 });
  assert.deepEqual(TOUCHLINE_STANDARD_433_SLOTS.slice(0, 3).map(({ x, y }) => ({ x, y })), [
    { x: 88, y: 14 }, { x: 88, y: 50 }, { x: 88, y: 86 },
  ]);
  assert.deepEqual(touchlineCanonicalFormationSlots("4-4-2"), [
    { role: "goalkeeper", roleIndex: 0, x: 9, y: 50 },
    { role: "defender", roleIndex: 0, x: 34, y: 14 },
    { role: "defender", roleIndex: 1, x: 34, y: 38 },
    { role: "defender", roleIndex: 2, x: 34, y: 62 },
    { role: "defender", roleIndex: 3, x: 34, y: 86 },
    { role: "midfielder", roleIndex: 0, x: 61, y: 14 },
    { role: "midfielder", roleIndex: 1, x: 61, y: 38 },
    { role: "midfielder", roleIndex: 2, x: 61, y: 62 },
    { role: "midfielder", roleIndex: 3, x: 61, y: 86 },
    { role: "forward", roleIndex: 0, x: 88, y: 14 },
    { role: "forward", roleIndex: 1, x: 88, y: 86 },
  ]);
  assert.deepEqual(touchlineCanonicalFormationSlots("4-2-3-1"), [
    { role: "goalkeeper", roleIndex: 0, x: 9, y: 50 },
    { role: "defender", roleIndex: 0, x: 34, y: 14 },
    { role: "defender", roleIndex: 1, x: 34, y: 38 },
    { role: "defender", roleIndex: 2, x: 34, y: 62 },
    { role: "defender", roleIndex: 3, x: 34, y: 86 },
    { role: "midfielder", roleIndex: 0, x: 52, y: 14 },
    { role: "midfielder", roleIndex: 1, x: 52, y: 86 },
    { role: "midfielder", roleIndex: 2, x: 70, y: 14 },
    { role: "midfielder", roleIndex: 3, x: 70, y: 50 },
    { role: "midfielder", roleIndex: 4, x: 70, y: 86 },
    { role: "forward", roleIndex: 0, x: 88, y: 50 },
  ]);
  assert.deepEqual(touchlineCanonicalFormationSlots("not-a-formation"), touchlineCanonicalFormationSlots("4-3-3"));
});

test("field art is a shared component rather than separate page drawings", () => {
  assert.match(clubOwnerRenderer, /TouchlinePitchSurface/);
  assert.match(clubHubLineup, /TouchlinePitchSurface/);
  assert.match(clubLineupBuilder, /touchlineCanonicalFormationSlots\(formation\)/);
  assert.match(readFileSync(new URL("../components/touchline/market/TouchlineSquadBuilderStage.tsx", import.meta.url), "utf8"), /touchlineCanonicalFormationSlots\(formation\)/);
  assert.doesNotMatch(clubOwnerRenderer, /CLUB_OWNER_PROFILE_PITCH_SLOTS/);
  assert.doesNotMatch(clubHubLineup, /styles\.goalBox/);
});

test("ClubHub formation keeps player names legible above cards without ellipses or edge collisions", () => {
  assert.match(clubHubLineup, /playerProfileHref=\{profileHref\}/);
  assert.match(clubHubLineup, /<span className=\{styles\.playerName\}>\{card\.name\}<\/span>/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?bottom: calc\(100% \+/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?text-transform: uppercase/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?white-space: normal/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?text-overflow: clip/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?background: linear-gradient\(180deg, rgba\(1,6,7,/);
  assert.match(clubHubLineupCss, /\.playerName[\s\S]*?box-shadow: 0 5px 16px rgba\(0,0,0,/);
  assert.doesNotMatch(clubHubLineupCss, /\.playerName[\s\S]*?text-overflow: ellipsis/);
  assert.doesNotMatch(clubHubLineupCss, /\.playerLink/);
});

test("ClubHub lowers the player assembly with a compensated safe top inset on desktop and mobile", () => {
  assert.match(clubHubLineupCss, /\.pitch[\s\S]*?--lineup-safe-top-inset: clamp\(42px, 4\.4vw, 62px\)/);
  assert.match(clubHubLineupCss, /\.player[\s\S]*?top: calc\(var\(--lineup-y\) \+ var\(--lineup-safe-top-inset\)\)/);
  assert.match(
    clubHubLineupCss,
    /@media \(max-width: 720px\)[\s\S]*?--lineup-safe-top-inset: clamp\(36px, 10vw, 46px\)[\s\S]*?min-height: calc\(var\(--lineup-pitch-core-height\) \+ var\(--lineup-safe-top-inset\)\)/,
  );
  assert.match(
    clubHubLineupCss,
    /@media \(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 520px\)[\s\S]*?--lineup-safe-top-inset: 32px[\s\S]*?min-height: calc\(var\(--lineup-pitch-core-height\) \+ var\(--lineup-safe-top-inset\)\)/,
  );
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
