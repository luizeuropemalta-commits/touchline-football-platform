import assert from "node:assert/strict";
import test from "node:test";

import { readTouchlinePublishedFeedPresentation } from "../lib/touchlineArena/social-feed-presentation.ts";
import { readFileSync } from "node:fs";

test("feed presentation refuses to invent unavailable live facts", () => {
  assert.deepEqual(readTouchlinePublishedFeedPresentation(null), { state: "unavailable", reason: "PUBLISHED_FACTS_UNAVAILABLE" });
  assert.deepEqual(readTouchlinePublishedFeedPresentation({ fixture: { homeName: "Liverpool" } }), { state: "unavailable", reason: "PUBLISHED_FACTS_UNAVAILABLE" });
});

test("feed presentation exposes only complete published fact groups", () => {
  assert.deepEqual(readTouchlinePublishedFeedPresentation({
    fixture: { homeName: "Liverpool", awayName: "Fulham", homeScore: 2, awayScore: 1 },
    points: { label: "TouchLine points", value: 14.5 },
    leader: { label: "Club leader", name: "Dominik", value: 22.73 },
    event: { kind: "GOAL", playerName: "Dominik", clubName: "Liverpool", minute: 73 },
  }), {
    state: "available",
    fixture: { homeName: "Liverpool", awayName: "Fulham", homeScore: 2, awayScore: 1 },
    points: { label: "TouchLine points", value: 14.5 },
    leader: { label: "Club leader", name: "Dominik", value: 22.73 },
    event: { kind: "GOAL", playerName: "Dominik", clubName: "Liverpool", minute: 73 },
  });
});

test("feed presentation only exposes an event when type, scorer, club and minute are published together", () => {
  assert.deepEqual(readTouchlinePublishedFeedPresentation({
    event: { kind: "GOAL", playerName: "Dominik", clubName: "Liverpool" },
  }), { state: "unavailable", reason: "PUBLISHED_FACTS_UNAVAILABLE" });
  assert.deepEqual(readTouchlinePublishedFeedPresentation({
    event: { kind: "GOAL", playerName: "Dominik", clubName: "Liverpool", minute: 73 },
  }), {
    state: "available",
    event: { kind: "GOAL", playerName: "Dominik", clubName: "Liverpool", minute: 73 },
  });
});

test("052 exposes only an optional approved presentation through the service-role reader and has a reversible QA rollback", () => {
  const sql = readFileSync(new URL("../supabase/qa/052_touchline_qa_club_social_published_presentation.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/052_touchline_qa_club_social_published_presentation_rollback.sql", import.meta.url), "utf8");
  assert.match(sql, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(sql, /published_presentation jsonb/);
  assert.match(sql, /jsonb_typeof\(published_presentation\) = 'object'/);
  assert.match(sql, /'presentation',feed\.published_presentation/);
  assert.match(sql, /revoke all on function public\.touchline_social_045_read_feed\(text,integer,timestamptz,uuid\) from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.touchline_social_045_read_feed\(text,integer,timestamptz,uuid\) to service_role/i);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
  assert.match(rollback, /stop exposing presentation facts/i);
  assert.doesNotMatch(rollback, /drop column|delete from/i);
});

test("native club feed keeps its shared TouchLine frame while deriving media and controls from the canonical club accent", () => {
  const styles = readFileSync(new URL("../components/touchline/club-social/TouchlineClubSocialFeed.module.css", import.meta.url), "utf8");
  assert.match(styles, /--feed-accent:\s*var\(--club-accent, #a3ff12\)/);
  assert.match(styles, /\.shell\s*\{[\s\S]*?border: 1px solid rgba\(163, 255, 18, \.34\)/);
  assert.match(styles, /\.liveMedia img\s*\{[\s\S]*?drop-shadow\(0 0 13px var\(--feed-accent\)\)/);
  assert.match(styles, /\.actions button\s*\{[\s\S]*?var\(--feed-accent\)/);
});
