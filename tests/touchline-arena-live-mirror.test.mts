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
  assert.match(owner, /key=\{code\} disabled=\{!editable \|\| saving \|\| !selectedCoach \|\| \(collectionEnabled && !collectionSlotsEditable\)\} aria-pressed=\{formationCode === code\}/);
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
test("authenticated ClubOwner seeds the embedded Live rail from the same persisted selection as ClubHub", () => {
  const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!user\) redirect\([\s\S]*?readPersistedLiveRailWithin\(\)/);
  assert.doesNotMatch(page, /readPublicCompetitionFixtures|scheduleNow/);
  assert.match(owner, /state: "partial-persisted-schedule", degraded: true/);
  const assertProps = (input: string, component: string, expected: Record<string, string>) => {
    const ast = ts.createSourceFile("consumer.tsx", input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const elements: Array<ts.JsxSelfClosingElement | ts.JsxOpeningElement> = [];
    const visit = (node: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(ast) === component) elements.push(node);
      node.forEachChild(visit);
    };
    visit(ast);
    assert.equal(elements.length, 1, `${component} has one authoritative seed consumer`);
    for (const [name, expression] of Object.entries(expected)) {
      const attributes = elements[0].attributes.properties.filter((attribute): attribute is ts.JsxAttribute =>
        ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === name);
      assert.equal(attributes.length, 1, `${component}.${name} is passed exactly once`);
      const initializer = attributes[0].initializer;
      assert.ok(initializer && ts.isJsxExpression(initializer) && initializer.expression, `${component}.${name} uses the seed expression`);
      assert.equal(initializer.expression.getText(ast), expression, `${component}.${name} preserves server authority`);
    }
  };
  assertProps(page, "FantasyGameweekClient", { initialLiveFixtures: "initialLiveFixtures", initialLiveNow: "initialLiveNow", initialLiveMetadata: "initialLiveMetadata" });
  assertProps(owner, "ClubHubFixtureStrip", { initialFixtures: "initialLiveFixtures", initialNow: "initialLiveNow", initialMetadata: "initialLiveMetadata", initialAdmissionScope: "initialLiveAdmissionScope" });
  assert.doesNotMatch(owner, /<TouchlineMatchCentre railOnly initialFixtures=\{\[\]\}/);
});
test("ClubOwner and Arena reuse one shared strip above reserves, without a second match centre", () => {
  assert.equal(source.match(/<TouchlineFixtureAlerts /g)?.length, 1);
  assert.equal(source.match(/className=\{styles.fixtureList\}/g)?.length, 1);
  assert.match(source, /if \(railOnly\) return fixtureRail/);
  assert.match(source, /if \(railOnly \|\| !canReadMatchDetail\) return/);
  const ast = ts.createSourceFile("owner.tsx", owner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const strips: ts.JsxSelfClosingElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "ClubHubFixtureStrip") strips.push(node);
    node.forEachChild(visit);
  };
  visit(ast);
  assert.equal(strips.length, 1, "Normal and Arena share a single instance");
  const rail = strips[0].parent;
  assert.ok(ts.isJsxElement(rail));
  assert.match(rail.openingElement.getText(ast), /data-clubowner-live-position="above-reserves"/);
  const body = rail.parent;
  assert.ok(ts.isJsxElement(body));
  assert.match(body.openingElement.getText(ast), /styles.arenaBody/);
  const rows = body.children.filter(ts.isJsxElement);
  assert.equal(rows[0], rail);
  assert.match(rows[1].openingElement.getText(ast), /styles.myClubPitchViewport/);
  assert.match(rows[1].getText(ast), /<ClubOwnerTechnicalRail[\s\S]*area="reserves"/);
  assert.ok(owner.lastIndexOf("<ArenaView", strips[0].pos) >= 0, "Same rail belongs to the Arena subtree");
  assert.doesNotMatch(owner, /<TouchlineMatchCentre\b/);
});
test("Live retains results and feed notices while ClubOwner passes the shared degradation metadata", () => {
  assert.match(source, /hideRecentResults = false/);
  assert.match(source, /!hideRecentResults \? \[\{ id: "results" as const, label: dictionary\.recentResults, fixtures: schedule\.recentResults \}/);
  assert.match(owner, /initialMetadata=\{initialLiveMetadata\}/);
  const strip = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
  assert.match(strip, /const caution = failed \|\| metadata\?\.degraded/);
  assert.match(strip, /caution \? <p[^>]+role="status">\{cautionText\}/);
  assert.match(strip, /state === "partial-persisted-schedule" \? copy.partialScheduleCopy : copy.liveDataUpdatingCopy/);
  assert.doesNotMatch(source, /!railOnly \? <div><dt>\{dictionary\.recentResults\}/);
  assert.match(source, /railOnly && readMetadata\?\.degraded \? <p className=\{styles\.railFreshness\} role="status"/);
  assert.match(source, /readMetadata\.state === "partial-persisted-schedule" \? dictionary\.partialScheduleCopy : dictionary\.liveDataUpdatingCopy/);
});
test("the shared strip owns a full-width row without shrinking the normal pitch", () => {
  const sharedRail = marketCss.match(/\.myClubCommand\[data-fantasy-context="market"\] \.arenaLiveRail \{([^}]+)\}/)?.[1] ?? "";
  assert.match(sharedRail, /width:\s*100%/);
  assert.match(sharedRail, /min-width:\s*0/);
  assert.match(sharedRail, /margin:\s*0/);
  assert.match(sharedRail, /overflow:\s*visible/);
  assert.match(marketCss, /\.myClubCommand\[data-fantasy-context="market"\] \.arenaBody \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
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
