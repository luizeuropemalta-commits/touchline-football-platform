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
  assert.match(source, /fixtures: \[\]/);
  assert.match(source, /390PX MOBILE · PENDING MATCHDAY SHEET/);
  assert.match(source, /src="\/visual-qa\/clubhub-profile-contract\?state=pending&viewport=mobile"/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /create(?:Admin)?Client|supabase|createFootballDataProvider|providers\/sportmonks|process\.env|market-value-import|wallet/i);
});
