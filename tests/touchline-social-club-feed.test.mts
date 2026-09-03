import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_CLUB_SOCIAL_FEED_PAGE_MAX,
  adaptTouchlineClubTimelineCopy,
  decodeTouchlineClubSocialFeedCursor,
  encodeTouchlineClubSocialFeedCursor,
  touchlineClubSocialFanoutTargets,
  touchlineClubSocialFeedPageSize,
} from "../lib/touchlineArena/social-club-feed-contract.ts";

const FIXTURE_TEAMS = ["15", "19"];
const LEAGUE_TEAMS = Array.from({ length: 20 }, (_, index) => String(index + 1));

test("045 routes only exact club references and never duplicates Match Preview", () => {
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "MATCH_PREVIEW", fixtureTeamIds: FIXTURE_TEAMS,
  }), { ok: false, reason: "MATCH_PREVIEW_NOT_DUPLICATED_IN_CLUB_HUB" });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "LINEUP", draftTeamId: "15", fixtureTeamIds: FIXTURE_TEAMS,
  }), { ok: true, teamIds: ["15"] });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "FULL_TIME", fixtureTeamIds: FIXTURE_TEAMS,
  }), { ok: true, teamIds: ["15", "19"] });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "GOAL_CONFIRMED", fixtureTeamIds: ["19", "15", "19"],
  }), { ok: true, teamIds: ["15", "19"] });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "GAMEWEEK_RANKING_FINAL", leagueTeamIds: LEAGUE_TEAMS,
  }), { ok: true, teamIds: LEAGUE_TEAMS });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "TOP_PERFORMER", subjectTeamId: "19",
  }), { ok: true, teamIds: ["19"] });
});

test("045 fails closed on incomplete, duplicated or cross-fixture club scope", () => {
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "LINEUP", draftTeamId: "18", fixtureTeamIds: FIXTURE_TEAMS,
  }), { ok: false, reason: "LINEUP_CLUB_SCOPE_INVALID" });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "FULL_TIME", fixtureTeamIds: ["15"],
  }), { ok: false, reason: "FIXTURE_CLUB_SCOPE_INVALID" });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "GAMEWEEK_RANKING_PREVIEW", leagueTeamIds: LEAGUE_TEAMS.slice(0, 19),
  }), { ok: false, reason: "GAMEWEEK_CLUB_SCOPE_INVALID" });
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "HAT_TRICK_HERO", subjectTeamId: "player-name",
  }), { ok: false, reason: "SUBJECT_CLUB_SCOPE_INVALID" });
});

test("Timeline adapter shares facts while removing Instagram-only copy", () => {
  const adapted = adaptTouchlineClubTimelineCopy([
    "Full Time: Aston Villa 1–2 Arsenal.",
    "A decisive finish at Villa Park.",
    "COMING SOON • CURRENTLY IN TESTING",
    "Who stood out? #TouchLine #AVLARS",
  ].join("\n"));
  assert.equal(adapted.ok, true);
  if (!adapted.ok) return;
  assert.equal(adapted.copy, "Full Time: Aston Villa 1–2 Arsenal.\nA decisive finish at Villa Park.\nWho stood out?");
  assert.match(adapted.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(adapted.copy, /#|instagram|provider|sportmonks|\bapi\b/i);
  assert.deepEqual(adaptTouchlineClubTimelineCopy("#TouchLine\nCOMING SOON"), {
    ok: false, reason: "TIMELINE_COPY_INVALID",
  });
  const inlineBanner = adaptTouchlineClubTimelineCopy(
    "Full Time: Aston Villa 1–2 Arsenal. COMING SOON • CURRENTLY IN TESTING",
  );
  assert.equal(inlineBanner.ok, true);
  if (inlineBanner.ok) assert.equal(inlineBanner.copy, "Full Time: Aston Villa 1–2 Arsenal.");
  assert.deepEqual(adaptTouchlineClubTimelineCopy("Data supplied by a provider API."), {
    ok: false, reason: "TIMELINE_COPY_INVALID",
  });
});

test("Club feed cursors and page sizes remain bounded and deterministic", () => {
  const cursor = encodeTouchlineClubSocialFeedCursor({
    publishedAt: "2026-08-31T20:00:00.000Z",
    postId: "11111111-1111-4111-8111-111111111111",
  });
  assert.ok(cursor);
  assert.deepEqual(decodeTouchlineClubSocialFeedCursor(cursor), {
    publishedAt: "2026-08-31T20:00:00.000Z",
    postId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(decodeTouchlineClubSocialFeedCursor("not-a-cursor"), null);
  assert.equal(touchlineClubSocialFeedPageSize(999), TOUCHLINE_CLUB_SOCIAL_FEED_PAGE_MAX);
  assert.equal(touchlineClubSocialFeedPageSize(0), 6);
});

test("045 migration enforces RLS, 14-day lifecycle, bounded reads and no outbound", () => {
  const sql = readFileSync(new URL("../supabase/qa/045_touchline_qa_club_social_feed.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/045_touchline_qa_club_social_feed_rollback.sql", import.meta.url), "utf8");
  assert.match(sql, /force row level security/gi);
  assert.match(sql, /revoke all on public\.touchline_club_social_posts from public, anon, authenticated, service_role/i);
  assert.match(sql, /expires_at = published_at \+ interval '14 days'/i);
  assert.match(sql, /least\(greatest\(coalesce\(p_limit,6\),1\),12\)/i);
  assert.match(sql, /touchline_social_045_admin_status\(\)/i);
  assert.match(sql, /grant execute on function public\.touchline_social_045_admin_status\(\) to service_role/i);
  assert.match(sql, /artwork_approval_state<>'APPROVED'/i);
  assert.match(sql, /approved_artifact_checksum is distinct from v_draft\.artifact_checksum/i);
  assert.match(sql, /MATCH_PREVIEW','FINAL_SCORE/i);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
  assert.match(rollback, /TL_SOCIAL_045_ROLLBACK_ACTIVE_LEASE/);
  assert.match(rollback, /TL_SOCIAL_045_ROLLBACK_NONEMPTY/);
});

test("ClubHub UI exposes the bounded server reader with local like and native share actions", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/(app)/admin/social-publications/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/club-social/TouchlineClubSocialFeed.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/touchline/club-social/TouchlineClubSocialFeed.module.css", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../lib/touchlineArena/club-social-feed-server.ts", import.meta.url), "utf8");
  assert.match(page, /readTouchlineClubSocialFeed/);
  assert.match(page, /TouchlineClubSocialFeed/);
  assert.match(reader, /touchline_social_045_read_feed/);
  assert.match(adminPage, /touchline_social_045_admin_status/);
  assert.doesNotMatch(adminPage, /\.from\("touchline_club_social_(?:executor_cycles|fanout_jobs|posts|tombstones)"\)/);
  assert.match(component, /TouchLine Verified/);
  assert.match(component, /<ClubHubLikeButton/);
  assert.match(component, /<ClubHubShareButton/);
  assert.match(component, /Post actions/);
  assert.match(styles, /\.actions button\s*\{[\s\S]*?font-size:\s*12px/);
  assert.doesNotMatch(component, /comment|reaction|SportMonks|provider|API/i);
});
