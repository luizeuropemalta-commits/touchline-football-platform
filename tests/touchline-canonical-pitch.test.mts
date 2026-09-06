import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_CLUB_OWNER_XI_SLOTS, TOUCHLINE_STANDARD_433_SLOTS, touchlineCanonicalFormationSlots } from "../lib/touchlineArena/pitch-layout.ts";

const clubOwnerRenderer = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");
const gameweekTeamSnapshot = readFileSync(new URL("../components/touchline/fantasy/TouchlineGameweekTeamSnapshot.tsx", import.meta.url), "utf8");
const clubHubLineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
const clubLineupBuilder = readFileSync(new URL("../lib/touchlineArena/club-lineup.ts", import.meta.url), "utf8");
const clubHubLineupCss = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");
const clubHubPage = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

test("ClubHub and Market use the same canonical formation geometry", () => {
  assert.equal(TOUCHLINE_CLUB_OWNER_XI_SLOTS.length, 11);
  assert.equal(TOUCHLINE_STANDARD_433_SLOTS.length, 11);
  assert.deepEqual(TOUCHLINE_CLUB_OWNER_XI_SLOTS[0], { x: 8, y: 50 });
  assert.deepEqual(
    (({ id, role, roleIndex, x, y }) => ({ id, role, roleIndex, x, y }))(TOUCHLINE_STANDARD_433_SLOTS.at(-1)!),
    { id: "GK", role: "goalkeeper", roleIndex: 0, x: 10, y: 50 },
  );
  assert.deepEqual(TOUCHLINE_STANDARD_433_SLOTS.slice(0, 3).map(({ x, y }) => ({ x, y })), [
    { x: 88, y: 18 }, { x: 88, y: 50 }, { x: 88, y: 82 },
  ]);
  assert.deepEqual(touchlineCanonicalFormationSlots("4-4-2").map(({ id, x, y }) => ({ id, x, y })), [
    { id: "GK", x: 10, y: 50 },
    { id: "RB", x: 36, y: 17 }, { id: "RCB", x: 36, y: 39 },
    { id: "LCB", x: 36, y: 61 }, { id: "LB", x: 36, y: 83 },
    { id: "RM", x: 64, y: 17 }, { id: "RCM", x: 64, y: 39 },
    { id: "LCM", x: 64, y: 61 }, { id: "LM", x: 64, y: 83 },
    { id: "RST", x: 88, y: 38 }, { id: "LST", x: 88, y: 62 },
  ]);
  assert.deepEqual(touchlineCanonicalFormationSlots("4-2-3-1").map(({ id, x, y }) => ({ id, x, y })), [
    { id: "GK", x: 10, y: 50 },
    { id: "RB", x: 29, y: 17 }, { id: "RCB", x: 29, y: 39 },
    { id: "LCB", x: 29, y: 61 }, { id: "LB", x: 29, y: 83 },
    { id: "RDM", x: 50, y: 34 }, { id: "LDM", x: 50, y: 66 },
    { id: "RAM", x: 71, y: 20 }, { id: "CAM", x: 71, y: 50 },
    { id: "LAM", x: 71, y: 80 }, { id: "ST", x: 88, y: 50 },
  ]);
  assert.deepEqual(touchlineCanonicalFormationSlots("not-a-formation"), touchlineCanonicalFormationSlots("4-3-3"));
});

test("field art is a shared component rather than separate page drawings", () => {
  assert.match(clubOwnerRenderer, /TouchlineGameweekTeamSnapshot/);
  assert.match(gameweekTeamSnapshot, /TouchlinePitchSurface/);
  assert.match(clubHubLineup, /TouchlinePitchSurface/);
  assert.match(clubLineupBuilder, /touchlineCanonicalFormationSlots\(formation, input\.formationGeometryRegistry\)/);
  assert.match(readFileSync(new URL("../components/touchline/market/TouchlineSquadBuilderStage.tsx", import.meta.url), "utf8"), /touchlineCanonicalFormationSlots\(formation, geometryRegistry\)/);
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

test("ClubHub matchup keeps both crests and its score in a centered premium fixture group", () => {
  assert.match(clubHubLineup, /<ClubHubLiveFixtureScore fixtureId=\{matchup\.fixtureId\}/);
  assert.match(clubHubLineupCss, /grid-template-columns: minmax\(270px, 1fr\) minmax\(154px, \.48fr\)/);
  assert.match(clubHubLineupCss, /grid-template-columns: minmax\(0,1fr\) minmax\(54px, auto\) minmax\(0,1fr\)/);
  assert.match(clubHubLineupCss, /\.matchupTeams > b \{ min-width: 54px/);
  assert.match(clubHubLineupCss, /\.matchupCrest \{ width: 48px; height: 48px/);
});

test("ClubHub keeps the geometry inside its regulation landscape pitch on desktop and mobile", () => {
  assert.match(clubHubLineupCss, /\.pitch[\s\S]*?width: min\(100%, 922px\)/);
  assert.match(clubHubLineup, /<div className=\{styles\.geometryLayer\}>/);
  assert.match(clubHubLineupCss, /\.geometryLayer[\s\S]*?inset: 0/);
  assert.match(clubHubLineupCss, /\.player[\s\S]*?top: var\(--lineup-y\)/);
  assert.doesNotMatch(clubHubLineupCss, /top: calc\(var\(--lineup-y\) \+ var\(--lineup-safe-top-inset\)\)/);
  assert.match(
    clubHubLineupCss,
    /@media \(max-width: 720px\)[\s\S]*?\.pitch \{ width: 100%; \}/,
  );
  assert.match(
    clubHubLineupCss,
    /@media \(orientation: landscape\) and \(max-width: 1100px\) and \(max-height: 520px\)[\s\S]*?\.pitch \{ width: 100%; \}/,
  );
});

test("ClubHub preserves canonical horizontal player coordinates without local role refinements", () => {
  assert.doesNotMatch(clubHubLineup, /CLUB_HUB_DEFENDER_Y_REFINEMENT/);
  assert.doesNotMatch(clubHubLineup, /resolveClubHubLineupY\(/);
  assert.match(clubHubLineup, /const horizontalPitchPosition = \(x: number, y: number\)/);
  assert.match(clubHubLineup, /"--lineup-x": `\$\{pitchPosition\.x\}%`, "--lineup-y": `\$\{pitchPosition\.y\}%`/);
  assert.match(clubHubLineup, /orientation="horizontal"/);
  assert.match(clubHubLineup, /orientation="upright"/);
});

test("ClubHub makes an unscheduled opponent explicit without pretending TouchLine is a club", () => {
  assert.match(clubHubPage, /touchLineT\(locale, "opponentToBeConfirmed"\)/);
  assert.match(clubHubLineup, /className=\{!matchup\.away\.logoUrl \? styles\.matchupTeamPending : undefined\}/);
  assert.match(clubHubLineup, /matchup\.away\.shortCode/);
  assert.doesNotMatch(clubHubPage, /club-hub-fixture-pending-mark/);
});
