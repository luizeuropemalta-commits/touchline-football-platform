import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyTouchlineConfirmedMatchEvent,
  countTouchlineConfirmedHatTrickGoals,
  formatTouchlineConfirmedEventMinute,
  parseTouchlineEventScore,
  touchlineConfirmedHatTrickGoalFact,
} from "../lib/touchlineArena/social-confirmed-event-contract.ts";
import { buildTouchlineConfirmedEventCaption } from "../lib/touchlineArena/social-confirmed-event-caption.ts";
import { checksumTouchlineConfirmedEventRenderSource } from "../lib/touchlineArena/social-confirmed-event-render-source.ts";
import {
  isTouchlineSocialContentTypeEnabledInModule,
  touchlineSocialContentDefinition,
} from "../lib/touchlineArena/social-content-registry.ts";

test("043 registry owns the complete goal family and the dismissal Story", () => {
  assert.deepEqual(touchlineSocialContentDefinition("GOAL_CONFIRMED"), {
    module: "043",
    placement: "INSTAGRAM_FEED",
    width: 1080,
    height: 1350,
    scope: "FIXTURE_EVENT",
  });
  assert.deepEqual(touchlineSocialContentDefinition("HAT_TRICK_HERO"), {
    module: "043",
    placement: "INSTAGRAM_FEED",
    width: 1080,
    height: 1350,
    scope: "FIXTURE_EVENT",
  });
  assert.deepEqual(touchlineSocialContentDefinition("RED_CARD_CONFIRMED"), {
    module: "043",
    placement: "INSTAGRAM_STORY",
    width: 1080,
    height: 1920,
    scope: "FIXTURE_EVENT",
  });
  assert.equal(isTouchlineSocialContentTypeEnabledInModule("GOAL_CONFIRMED", "043"), true);
  assert.equal(isTouchlineSocialContentTypeEnabledInModule("HAT_TRICK_HERO", "043"), true);
  assert.equal(isTouchlineSocialContentTypeEnabledInModule("LINEUP", "043"), false);
});

test("043 hat-trick facts count only a player's confirmed goals and penalties", () => {
  const goal = touchlineConfirmedHatTrickGoalFact({
    playerId: "28931574", type: "GOAL", status: "recorded", info: null, addition: null,
  });
  const penalty = touchlineConfirmedHatTrickGoalFact({
    playerId: "28931574", type: "PENALTY", status: "recorded", info: null, addition: null,
  });
  assert.deepEqual(goal, { playerId: "28931574", kind: "goal" });
  assert.deepEqual(penalty, { playerId: "28931574", kind: "penalty" });
  assert.equal(touchlineConfirmedHatTrickGoalFact({
    playerId: "28931574", type: "OWNGOAL", status: "recorded", info: null, addition: null,
  }), null);
  assert.equal(countTouchlineConfirmedHatTrickGoals([
    { playerId: "28931574", kind: "goal" },
    { playerId: "28931574", kind: "penalty" },
    { playerId: "28931574", kind: "goal" },
    { playerId: "111", kind: "goal" },
    { playerId: "28931574", kind: "own-goal" },
  ], "28931574"), 3);
});

test("goal classifier accepts only scored goals and rejects every VAR or pending state", () => {
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "GOAL", status: "recorded", info: null, addition: null }), "goal");
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "OWNGOAL", status: "recorded", info: null, addition: null }), "own-goal");
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "PENALTY", status: "recorded", info: null, addition: null }), "penalty");
  for (const type of ["GOAL_UNDER_REVIEW", "GOAL_DISALLOWED", "GOAL_CANCELLED", "VAR", "MISSED_PENALTY"]) {
    assert.equal(classifyTouchlineConfirmedMatchEvent({ type, status: "recorded", info: null, addition: null }), null);
  }
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "GOAL", status: "rescinded", info: null, addition: null }), null);
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "GOAL", status: "recorded", info: "VAR check", addition: null }), null);
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "GOAL", status: "recorded", info: null, addition: "pending" }), null);
});

test("own goal reuses 043 and is visibly distinguished from a standard goal", () => {
  const renderer = readFileSync(new URL("../components/touchline/social/TouchlineSocialConfirmedEventDraft.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/visual-qa/social-confirmed-event/preview-draft.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/visual-qa/social-confirmed-event/page.tsx", import.meta.url), "utf8");
  assert.match(renderer, /draft\.event\.kind === "own-goal" \? "OWN GOAL"/);
  assert.match(preview, /scoringTeamId: draft\.away\.club\.teamId/);
  assert.match(preview, /playerTeamId: draft\.home\.club\.teamId/);
  assert.match(page, /design === "own-goal"/);
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "OWNGOAL", status: "recorded", info: null, addition: null }), "own-goal");
});

test("red-card classifier requires an explicit canonical dismissal type", () => {
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "REDCARD", status: "recorded", info: "Serious foul play", addition: null }), "red-card");
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "YELLOWREDCARD", status: "recorded", info: null, addition: null }), "second-yellow-red");
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "YELLOWCARD", status: "recorded", info: null, addition: null }), null);
  assert.equal(classifyTouchlineConfirmedMatchEvent({ type: "VAR_CARD", status: "recorded", info: null, addition: null }), null);
});

test("event result parser and minute formatter are exact and fail closed", () => {
  assert.deepEqual(parseTouchlineEventScore("2-1"), { home: 2, away: 1 });
  assert.deepEqual(parseTouchlineEventScore(" 0 – 1 "), { home: 0, away: 1 });
  assert.equal(parseTouchlineEventScore("1"), null);
  assert.equal(parseTouchlineEventScore("pending"), null);
  assert.equal(formatTouchlineConfirmedEventMinute(90, 6), "90+6'");
  assert.equal(formatTouchlineConfirmedEventMinute(40, null), "40'");
});

test("043 British-English captions are event-specific and source-neutral", () => {
  const goal = buildTouchlineConfirmedEventCaption({
    contentType: "GOAL_CONFIRMED",
    homeName: "Aston Villa",
    awayName: "Arsenal FC",
    score: { home: 1, away: 0 },
    playerName: "Ollie Watkins",
    eventTeam: "home",
    minute: 40,
    extraMinute: null,
    eventKind: "goal",
    totalRating: 14.22,
    matchRating: 8.1,
    touchlinePoints: 5,
    gameweekNumber: 2,
  });
  assert.equal(goal.ok, true);
  if (goal.ok) {
    assert.match(goal.caption, /GOALLLLLLL ⚽/);
    assert.match(goal.caption, /Aston Villa 1–0 Arsenal FC/);
    assert.match(goal.caption, /Ollie Watkins puts Aston Villa in front at 40'/);
    assert.match(goal.caption, /Total Rating 14\.22/);
    assert.match(goal.caption, /Match Rating 8\.10/);
    assert.match(goal.caption, /TouchLine Points \+5/);
    assert.match(goal.caption, /TouchLine Verified Match Data/);
    assert.doesNotMatch(goal.caption, /sportmonks|\bapi\b|\bprovider\b|\bpipeline\b/i);
  }

  const red = buildTouchlineConfirmedEventCaption({
    contentType: "RED_CARD_CONFIRMED",
    homeName: "Aston Villa",
    awayName: "Arsenal FC",
    score: { home: 1, away: 1 },
    playerName: "Example Player",
    eventTeam: "away",
    minute: 72,
    extraMinute: null,
    eventKind: "second-yellow-red",
    totalRating: 7.4,
    matchRating: 5.8,
    touchlinePoints: -3,
    gameweekNumber: 2,
  });
  assert.equal(red.ok, true);
  if (red.ok) assert.match(red.caption, /Red card confirmed 🟥[\s\S]*second yellow/);
});

test("event semantic checksum ignores observation timestamps but changes with event facts", () => {
  const base = {
    fixtureId: "19722192",
    eventId: "90001",
    eventKind: "goal",
    score: { home: 1, away: 0 },
    sourceSnapshotAt: "2026-08-31T19:40:00.000Z",
    firstObservedAt: "2026-08-31T19:40:00.000Z",
  };
  assert.equal(
    checksumTouchlineConfirmedEventRenderSource(base),
    checksumTouchlineConfirmedEventRenderSource({
      ...base,
      sourceSnapshotAt: "2026-08-31T19:41:00.000Z",
      firstObservedAt: "2026-08-31T19:40:30.000Z",
    }),
  );
  assert.notEqual(
    checksumTouchlineConfirmedEventRenderSource(base),
    checksumTouchlineConfirmedEventRenderSource({ ...base, score: { home: 1, away: 1 } }),
  );
});

test("043 source and migration preserve prior modules and keep outbound blocked", () => {
  const reader = readFileSync(new URL("../lib/touchlineArena/social-confirmed-event-draft-server.ts", import.meta.url), "utf8");
  const candidates = readFileSync(new URL("../scripts/qa/touchline-social-confirmed-event-candidates.mts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/social/TouchlineSocialConfirmedEventDraft.tsx", import.meta.url), "utf8");
  const scoreboard = readFileSync(new URL("../components/touchline/social/TouchlineSocialFixtureScoreboard.tsx", import.meta.url), "utf8");
  const scoreboardStyles = readFileSync(new URL("../components/touchline/social/TouchlineSocialFixtureScoreboard.module.css", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/qa/043_touchline_qa_social_confirmed_events.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/043_touchline_qa_social_confirmed_events_rollback.sql", import.meta.url), "utf8");
  assert.match(reader, /football_fixture_events/);
  assert.match(reader, /touchline_player_fixture_score_settlements/);
  assert.match(reader, /readPublicSeasonPlayerPoints/);
  assert.match(reader, /String\(row\.ruleCode \?\? ""\) === "sportmonks-rating"/);
  assert.match(reader, /ratingContributionMatches/);
  assert.doesNotMatch(reader, /function eventContributionPresent/);
  assert.match(reader, /event-status-not-confirmed|event-fact-not-stable|event-score-conflict/);
  assert.match(reader, /touchlineFixtureState\(\{ startsAt, status:/);
  assert.doesNotMatch(reader, /fetch\s*\(/);
  assert.match(candidates, /EVENT_FRESHNESS_MS = 15 \* 60 \* 1000/);
  assert.match(candidates, /EVENT_DISCOVERY_MAX_ROWS = 2_000/);
  assert.match(candidates, /\.range\(offset, offset \+ EVENT_DISCOVERY_PAGE_SIZE - 1\)/);
  assert.match(candidates, /confirmedFactByIdentity/);
  assert.match(component, /import \{ Goal, ShieldCheck \} from "lucide-react"/);
  assert.match(component, /styles\.redCardIcon/);
  assert.match(component, /draft\.event\.kind === "own-goal" \? "OWN GOALLLLLL" : "GOALLLLLLL"/);
  assert.match(component, /className=\{goal \? styles\.celebrationWord : undefined\}/);
  assert.match(component, /data-word=\{goal \?/);
  assert.match(component, /<h2>\{draft\.event\.playerName\}<\/h2>/);
  assert.match(component, /<strong className=\{styles\.eventLabel\}>/);
  assert.match(component, /<dl className=\{styles\.metrics\}>/);
  assert.match(component, /TouchlineSocialFixtureScoreboard/);
  assert.match(component, /mode="score"/);
  assert.match(scoreboard, /<i>\{props\.homeScore\}<\/i><em>-<\/em><i>\{props\.awayScore\}<\/i>/);
  assert.match(scoreboardStyles, /\.event \.clubIdentity img \{ width: 65px; height: 65px; \}/);
  assert.match(component, /draft\.home\.logoUrl/);
  assert.match(component, /draft\.away\.logoUrl/);
  assert.doesNotMatch(component, /⚽|🟥/);
  assert.match(migration, /content_type in \('GOAL_CONFIRMED', 'RED_CARD_CONFIRMED'\)/);
  assert.match(migration, /event_provider_id/);
  assert.match(migration, /touchline_social_043_assert_approval_gate/);
  assert.match(migration, /touchline_social_require_owner_actor/);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all privileges/i);
  assert.match(migration, /TL_SOCIAL_CONFIRMED_EVENT_DISPATCH_DISABLED/);
  assert.match(rollback, /TL_SOCIAL_043_ROLLBACK_NONEMPTY/);
  assert.match(rollback, /MATCH_PREVIEW/);
  assert.match(rollback, /FULL_TIME/);
  assert.match(rollback, /FINAL_SCORE/);
});

test("043 owner visual proof is local-only and cannot weaken the canonical reader", () => {
  const page = readFileSync(new URL("../app/visual-qa/social-confirmed-event/page.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/visual-qa/social-confirmed-event/preview-draft.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/social/TouchlineSocialConfirmedEventDraft.tsx", import.meta.url), "utf8");
  assert.match(page, /process\.env\.VERCEL_ENV === "production"\) notFound\(\)/);
  assert.match(page, /params\.design === "goal"/);
  assert.match(page, /data-confirmed-event-visual-qa="non-publishable"/);
  assert.match(page, /draft=\{preview\} placement="feed"/);
  assert.match(preview, /LOCAL_NON_PUBLISHABLE_VISUAL_QA/);
  assert.match(preview, /LOCAL VISUAL QA ONLY/);
  assert.doesNotMatch(preview, /createAdminClient|fetch\s*\(|touchline_social_publication_queue/);
  assert.match(component, /data-source-provenance/);
  assert.match(component, /LOCAL VISUAL QA · NON-PUBLISHABLE/);
  assert.match(component, /OUTBOUND DISABLED/);
});

test("043 offers an isolated João Pedro goal demo in the approved Hat-trick composition", () => {
  const page = readFileSync(new URL("../app/visual-qa/social-confirmed-event/page.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/visual-qa/social-confirmed-event/preview-draft.ts", import.meta.url), "utf8");
  const demo = readFileSync(new URL("../components/touchline/social/TouchlineSocialGoalHatLayoutDemo.tsx", import.meta.url), "utf8");
  const snapshot = JSON.parse(readFileSync(new URL("../app/visual-qa/social-confirmed-event/joao-pedro-brighton-canonical-snapshot.json", import.meta.url), "utf8"));

  assert.match(page, /params\.design === "goal-hat-layout"/);
  assert.match(page, /TouchlineSocialGoalHatLayoutDemo/);
  assert.match(preview, /readTouchlineGoalHatLayoutVisualQaPreview/);
  assert.match(preview, /joaoPedroBrighton\.event\.scoreAfterEvent/);
  assert.match(preview, /candidate\.homeTeamProviderId === joaoPedroBrighton\.fixture\.homeTeamId/);
  assert.match(preview, /seasonStats: joaoPedroBrighton\.settlement\.seasonStats/);
  assert.equal(snapshot.source.provider, "sportmonks");
  assert.equal(snapshot.fixture.providerFixtureId, "19722191");
  assert.equal(snapshot.fixture.homeTeamId, "18");
  assert.equal(snapshot.fixture.awayTeamId, "78");
  assert.deepEqual(snapshot.event.scoreAfterEvent, { home: 3, away: 0 });
  assert.equal(snapshot.event.playerProviderId, "28931574");
  assert.equal(snapshot.event.minute, 32);
  assert.equal(snapshot.settlement.matchRating, 8.24);
  assert.equal(snapshot.settlement.totalRating, 16.45);
  assert.match(demo, /rankingStyles\.hatTrickCanvas/);
  assert.match(demo, /first: "GOAAAALLLLL"/);
  assert.match(demo, /second: "GOALLLLLL"/);
  assert.match(demo, /localStyles\.celebrationWord/);
  assert.match(demo, /function AnimatedWord/);
  assert.match(demo, /draft\.event\.playerName/);
  assert.doesNotMatch(demo, />GOAL CONFIRMED</);
  assert.match(demo, /LOCAL VISUAL QA · NON-PUBLISHABLE/);
});

test("goal celebration zooms letter by letter on the website but exports static", () => {
  const goalCss = readFileSync(new URL("../components/touchline/social/TouchlineSocialGoalHatLayoutDemo.module.css", import.meta.url), "utf8");
  const eventCss = readFileSync(new URL("../components/touchline/social/TouchlineSocialConfirmedEventDraft.module.css", import.meta.url), "utf8");
  const rankingCss = readFileSync(new URL("../components/touchline/social/TouchlineSocialRankingDraft.module.css", import.meta.url), "utf8");
  const eventExporter = readFileSync(new URL("../scripts/qa/generate-touchline-social-confirmed-event-draft.mts", import.meta.url), "utf8");
  const rankingExporter = readFileSync(new URL("../scripts/qa/generate-touchline-social-ranking-draft.mts", import.meta.url), "utf8");

  assert.match(goalCss, /@keyframes touchline-goal-letter-zoom/);
  assert.match(goalCss, /--letter-index/);
  assert.match(goalCss, /--line-delay/);
  assert.match(goalCss, /var\(--hat-club-accent\)/);
  assert.match(goalCss, /#f6d45f/);
  assert.match(goalCss, /\.celebrationWordGold\s*>\s*span\s*\{[^}]*color:\s*#f6d45f\s*!important;[^}]*-webkit-text-fill-color:\s*#f6d45f\s*!important;/s);
  assert.match(eventCss, /@keyframes touchline-goal-word-build/);
  assert.match(rankingCss, /@keyframes touchline-celebration-word-build/);
  for (const css of [goalCss, eventCss, rankingCss]) {
    assert.match(css, /data-static-export="true"/);
    assert.match(css, /prefers-reduced-motion: reduce/);
  }
  assert.match(eventExporter, /setAttribute\("data-static-export", "true"\)/);
  assert.match(rankingExporter, /setAttribute\("data-static-export", "true"\)/);
});

test("043 Hat-trick preview reuses the goal renderer without becoming publishable sample data", () => {
  const page = readFileSync(new URL("../app/visual-qa/social-confirmed-event/page.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/visual-qa/social-confirmed-event/preview-draft.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/social/TouchlineSocialGoalHatLayoutDemo.tsx", import.meta.url), "utf8");
  assert.match(page, /params\.design === "hat-trick"/);
  assert.match(page, /FROZEN OWNER ARTWORK · OUTBOUND OFF/);
  assert.match(preview, /createRankingVisualQaPreview\("HAT_TRICK_HERO"\)/);
  assert.match(preview, /LOCAL_NON_PUBLISHABLE_VISUAL_QA/);
  assert.match(preview, /touchLinePointsFromSportmonksRating\(rankingCard\?\.officialMatchRating\)/);
  assert.match(preview, /TOUCHLINE_PLAYER_SCORING_V3_VERSION/);
  assert.match(preview, /touchlinePoints === null/);
  assert.match(component, /isHatTrick\s*\? \{ eyebrow:/);
  assert.match(component, /first: "HAT-TRICK", second: ""/);
  assert.match(component, /<AnimatedWord gold=\{isHatTrick\}>\{title\.first\}<\/AnimatedWord>/);
  assert.match(component, /isHatTrick \? localStyles\.hatTrickTitle/);
  assert.match(component, /isHatTrick \? localStyles\.hatTrickEyebrow/);
  assert.match(component, /data-touchline-points-state=/);
  assert.match(component, /VERIFIED SCORING RESULT/);
  assert.doesNotMatch(component, /OFFICIAL MATCH RATING REWARD/);
  assert.match(component, /<Image src=\{playerClub\.logoUrl!\}[\s\S]*?<div><strong>\{draft\.event\.playerName\}<\/strong>/);
  assert.match(readFileSync(new URL("\.\.\/components\/touchline\/social\/TouchlineSocialGoalHatLayoutDemo\.module\.css", import.meta.url), "utf8"), /\.hatTrickTitle\s*\{[^}]*font-size:\s*82px[^}]*font-weight:\s*1000[^}]*\}/s);
  assert.match(readFileSync(new URL("\.\.\/components\/touchline\/social\/TouchlineSocialGoalHatLayoutDemo\.module\.css", import.meta.url), "utf8"), /\.hatTrickEyebrow\s*\{[^}]*font-size:\s*17px[^}]*\}/s);
  assert.match(readFileSync(new URL("\.\.\/components\/touchline\/social\/TouchlineSocialGoalHatLayoutDemo\.module\.css", import.meta.url), "utf8"), /\.pointsValue\s*\{[^}]*font-size:\s*52px\s*!important;/s);
  assert.match(component, /--hat-club-accent/);
});

test("social visual standard forbids tiny primary data and duplicate facts", () => {
  const standard = readFileSync(new URL("../docs/touchline-arena/social-publishing-playbook/VISUAL_STANDARD.md", import.meta.url), "utf8");
  assert.match(standard, /primary event title must be at least `52px`/);
  assert.match(standard, /decisive[\s\S]*TouchLine Points must be at[\s\S]*least `24px`/);
  assert.match(standard, /must not repeat the already-rendered Official Match Rating/);
  assert.match(standard, /must never[\s\S]*turn missing data into `0`/);
  assert.match(standard, /crest[\s\S]*before the player name/);
});

test("047 moves Hat-trick generation and approval authority into event-scoped 043", () => {
  const migration = readFileSync(new URL("../supabase/qa/047_touchline_qa_goal_family_043.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/047_touchline_qa_goal_family_043_rollback.sql", import.meta.url), "utf8");
  const confirmedRunner = readFileSync(new URL("../scripts/qa/run-touchline-social-confirmed-event-executor.mts", import.meta.url), "utf8");
  const rankingRunner = readFileSync(new URL("../scripts/qa/run-touchline-social-ranking-executor.mts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/social-publications/source/route.ts", import.meta.url), "utf8");
  assert.match(migration, /HAT_TRICK_HERO/);
  assert.match(migration, /touchline-hat-trick-feed-v1/);
  assert.match(migration, /TL_SOCIAL_HAT_TRICK_MOVED_TO_043/);
  assert.match(migration, /content_type in \('GOAL_CONFIRMED','RED_CARD_CONFIRMED','HAT_TRICK_HERO'\)/);
  assert.match(migration, /TL_SOCIAL_GOAL_FAMILY_047_FUNCTION_PATCH_INCOMPLETE/);
  assert.match(rollback, /TL_SOCIAL_047_ROLLBACK_NONEMPTY/);
  assert.match(rollback, /touchline_social_drafts_044_relation_check/);
  assert.match(rollback, /drop function if exists public\.touchline_social_047_block_hat_trick_in_044/);
  assert.doesNotMatch(rollback, /ROLLBACK_REQUIRES_REVIEWED_FORWARD_MIGRATION/);
  assert.match(confirmedRunner, /HAT_TRICK_HERO: "touchline-hat-trick-feed-v1"/);
  assert.doesNotMatch(rankingRunner, /"HAT_TRICK_HERO",/);
  assert.match(route, /TOUCHLINE_SOCIAL_CONFIRMED_EVENT_CONTENT_TYPES/);
});
