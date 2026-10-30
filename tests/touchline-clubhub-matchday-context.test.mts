import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";
import type { TouchlineFantasyLineupMember } from "../lib/football-data/types.ts";
import { buildTouchLineClubMatchdayPresentation } from "../lib/touchlineArena/club-lineup.ts";
import { findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { resolveClubHubMatchdayContext, clubHubLineupIsCompleted } from "../lib/touchlineArena/club-hub-matchday-context.ts";

const club = findTouchLineClub("manchester-city")!;
const now = Date.parse("2026-10-30T12:00:00Z");
const match = (id: string, startsAt: string, status: string): TouchlinePublicFixture => ({
  id, providerId: id, startsAt, status,
  homeTeam: { id: club.teamId, providerId: club.teamId, name: club.name },
  awayTeam: { id: `away-${id}`, providerId: `away-${id}`, name: `Opponent ${id}` },
});
const previous = match("previous", "2026-10-24T12:00:00Z", "FT");
const current = match("current", "2026-10-30T14:00:00Z", "NS");
const next = match("next", "2026-11-06T14:00:00Z", "NS");
const roles = ["goalkeeper", ...Array(4).fill("defender"), ...Array(3).fill("midfielder"), ...Array(3).fill("forward")];
const sheet = (fixtureId: string): TouchlineFantasyLineupMember[] => roles.map((position, index) => ({
  id: `${fixtureId}-${index}`, providerId: `${fixtureId}-${index}`, provider: "sportmonks",
  fixtureId, teamId: club.teamId, teamName: club.name, playerId: String(index + 1),
  playerName: `Player ${index + 1}`, jerseyNumber: index + 1, position,
  formationPosition: String(index + 1), isStarter: true, isSubstitute: false, statistics: [],
}));
const presentation = (officialLineup: TouchlineFantasyLineupMember[], fixtureId = "current") => buildTouchLineClubMatchdayPresentation({
  club, squadCards: [], fixtureId, officialLineup,
  lastCompletedXi: { fixtureId: "previous", formation: "4-3-3", starters: sheet("previous") },
});
const context = (officialLineup: TouchlineFantasyLineupMember[], fixture = current) => resolveClubHubMatchdayContext({
  clubTeamId: club.teamId, presentation: presentation(officialLineup, fixture.providerId),
  matchdayFixtureId: fixture.providerId, publicFixture: fixture, lastCompletedXiFixture: previous,
  candidates: [previous, fixture, next], now,
});

test("canonical XI validation advances the same match and Next game together: before XI, NS, live and FT", () => {
  assert.equal(presentation([]).lineup.status, "preview");
  const before = context([]);
  assert.equal(before.lineupFixture, previous);
  assert.equal(before.nextFixture, current);
  for (const status of ["NS", "LIVE", "FT"]) {
    const fixture = { ...current, status };
    const view = context(sheet("current"), fixture);
    assert.equal(presentation(sheet("current")).lineup.status, "confirmed");
    assert.equal(view.lineupFixture, fixture);
    assert.equal(view.nextFixture, next);
    assert.equal(clubHubLineupIsCompleted(fixture), status === "FT");
  }
  assert.equal(current.status, "NS", "presentation never changes provider status from the clock");
});

test("partial, duplicate, other-team and other-fixture XI cannot advance the tickets match", () => {
  for (const bad of [sheet("current").slice(0, 10), [...sheet("current").slice(0, 10), sheet("current")[0]!],
    sheet("other"), sheet("current").map(member => ({ ...member, teamId: "another-team" }))]) {
    assert.equal(presentation(bad).lineup.status, "preview");
    const view = context(bad);
    assert.equal(view.lineupFixture, previous);
    assert.equal(view.nextFixture, current);
  }
});

test("confirmed XI with missing/mismatched public fixture fails closed without borrowing another matchup", () => {
  for (const publicFixture of [null, next, { ...current, homeTeam: next.awayTeam }]) {
    const view = resolveClubHubMatchdayContext({ clubTeamId: club.teamId, presentation: presentation(sheet("current")),
      matchdayFixtureId: "current", publicFixture, lastCompletedXiFixture: previous, candidates: [current, next], now });
    assert.equal(view.lineupFixture, null);
    assert.equal(view.nextFixture, current);
  }
});

test("missing historical fixture stays unavailable; an exact requested FT retains its own record", () => {
  const missing = resolveClubHubMatchdayContext({ clubTeamId: club.teamId, presentation: presentation([]),
    matchdayFixtureId: "current", publicFixture: current, lastCompletedXiFixture: null, candidates: [current, next], now });
  assert.equal(missing.lineupFixture, null);
  const requested = context(sheet("previous"), previous);
  assert.equal(requested.lineupFixture, previous);
  assert.equal(requested.nextFixture, next);
  for (const status of ["Cancelled", "Abandoned", "Unknown", "NS", "LIVE"]) assert.equal(clubHubLineupIsCompleted({ ...current, status }), false);
  for (const status of ["FT", "AET", "After Penalties"]) assert.equal(clubHubLineupIsCompleted({ ...current, status }), true);
});

test("real server panel resolves XI and Next from one presentation, and does not reveal either before both are ready", async () => {
  const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ClubHubMatchdayPanels")!;
  const exports: { render?: (props: object) => Promise<React.ReactElement> } = {};
  const calls: string[] = [];
  runInNewContext(ts.transpileModule(declaration.getText(ast) + "\nexports.render=ClubHubMatchdayPanels;", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, { React, exports, loadTouchLineActiveRanking: async () => { calls.push("ranking"); return {}; },
    ClubHubLineupSection: async (props: { presentationPromise: Promise<{ fixtureContext: ReturnType<typeof context> }> }) => {
      const data = await props.presentationPromise;
      return React.createElement("div", { "data-xi": data.fixtureContext.lineupFixture?.providerId });
    },
    ClubHubOfficialLeagueSection: async (props: { matchSnapshotPromise: Promise<{ nextFixture: TouchlinePublicFixture }> }) => {
      const data = await props.matchSnapshotPromise;
      return React.createElement("div", { "data-next": data.nextFixture?.providerId });
    }, ClubHubOfficialChannel: () => null, ClubHubOfficialTablePanel: () => null });
  let resolvePresentation!: (value: object) => void;
  let ready = false;
  const result = exports.render!({ club, locale: "en-GB", dataSource: "direct", presentationPromise: new Promise(resolve => { resolvePresentation = resolve; }),
    viewerAccessPromise: Promise.resolve({}), tablePromise: Promise.resolve({}), officialChannels: {} });
  void result.then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  resolvePresentation({ fixtureContext: context(sheet("current")), matchSnapshot: { nextFixture: current } });
  const html = renderToStaticMarkup(await result);
  assert.match(html, /data-xi="current"/); assert.match(html, /data-next="next"/);
  assert.deepEqual(calls, ["ranking"], "the paired render does not duplicate ranking reads");
});
