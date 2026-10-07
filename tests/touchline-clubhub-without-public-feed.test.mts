import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { getTouchlineClubHubProfileCopy } from "../lib/touchlineArena/club-hub-profile-i18n.ts";

const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/touchline/club-hub/ClubHubOfficialLeague.module.css", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const section = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "ClubHubOfficialLeagueSection")!;
type Props = Record<string, unknown>;
const club = { teamId: 19, name: "Official $&<> Club", shortCode: "OFC", slug: "official", logoUrl: "/home.png" };
const away = { teamId: 20, name: "Away Club", shortCode: "AWY", slug: "away", logoUrl: "/away.png" };
const fixture = { id: "fixture-unchanged", homeTeam: { providerId: 19, name: club.name }, awayTeam: { providerId: 20, name: away.name },
  startsAt: "2026-10-25T01:30:00Z", status: "live", homeScore: 0, awayScore: 2, liveMinute: 0,
  roundName: "Official round", venue: { name: "Ground $&<>", interiorImageUrl: "/ground.png" } };
const table = { state: "ready", rows: [{ team: { providerTeamId: 19 }, displayPosition: 0 }, { team: { providerTeamId: 20 }, displayPosition: null }] };
function harness() {
  const calls: { kind: string; props: Props }[] = [];
  const leaf = (kind: string) => function FixtureLeaf(props: Props) { calls.push({ kind, props }); return React.createElement("span", { "data-leaf": kind }, kind); };
  const exports: Props = {};
  const styles = new Proxy({}, { get: (_, key) => String(key) });
  const forbidden = () => assert.fail("The public ClubHub must not request or render social feed content");
  runInNewContext(ts.transpileModule(section.getText(ast) + "\nexports.render = ClubHubOfficialLeagueSection;", {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, { React, exports, getTouchlineClubHubProfileCopy, officialLeagueStyles: styles, premiumStyles: styles,
    findTouchLineClub: (id: unknown) => id === 19 || id === club.name ? club : id === 20 || id === away.name ? away : null,
    normalizeTouchlineMatchCentreTimeZone: (value: string) => value, TOUCHLINE_STADIUM_CATALOG: [],
    readTouchlineClubSocialFeed: forbidden, loadTouchlineQaMirroredSocialFeed: forbidden, TouchlineClubSocialFeed: forbidden,
    ClubHubNextFixtureCard: leaf("fixture"), TouchlineOfficialLeagueTable: leaf("table"), TouchlineClubPerimeterTrace: leaf("trace"), Image: leaf("image"),
  });
  return { calls, render: exports.render as (props: Props) => Promise<React.ReactElement> };
}
const input = (locale: string, dataSource: string) => ({ club, locale, dataSource, cursor: "legacy-cursor", mirrorResultPromise: null,
  matchSnapshotPromise: Promise.resolve({ railFixture: fixture }), tablePromise: Promise.resolve(table) });

test("public overview renders real fixture/table bindings without direct or mirrored social work", async () => {
  for (const locale of ["en-GB", "pt-BR"]) for (const mode of ["direct", "qa-mirror"]) {
    const h = harness(), html = renderToStaticMarkup(await h.render(input(locale, mode)));
    assert.ok(html.includes(locale === "pt-BR" ? "Próximo jogo e tabela oficial" : "Next match and official table"));
    assert.doesNotMatch(html, /club-feed|canal do clube|club channel/);
    const card = h.calls.find(call => call.kind === "fixture")!.props;
    assert.equal(card.startsAt, fixture.startsAt); assert.equal(card.homeScore, 0); assert.equal(card.awayScore, 2); assert.equal(card.liveMinute, 0);
    assert.equal(card.homePosition, 0); assert.equal(card.awayPosition, null);
    assert.equal(card.roundName, fixture.roundName); assert.equal(card.venueName, fixture.venue.name); assert.equal(card.venueImageUrl, "/ground.png");
    assert.equal((card.homeTeam as Props).name, club.name); assert.equal((card.awayTeam as Props).teamId, 20);
    assert.equal(card.initialTimeZone, "Europe/Malta"); assert.equal(card.previewHref, null); assert.equal(card.locale, locale);
    const displayed = h.calls.find(call => call.kind === "table")!.props;
    assert.equal(displayed.table, table); assert.equal(displayed.currentTeamId, 19); assert.equal(displayed.id, "club-table"); assert.equal(displayed.variant, "clubHubRail");
    assert.ok(html.indexOf('data-leaf="fixture"') < html.indexOf('data-leaf="table"'));
  }
});

test("missing fixture and unavailable table remain factual and localized, without a substitute social card", async () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    const h = harness(), absent = { state: "unavailable", rows: [] };
    const html = renderToStaticMarkup(await h.render({ ...input(locale, "direct"), matchSnapshotPromise: Promise.resolve({ railFixture: null }), tablePromise: Promise.resolve(absent) }));
    assert.ok(html.includes('data-state="awaiting"')); assert.ok(html.includes('role="status"'));
    assert.ok(html.includes(locale === "pt-BR" ? "Próxima partida em verificação" : "Next match under verification"));
    assert.equal(h.calls.filter(call => call.kind === "fixture").length, 0);
    assert.equal(h.calls.find(call => call.kind === "table")!.props.table, absent);
  }
});

test("overview awaits only the original football promises and preserves rejection", async () => {
  const h = harness(); let resolveMatch!: (value: Props) => void, resolveTable!: (value: Props) => void, settled = false;
  const result = h.render({ ...input("en-GB", "direct"), matchSnapshotPromise: new Promise<Props>(resolve => { resolveMatch = resolve; }), tablePromise: new Promise<Props>(resolve => { resolveTable = resolve; }) });
  void result.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  resolveTable(table); await Promise.resolve(); assert.equal(settled, false);
  resolveMatch({ railFixture: fixture }); await result;
  await assert.rejects(h.render({ ...input("en-GB", "direct"), tablePromise: Promise.reject(new Error("TABLE_UNAVAILABLE")) }), /TABLE_UNAVAILABLE/);
});

test("page retires only social cursor/imports while retaining football loaders, identity and section order", () => {
  assert.doesNotMatch(source, /readTouchlineClubSocialFeed|loadTouchlineQaMirroredSocialFeed|TouchlineClubSocialFeed|feedCursor|club-feed/);
  assert.match(source, /persistedFeeds/); assert.match(source, /feedTeamBelongsToClub/);
  for (const name of ["ClubHubHeroNextMatch", "ClubHubHomeStadiumIdentity", "ClubHubLineupSection", "ClubHubTechnicalSections", "ClubHubOutsideMatchRoster"]) assert.ok(source.includes(name), name);
  const navigation = source.indexOf("<ClubHubSectionNavigation"), overview = source.indexOf("<ClubHubOfficialLeagueSection", navigation), lineup = source.indexOf("<ClubHubLineupSection", navigation);
  assert.ok(navigation < overview && overview < lineup);
  assert.match(source, /matchSnapshotPromise=\{matchSnapshotPromise\}/); assert.match(source, /tablePromise=\{tablePromise\}/);
});

test("preview geometry is bounded 920px 45/55 and naturally stacked, not a rendered visual proof", () => {
  assert.match(css, /width:\s*min\(920px,\s*100%\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*45fr\) minmax\(0,\s*55fr\)/);
  assert.match(css, /align-items:\s*start/); assert.match(css, /@media \(max-width: 1120px\)[\s\S]*?grid-template-columns:\s*1fr/);
  assert.doesNotMatch(css, /100dvh|height:\s*clamp|\.feed\b/);
  assert.match(css, /--touchline-perimeter-run-color:\s*#a3ff12/);
});
