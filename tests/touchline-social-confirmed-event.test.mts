import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyTouchlineConfirmedMatchEvent,
  formatTouchlineConfirmedEventMinute,
  parseTouchlineEventScore,
} from "../lib/touchlineArena/social-confirmed-event-contract.ts";
import { buildTouchlineConfirmedEventCaption } from "../lib/touchlineArena/social-confirmed-event-caption.ts";
import { checksumTouchlineConfirmedEventRenderSource } from "../lib/touchlineArena/social-confirmed-event-render-source.ts";
import {
  isTouchlineSocialContentTypeEnabledInModule,
  touchlineSocialContentDefinition,
} from "../lib/touchlineArena/social-content-registry.ts";

test("043 registry exposes only confirmed event Stories", () => {
  assert.deepEqual(touchlineSocialContentDefinition("GOAL_CONFIRMED"), {
    module: "043",
    placement: "INSTAGRAM_STORY",
    width: 1080,
    height: 1920,
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
  assert.equal(isTouchlineSocialContentTypeEnabledInModule("LINEUP", "043"), false);
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
    assert.match(goal.caption, /Goal confirmed ⚽/);
    assert.match(goal.caption, /Aston Villa 1–0 Arsenal FC/);
    assert.match(goal.caption, /Ollie Watkins 40'/);
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
  const migration = readFileSync(new URL("../supabase/qa/043_touchline_qa_social_confirmed_events.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/043_touchline_qa_social_confirmed_events_rollback.sql", import.meta.url), "utf8");
  assert.match(reader, /football_fixture_events/);
  assert.match(reader, /touchline_player_fixture_score_settlements/);
  assert.match(reader, /readPublicSeasonPlayerPoints/);
  assert.match(reader, /event-status-not-confirmed|event-fact-not-stable|event-score-conflict/);
  assert.match(reader, /touchlineFixtureState\(\{ startsAt, status:/);
  assert.doesNotMatch(reader, /fetch\s*\(/);
  assert.match(candidates, /EVENT_FRESHNESS_MS = 15 \* 60 \* 1000/);
  assert.match(candidates, /EVENT_DISCOVERY_MAX_ROWS = 2_000/);
  assert.match(candidates, /\.range\(offset, offset \+ EVENT_DISCOVERY_PAGE_SIZE - 1\)/);
  assert.match(candidates, /confirmedFactByIdentity/);
  assert.match(component, /import \{ Goal, ShieldCheck \} from "lucide-react"/);
  assert.match(component, /styles\.redCardIcon/);
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
