import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { clubHubFixtureRailRefreshMs, resolveClubHubFixtureRail } from "../lib/touchlineArena/club-hub-fixture-rail.ts";

const beforeKickoff = Date.parse("2026-09-05T12:00:00.000Z");
const fixture = { startsAt: "2026-09-05T16:00:00.000Z" };

test("ClubHub rail presents the three verified match phases", () => {
  assert.deepEqual(resolveClubHubFixtureRail(fixture, "en-GB", beforeKickoff), {
    state: "upcoming", heading: "NEXT MATCH", score: null, liveMinute: null,
  });
  assert.deepEqual(resolveClubHubFixtureRail({ ...fixture, status: "LIVE", homeScore: 1, awayScore: 0, liveMinute: 63 }, "en-GB", Date.parse("2026-09-05T17:10:00.000Z")), {
    state: "live", heading: "LIVE", score: "1–0", liveMinute: "63'",
  });
  assert.deepEqual(resolveClubHubFixtureRail({ ...fixture, status: "Full Time", homeScore: 2, awayScore: 1 }, "en-GB", beforeKickoff), {
    state: "finished", heading: "FULL TIME", score: "2–1", liveMinute: null,
  });
});

test("a future provider live flag cannot make the ClubHub rail look live", () => {
  assert.equal(resolveClubHubFixtureRail({ ...fixture, status: "LIVE" }, "pt-BR", beforeKickoff).heading, "PRÓXIMO JOGO");
});

test("the shared ClubHub rail wakes exactly at T−24, stays sparse until the live window, and never schedules local timestamps", () => {
  const nextHour = Date.parse("2026-09-05T15:30:00.000Z");
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00.000Z", nextHour),
    60_000,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "live" }, "2026-09-05T16:00:00.000Z", beforeKickoff),
    10_000,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "live" }, "2026-09-05T16:00:00.000Z", Number.NaN),
    null,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "finished" }, "2026-09-05T16:00:00.000Z", beforeKickoff),
    null,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00.000Z", Date.parse("2026-09-04T15:00:00.000Z")),
    3_600_000,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00.000Z", Date.parse("2026-09-04T16:00:00.000Z")),
    82_800_000,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00.000Z", Date.parse("2026-09-05T12:00:00.000Z")),
    10_800_000,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00.000Z", Date.parse("2026-09-05T16:01:00.000Z")),
    60_000,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00.000Z", Date.parse("2026-09-05T16:02:01.000Z")),
    null,
  );
  assert.equal(
    clubHubFixtureRailRefreshMs({ state: "upcoming" }, "2026-09-05T16:00:00", beforeKickoff),
    null,
  );
});

test("the shared rail renders a verified stadium image in a compact card beside the venue name", () => {
  const component = readFileSync(new URL("../components/touchline/club-hub/ClubHubNextFixtureCard.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/touchline/club-hub/ClubHubPremiumPrototype.module.css", import.meta.url), "utf8");
  assert.match(component, /className=\{styles\.nextFixtureVenueImage\}/);
  assert.match(component, /src=\{venueImageUrl\}/);
  assert.match(component, /className=\{styles\.nextFixtureVenueCopy\}/);
  assert.doesNotMatch(component, /nextFixtureVenueBackdrop/);
  assert.match(styles, /\.nextFixtureVenueImage \{[\s\S]*?object-fit: cover/);
  assert.match(styles, /\.nextFixtureVenue \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /\.nextFixtureVenueBackdrop/);
  assert.match(page, /TOUCHLINE_STADIUM_CATALOG\.find\(\(stadium\) => stadium\.homeTeamProviderId === fixture\.homeTeam\?\.providerId\)/);
});

test("ClubHub outer frames use the standard TouchLine neon, not club-blue accents", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const railCss = readFileSync(new URL("../components/touchline/club-hub/ClubHubOfficialLeague.module.css", import.meta.url), "utf8");
  const feedCss = readFileSync(new URL("../components/touchline/club-social/TouchlineClubSocialFeed.module.css", import.meta.url), "utf8");
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const lineupCss = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.module.css", import.meta.url), "utf8");
  const officialTable = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.tsx", import.meta.url), "utf8");
  const officialTableCss = readFileSync(new URL("../components/touchline/TouchlineOfficialLeagueTable.module.css", import.meta.url), "utf8");
  assert.match(page, /TouchlineClubPerimeterTrace accent="#a3ff12"/);
  assert.match(railCss, /--touchline-perimeter-run-color:\s*#a3ff12/);
  assert.match(feedCss, /border: 1px solid rgba\(163, 255, 18, \.34\)/);
  assert.match(lineup, /<TouchlineClubPerimeterTrace accent="#a3ff12"/);
  assert.match(lineupCss, /--touchline-perimeter-run-color:\s*#a3ff12/);
  assert.match(officialTable, /variant === "clubHubRail" \? <TouchlineClubPerimeterTrace accent="#a3ff12"/);
  assert.match(officialTableCss, /\.clubHubTableTrace\s*\{[\s\S]*?--touchline-perimeter-run-color:\s*#a3ff12/);
  assert.match(page, /data-clubhub-card-spotlight=\{`position-\$\{key\}`\}[\s\S]*?<TouchlineClubPerimeterTrace accent="#a3ff12"/);
  assert.match(page, /CLUB_POSITION_LEADER_GROUPS/);
  assert.match(page, /positionGroups: \["centre-back"\]/);
  assert.match(page, /positionGroups: \["full-back"\]/);
  assert.match(page, /positionGroups: \["midfielder"\]/);
  assert.match(page, /positionGroups: \["winger", "striker"\]/);
});
