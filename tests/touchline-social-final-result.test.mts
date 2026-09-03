import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTouchlineFinalResultCaption } from "../lib/touchlineArena/social-final-result-caption.ts";
import { checksumTouchlineFinalResultRenderSource } from "../lib/touchlineArena/social-final-result-render-source.ts";
import {
  classifyTouchlineSocialFinalScoreGoalType,
  touchlineSocialFinalScoreGoalsMatchScore,
} from "../lib/touchlineArena/social-final-score-events.ts";
import { touchlineSocialContentDefinition } from "../lib/touchlineArena/social-content-registry.ts";
import { touchlineSocialRenderPath } from "../lib/touchlineArena/social-publication-contract.ts";
import { readTouchlineSocialTemplateRegistry } from "../lib/touchlineArena/social-template-policy-server.ts";

test("042 registry keeps Feed and Story as separate immutable products", () => {
  assert.deepEqual(touchlineSocialContentDefinition("FULL_TIME"), {
    module: "042", placement: "INSTAGRAM_FEED", width: 1080, height: 1350, scope: "FIXTURE",
  });
  assert.deepEqual(touchlineSocialContentDefinition("FINAL_SCORE"), {
    module: "042", placement: "INSTAGRAM_STORY", width: 1080, height: 1920, scope: "FIXTURE",
  });
  assert.equal(touchlineSocialRenderPath({ fixtureId: "19722186", teamId: null,
    contentType: "FULL_TIME", locale: "en-GB", revision: 2 }),
  "/visual-qa/social-full-time?fixtureId=19722186&locale=en-GB&revision=2");
  assert.equal(touchlineSocialRenderPath({ fixtureId: "19722186", teamId: null,
    contentType: "FINAL_SCORE", locale: "en-GB", revision: 2 }),
  "/visual-qa/social-final-score?fixtureId=19722186&locale=en-GB&revision=2");
});

test("goal classifier accepts only exact final football facts and reconciles the score", () => {
  assert.equal(classifyTouchlineSocialFinalScoreGoalType("Goal"), "goal");
  assert.equal(classifyTouchlineSocialFinalScoreGoalType("Own Goal"), "own-goal");
  assert.equal(classifyTouchlineSocialFinalScoreGoalType("Penalty"), "penalty");
  assert.equal(classifyTouchlineSocialFinalScoreGoalType("VAR"), null);
  assert.equal(touchlineSocialFinalScoreGoalsMatchScore([
    { teamId: "9" }, { teamId: "9" }, { teamId: "116" },
  ], { homeTeamId: "9", awayTeamId: "116", homeScore: 2, awayScore: 1 }), true);
  assert.equal(touchlineSocialFinalScoreGoalsMatchScore([
    { teamId: "9" }, { teamId: "116" },
  ], { homeTeamId: "9", awayTeamId: "116", homeScore: 2, awayScore: 1 }), false);
});

test("British English caption is factual, rating-specific and public-source safe", () => {
  const result = buildTouchlineFinalResultCaption({
    homeName: "Manchester United", awayName: "Ipswich Town", homeScore: 5, awayScore: 2,
    venueName: "Old Trafford", gameweekNumber: 2, topCardName: "Bruno Fernandes",
    officialMatchRating: 10,
    goals: [
      { playerName: "Player One", minute: 4, extraMinute: null, kind: "goal" },
      { playerName: "Player Two", minute: 12, extraMinute: null, kind: "own-goal" },
      { playerName: "Player Three", minute: 40, extraMinute: null, kind: "goal" },
      { playerName: "Bruno Fernandes", minute: 61, extraMinute: null, kind: "penalty" },
      { playerName: "Bruno Fernandes", minute: 68, extraMinute: null, kind: "goal" },
      { playerName: "Player Four", minute: 75, extraMinute: null, kind: "goal" },
      { playerName: "Player Five", minute: 90, extraMinute: 2, kind: "goal" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.caption, /Full Time/);
  assert.match(result.caption, /61' PEN/);
  assert.match(result.caption, /12' OG/);
  assert.match(result.caption, /Official Match Rating 10\.00/);
  assert.doesNotMatch(result.caption, /TouchLine Points|SportMonks|API|provider|pipeline|settlement/i);
  assert.equal(result.caption.match(/#[A-Za-z0-9]+/g)?.length, 5);
});

test("semantic checksum ignores observation timestamps but changes with score or rating", () => {
  const base = { fixtureId: "19722186", capturedAt: "2026-08-30T17:00:00Z",
    sourceSnapshotAt: "2026-08-30T17:00:01Z", score: { home: 5, away: 2 }, rating: 10 };
  assert.equal(checksumTouchlineFinalResultRenderSource(base), checksumTouchlineFinalResultRenderSource({
    ...base, capturedAt: "2026-08-30T17:02:00Z", sourceSnapshotAt: "2026-08-30T17:02:01Z",
  }));
  assert.notEqual(checksumTouchlineFinalResultRenderSource(base), checksumTouchlineFinalResultRenderSource({
    ...base, score: { home: 4, away: 2 },
  }));
  assert.notEqual(checksumTouchlineFinalResultRenderSource(base), checksumTouchlineFinalResultRenderSource({ ...base, rating: 9.99 }));
});

test("042 SQL preserves 039/040/041, exact identities, owner boundary and outbound hold", () => {
  const migration = readFileSync(new URL("../supabase/qa/042_touchline_qa_social_final_result.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/042_touchline_qa_social_final_result_rollback.sql", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/social/TouchlineSocialFinalScoreDraft.tsx", import.meta.url), "utf8");
  assert.match(migration, /content_type in \('FULL_TIME', 'FINAL_SCORE'\)/);
  assert.match(migration, /touchline-full-time-feed-v1/);
  assert.match(migration, /touchline-final-score-story-v1/);
  assert.match(migration, /touchline_social_041_assert_approval_gate/);
  assert.match(migration, /touchline_social_assert_executor_approval_gate/);
  assert.match(migration, /revoke all on function public\.touchline_social_042_issue_review_intent[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_social_042_approve[\s\S]*authenticated/);
  assert.doesNotMatch(migration, /TOUCHLINE_OFFICIAL_INSTAGRAM|enqueue_dispatch|Meta/i);
  assert.match(rollback, /touchline_social_drafts_041_content_type_check/);
  assert.match(rollback, /touchline_social_041_assert_approval_gate/);
  assert.doesNotMatch(component, /FIXTURE \{draft\.fixtureId\}/);
  assert.match(component, /GAMEWEEK \{draft\.gameweekNumber\}/);
});

test("042 owner visual review is non-publishable and does not weaken the canonical reader", () => {
  const page = readFileSync(new URL("../app/visual-qa/social-full-time/page.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/visual-qa/social-full-time/preview-draft.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/social/TouchlineSocialFinalScoreDraft.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/social/TouchlineSocialFinalScoreDraft.module.css", import.meta.url), "utf8");
  assert.match(page, /VERCEL_ENV === "production"/);
  assert.match(page, /LOCAL VISUAL QA · SAMPLE DATA · NOT PUBLISHED/);
  assert.match(page, /readTouchlineSocialFinalScoreDraft/);
  assert.match(preview, /LOCAL_NON_PUBLISHABLE_VISUAL_QA/);
  assert.match(preview, /readClubHubNextFixturePreview/);
  assert.match(preview, /never enter[\s\S]*canonical 042 reader[\s\S]*outbound queue/);
  assert.match(component, /data-source-provenance/);
  assert.match(component, /Final wording will be generated only from the verified 042 reader/);
  assert.match(component, /OUTBOUND DISABLED/);
  assert.match(component, /className=\{styles\.scoreline\}/);
  assert.match(component, /tl-shield-lime\.svg/);
  assert.doesNotMatch(component, /SAMPLE RESULT/);
  assert.doesNotMatch(component, /<i>—<\/i>/);
  assert.match(css, /touchline-score-neon-orbit/);
  assert.match(css, /mask-composite:\s*exclude/);
  assert.match(css, /\.scoreline i[\s\S]*justify-self:\s*center/);
  assert.doesNotMatch(css, /\.scoreline b[^}]*background/);
  assert.doesNotMatch(css, /\.club > div[^}]*border-radius:\s*50%/);
});

test("042 approved artwork is locked to the reviewed local template checksum", async () => {
  const approval = readFileSync(new URL("../docs/touchline-arena/social-publishing-playbook/042_FULL_TIME_OWNER_ART_APPROVAL.md", import.meta.url), "utf8");
  const registry = await readTouchlineSocialTemplateRegistry(new URL("..", import.meta.url).pathname);
  const fullTime = registry.find((row) => row.templateVersion === "touchline-full-time-feed-v1");
  assert.ok(fullTime);
  assert.match(approval, new RegExp(fullTime.visualTemplateChecksum.replace(":", "\\:")));
  assert.match(approval, /Caption approval: \*\*PENDING/);
  assert.match(approval, /Outbound: \*\*DISABLED/);
});
