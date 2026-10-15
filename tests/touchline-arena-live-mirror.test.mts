import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const owner = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const marketCss = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
test("formation selection keeps the large coach beside options and preserves canonical zoom", () => {
  const picker = owner.slice(owner.indexOf("const formationPicker ="), owner.indexOf("return <section", owner.indexOf("const formationPicker =")));
  assert.match(picker, /className=\{styles\.formationCoachPreview\}[\s\S]*?<FantasyCoachZoom entry=\{selectedCoach\}/);
  assert.match(picker, /className=\{styles\.formationChoices\}/);
  assert.match(marketCss, /\.formationSelectionPanel \{[^}]*grid-template-columns: clamp\(120px, 18vw, 230px\) minmax\(0, 1fr\)/);
  assert.match(marketCss, /:has\(\.formationPicker\[open\]\) > \.technicalCoachCard \{ display: none; \}/);
});
test("formation handler refuses changes while a previous save is pending", () => {
  const ast = ts.createSourceFile("owner.tsx", owner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === "changeFormation") handler = node; node.forEachChild(visit); };
  visit(ast); assert.ok(handler);
  const code = ts.transpileModule(handler.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  // Mutation dependencies are deliberately absent: reaching any of them must fail.
  runInNewContext(`${code}; changeFormation("4-4-2");`, {
    snapshot: { formationRegistry: { "4-4-2": { slots: [] } } }, editable: true, saving: true,
  });
  // Selecting the current formation must return before any slot remapping or
  // state setter, even when editing is otherwise allowed.
  runInNewContext(`${code}; changeFormation("4-4-2");`, {
    snapshot: { formationRegistry: { "4-4-2": { slots: [] } } }, editable: true, saving: false, formationCode: "4-4-2",
  });
  assert.match(owner, /key=\{code\} disabled=\{!editable \|\| saving\} aria-pressed=\{formationCode === code\}/);
  assert.doesNotMatch(owner, /id="arena-formation-select"/);
});
test("current fixtures show their own weekday while historical and accessible dates remain complete", () => {
  assert.match(source, /isResultSection\s*\? touchlineFixtureRailDateLabel\([\s\S]*?: fixtureDate\(fixture, language, timeZone, \{ weekday: "short" \}, draftLocalesEnabled\)/);
  assert.match(source, /aria-label=\{fixtureDate\(fixture, language, timeZone, \{ weekday: "long", day: "numeric", month: "long", year: "numeric"/);
  const ast = ts.createSourceFile("live.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const formatter = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "fixtureDate");
  assert.ok(formatter);
  const code = ts.transpileModule(formatter.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { resolveTouchlineCatalogueLocale: (locale: string) => locale };
  for (const [date, expected] of [["2026-10-09T12:00:00Z", "sex."], ["2026-10-12T12:00:00Z", "seg."]]) {
    assert.equal(runInNewContext(`${code}; fixtureDate({startsAt: "${date}"}, "pt-BR", "UTC", {weekday:"short"});`, context), expected);
  }
});
test("shared smaller bell preserves the touch target", () => {
  const css = readFileSync(new URL("../components/touchline/match-centre/TouchlineFixtureAlerts.module.css", import.meta.url), "utf8");
  assert.match(css, /button \{[^}]*width: 44px/);
  assert.match(css, /button svg \{[^}]*width: 14px; height: 14px/);
});
test("Arena receives the same server time-zone policy as Live", () => {
  const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
  assert.match(page, /normalizeTouchlineMatchCentreTimeZone\(\(await headers\(\)\)\.get\("x-vercel-ip-timezone"\)\)/);
  assert.match(page, /liveTimeZone=\{liveTimeZone\}/);
  assert.match(owner, /initialTimeZone=\{liveTimeZone\}/);
});
test("authenticated ClubOwner seeds the embedded Live rail from the complete persisted fixture schedule", () => {
  const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!user\) redirect\([\s\S]*?readPublicCompetitionFixtures\(\{\s*includeHistorical: true, limit: 240/);
  assert.match(page, /from: new Date\(scheduleNow - 7 \* 86_400_000\)/);
  assert.match(page, /through: new Date\(scheduleNow \+ 14 \* 86_400_000\)/);
  assert.match(owner, /state: "partial-persisted-schedule", degraded: true/);
  assert.match(page, /initialLiveFixtures=\{initialLiveFixtures\} initialLiveNow=\{initialLiveNow\}/);
  assert.match(owner, /initialFixtures=\{initialLiveFixtures\} initialNow=\{initialLiveNow\}/);
  assert.doesNotMatch(owner, /<TouchlineMatchCentre railOnly initialFixtures=\{\[\]\}/);
});
test("Arena and Live reuse one fixture rail and existing alerts, with detail disabled in Arena", () => {
  assert.equal(source.match(/<TouchlineFixtureAlerts /g)?.length, 1);
  assert.equal(source.match(/className=\{styles.fixtureList\}/g)?.length, 1);
  assert.match(source, /if \(railOnly\) return fixtureRail/);
  assert.match(source, /if \(railOnly \|\| !canReadMatchDetail\) return/);
  assert.match(owner, /\(arenaOpen \|\| marketPage\) \? <div className=\{styles.arenaLiveRail\}>/);
  assert.match(owner, /<TouchlineMatchCentre railOnly/);
});
test("ClubOwner rail includes the latest results and explains a degraded persisted score feed", () => {
  assert.match(source, /\{ id: "results", label: dictionary\.recentResults, fixtures: schedule\.recentResults \}/);
  assert.doesNotMatch(source, /!railOnly \? <div><dt>\{dictionary\.recentResults\}/);
  assert.match(source, /railOnly && readMetadata\?\.degraded \? <p className=\{styles\.railFreshness\} role="status"/);
  assert.match(source, /readMetadata\.state === "partial-persisted-schedule" \? dictionary\.partialScheduleCopy : dictionary\.liveDataUpdatingCopy/);
});
test("the normal ClubOwner Live rail sits closer to the technical-area line without resizing the pitch", () => {
  const normalRail = marketCss.match(/\.myClubCommand\[data-fantasy-context="market"\]:not\(\.arenaOverlay\) \.arenaLiveRail \{([^}]+)\}/)?.[1] ?? "";
  assert.ok(normalRail.includes("margin-top: 88px"));
  assert.ok(normalRail.includes("overflow: auto"));
  assert.match(marketCss, /\.myClubPitchViewport \.myClubTacticalPitch \{ width: calc\(100% - 32px\);[^}]+aspect-ratio: 105 \/ 68/);
});
test("Arena match click opens the selected Live fixture without changing the lineup", () => {
  const ast = ts.createSourceFile("live.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === "selectFixture") handler = node; node.forEachChild(visit); };
  visit(ast); assert.ok(handler);
  const destinations: string[] = [];
  const code = ts.transpileModule(`${handler.getText(ast)}; selectFixture({id:"fixture 42"});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { railOnly: true, language: "pt-BR", window: { location: { assign: (url: string) => destinations.push(url) } } });
  assert.deepEqual(destinations, ["/live?lang=pt-BR&fixture=fixture%2042"]);
});
