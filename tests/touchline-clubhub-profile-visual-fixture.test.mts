import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ClubHub profile visual fixture stays static, local and split between confirmed and pending sheets", () => {
  const source = readFileSync(
    new URL("../app/visual-qa/clubhub-profile-contract/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /data-clubhub-profile-fixture=\{pending \? "pending-static" : "confirmed-static"\}/);
  assert.match(source, /buildTouchLineClubMatchdayPresentation/);
  assert.match(source, /Array\.from\(\{ length: 11 \}/);
  assert.match(source, /Array\.from\(\{ length: 9 \}/);
  assert.match(source, /officialCoach: pending[\s\S]*?\? null[\s\S]*?Static Official Coach/);
  assert.match(source, /ClubHubMatchdayTechnicalArea/);
  assert.match(source, /ClubHubOutsideMatchRoster/);
  assert.match(source, /TouchlineOfficialLeagueTable/);
  assert.match(source, /resolveTouchlineVisualQaLocale/);
  assert.match(source, /data-visual-qa-locale=\{locale\}/);
  assert.match(source, /locale=\{locale\}/);
  assert.match(source, /<ClubHubOfficialLineup[\s\S]*?staticVisualQa/);
  assert.match(source, /fixtures: \[\]/);
  assert.match(source, /390PX MOBILE · PENDING MATCHDAY SHEET/);
  assert.match(source, /390PX MOBILE · FICHA DE JOGO PENDENTE/);
  assert.match(source, /src=\{`\/visual-qa\/clubhub-profile-contract\?state=pending&viewport=mobile&lang=\$\{locale\}`\}/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /create(?:Admin)?Client|supabase|createFootballDataProvider|providers\/sportmonks|process\.env|market-value-import|wallet/i);
});

test("the ClubHub line-up can isolate the static fixture from ranking activity", () => {
  const source = readFileSync(
    new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /staticVisualQa = false/);
  assert.match(source, /subscribeToRanking=\{!staticVisualQa\}/);
  assert.match(source, /enableInteractiveNeon=\{!staticVisualQa\}/);
  assert.match(source, /rankingMode=\{staticVisualQa \? "preview" : "live"\}/);
});

test("the nine-card bench is a premium responsive card rail", () => {
  const css = readFileSync(
    new URL("../components/touchline/ClubHubMatchdayTechnicalArea.module.css", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /TouchlineEliteExactCard/);
  assert.match(component, /technical\.previewBench/);
  assert.match(component, /\.slice\(0, 9\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(9, minmax\(74px, 1fr\)\)/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
});
