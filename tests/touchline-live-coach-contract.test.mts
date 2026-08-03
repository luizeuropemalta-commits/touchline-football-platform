import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { touchlineCountryFlagUrl } from "../lib/touchlineArena/country-flags.ts";
import {
  TOUCHLINE_LIVE_COACHES_BY_TEAM,
  touchlineLiveCoachForTeam,
} from "../lib/touchlineArena/live-coaches.ts";

function source(path: string) {
  return fs.readFileSync(path, "utf8");
}

function touchlineEnglandTeamIds() {
  const demoData = source("lib/touchlineArena/demo-data.ts");
  const start = demoData.indexOf("export const TOUCHLINE_ENGLAND_CLUBS");
  const end = demoData.indexOf("];", start);
  assert.ok(start >= 0 && end > start, "TouchLine England club registry must be present");
  return [...demoData.slice(start, end).matchAll(/teamId: "(\d+)"/g)].map((match) => match[1]);
}

test("registers one unique verified coach snapshot for every TouchLine England club", () => {
  const clubTeamIds = touchlineEnglandTeamIds().sort((a, b) => Number(a) - Number(b));
  const coachTeamIds = Object.keys(TOUCHLINE_LIVE_COACHES_BY_TEAM).sort((a, b) => Number(a) - Number(b));

  assert.equal(clubTeamIds.length, 20);
  assert.equal(new Set(clubTeamIds).size, 20);
  assert.deepEqual(coachTeamIds, clubTeamIds);

  const providerIds = new Set<string>();
  for (const teamId of clubTeamIds) {
    const snapshot = TOUCHLINE_LIVE_COACHES_BY_TEAM[teamId];
    const lookup = touchlineLiveCoachForTeam(teamId);

    assert.ok(snapshot, `missing coach snapshot for team ${teamId}`);
    assert.ok(lookup, `missing coach lookup for team ${teamId}`);
    assert.equal(snapshot.coach.teamId, teamId);
    const rawCoach = snapshot.coach.source.raw as { team_id?: unknown };
    assert.equal(String(rawCoach?.team_id), teamId);
    assert.equal(lookup.coach.providerId, snapshot.coach.providerId);
    assert.equal(lookup.countryCode3, snapshot.countryCode3);
    assert.ok(snapshot.coach.displayName.trim().length >= 3);
    assert.ok(snapshot.coach.providerId.trim().length > 0);
    assert.ok(!providerIds.has(snapshot.coach.providerId), `coach ${snapshot.coach.providerId} is assigned to multiple clubs`);
    providerIds.add(snapshot.coach.providerId);

    const flagUrl = touchlineCountryFlagUrl(snapshot.countryCode3);
    assert.ok(flagUrl, `missing nationality flag mapping for ${snapshot.countryCode3}`);
    assert.ok(fs.existsSync(`public${flagUrl}`), `missing nationality flag asset ${flagUrl}`);
  }
});

test("binds the home and away coach cards to the selected fixture clubs and isolates coach zoom", () => {
  const arenaClient = source("app/arena/ArenaClient.tsx");

  assert.match(
    arenaClient,
    /touchlineLiveCoachForTeam\(selectedLiveHomeClub\?\.teamId\)/,
  );
  assert.match(
    arenaClient,
    /touchlineLiveCoachForTeam\(selectedLiveAwayClub\?\.teamId\)/,
  );
  assert.match(arenaClient, /data-live-coach-card="home"[\s\S]*?setSelectedLiveCoachSide\("home"\)/);
  assert.match(arenaClient, /data-live-coach-card="away"[\s\S]*?setSelectedLiveCoachSide\("away"\)/);
  assert.match(arenaClient, /selectedLiveCoachData\.side === "home"/);
  assert.match(
    arenaClient,
    /data-coach-spotlight=\{isCoachSpotlightOpen \|\| selectedLiveCoachData \? "open" : "closed"\}/,
  );
  assert.match(
    arenaClient,
    /\.arena-stage\[data-coach-spotlight="open"\] \.field-player-layer,[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none/,
  );
});
