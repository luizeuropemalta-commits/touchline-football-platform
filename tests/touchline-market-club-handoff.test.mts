import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");

test("a new club hand-off reconciles only the filter after mount", () => {
  const start = source.indexOf("// A new ClubHub link");
  const end = source.indexOf("const [coachClubTeamId", start);
  assert.ok(start >= 0 && end > start, "handoff reconciliation remains isolated beside its filter state");
  const handoffEffect = source.slice(start, end);
  assert.match(handoffEffect, /useEffect\(\(\) => \{/);
  assert.match(handoffEffect, /initialPlayerClubTeamId/);
  assert.match(handoffEffect, /applyPlayerClubTeamId\(\(current\) => current === nextClubTeamId \? current : nextClubTeamId\)/);
  assert.doesNotMatch(source, /previousClubHandoff|setPreviousClubHandoff/);
  assert.doesNotMatch(handoffEffect, /setSelections|setSelectedCoachId|setFormationCode/);
});
