import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertTouchlineOfficialLineupPresentation,
  createTouchlineGeometryQaFixture,
  TOUCHLINE_GEOMETRY_QA_PROVENANCE,
  TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE,
} from "../lib/touchlineArena/social-lineup-presentation-policy.ts";

function officialPresentation() {
  return {
    fixtureId: "19722192",
    side: "home" as const,
    sourceProvenance: TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE,
    sourceVersion: "touchline-official-lineup-feed-v1",
    sourceChecksum: `sha256:${"a".repeat(64)}`,
    sourceRevisionManifest: {
      "fixture-provider:19722192": 1,
      "club:10000000-0000-4000-8000-000000000004": 1,
      "card-ranking:touchline-england": 1,
    },
    sourceRevisionChecksum: `sha256:${"b".repeat(64)}`,
    lineupAvailableAt: "2026-08-31T13:30:00.000Z",
    club: { teamId: "19", name: "Arsenal" },
    home: { teamId: "19", name: "Arsenal" },
    away: { teamId: "18", name: "Chelsea" },
    players: Array.from({ length: 11 }, (_, index) => ({ card: { id: String(index + 1) } })),
    bench: Array.from({ length: 9 }, (_, index) => ({ id: String(index + 21) })),
  };
}

test("official social renderer accepts only complete persisted fixture identity", () => {
  assert.doesNotThrow(() => assertTouchlineOfficialLineupPresentation(officialPresentation()));

  for (const invalid of [
    { ...officialPresentation(), fixtureId: "geometry-qa-4-2-3-1" },
    { ...officialPresentation(), sourceProvenance: TOUCHLINE_GEOMETRY_QA_PROVENANCE },
    { ...officialPresentation(), club: { teamId: "18", name: "Chelsea" } },
    { ...officialPresentation(), players: officialPresentation().players.slice(1) },
    { ...officialPresentation(), bench: [{ id: "1" }, ...officialPresentation().bench.slice(1)] },
  ]) {
    assert.throws(
      () => assertTouchlineOfficialLineupPresentation(invalid as ReturnType<typeof officialPresentation>),
      /TL_SOCIAL_OFFICIAL_LINEUP_PRESENTATION_IDENTITY_REJECTED/,
    );
  }
});

test("geometry QA fixtures are neutral, synthetic and structurally non-publishable", () => {
  const forbiddenRealIdentities = /arsenal|chelsea|liverpool|manchester|haaland|saka|sportmonks|line-up confirmed/i;
  for (const formation of ["4-2-3-1", "3-4-2-1", "5-4-1"] as const) {
    const fixture = createTouchlineGeometryQaFixture(formation);
    assert.equal(fixture.sourceProvenance, TOUCHLINE_GEOMETRY_QA_PROVENANCE);
    assert.match(fixture.fixtureId, /^geometry-qa-/);
    assert.equal(fixture.teamId, "geometry-qa-team-a");
    assert.equal(fixture.opponentTeamId, "geometry-qa-team-b");
    assert.equal(fixture.teamName, "GEOMETRY QA A");
    assert.equal(fixture.opponentName, "GEOMETRY QA B");
    assert.equal(fixture.players.length, 11);
    assert.equal(new Set(fixture.players.map((player) => player.id)).size, 11);
    assert.equal(forbiddenRealIdentities.test(JSON.stringify(fixture)), false);
    assert.throws(
      () => assertTouchlineOfficialLineupPresentation(fixture as never),
      /TL_SOCIAL_OFFICIAL_LINEUP_PRESENTATION_IDENTITY_REJECTED/,
    );
  }
});

test("geometry QA template cannot display official branding, clubs or canonical cards", async () => {
  const [geometryView, officialView, worker, server] = await Promise.all([
    readFile(new URL("../components/touchline/social/TouchlineSocialLineupGeometryQa.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/touchline/social/TouchlineSocialLineupDraft.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/qa/generate-touchline-social-lineup-drafts.mts", import.meta.url), "utf8"),
    readFile(new URL("../lib/touchlineArena/social-lineup-draft-server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(geometryView, /GEOMETRY QA/);
  assert.match(geometryView, /SYNTHETIC FIXTURE · NOT PUBLISHABLE/);
  assert.match(geometryView, /geometry-qa-not-publishable/);
  assert.doesNotMatch(geometryView, /LINE-UP CONFIRMED|TouchlineEliteExactCard|TouchlineCoachCard|next\/image/);
  assert.doesNotMatch(geometryView, /Arsenal|Chelsea|Liverpool|Manchester/);

  assert.match(officialView, /assertTouchlineOfficialLineupPresentation\(draft\)/);
  assert.match(officialView, /data-fixture-kind=\{draft\.sourceProvenance\}/);
  assert.match(server, /sourceProvenance:\s*TOUCHLINE_OFFICIAL_LINEUP_PROVENANCE/);
  assert.match(worker, /metadata\.fixtureKind !== "PERSISTED_OFFICIAL_FIXTURE"/);
});
