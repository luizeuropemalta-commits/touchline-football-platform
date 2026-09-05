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

test("045 routes fixture-scoped Match Preview only to the two exact clubs", () => {
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "MATCH_PREVIEW", fixtureTeamIds: FIXTURE_TEAMS,
  }), { ok: true, teamIds: ["15", "19"] });
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
  assert.deepEqual(touchlineClubSocialFanoutTargets({
    contentType: "HAT_TRICK_HERO", eventTeamId: "19", fixtureTeamIds: FIXTURE_TEAMS,
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
    contentType: "HAT_TRICK_HERO", eventTeamId: "18", fixtureTeamIds: FIXTURE_TEAMS,
  }), { ok: false, reason: "EVENT_CLUB_SCOPE_INVALID" });
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

test("048 extends the internal ClubHub feed to approved Match Preview without outbound delivery", () => {
  const sql = readFileSync(new URL("../supabase/qa/048_touchline_qa_club_social_match_preview_feed.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/048_touchline_qa_club_social_match_preview_feed_rollback.sql", import.meta.url), "utf8");
  assert.match(sql, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(sql, /MATCH_PREVIEW/);
  assert.match(sql, /v_draft\.content_type in \('MATCH_PREVIEW','FULL_TIME'/);
  assert.match(sql, /v_draft\.content_type='HAT_TRICK_HERO'/);
  assert.match(sql, /event\.provider_event_id=v_draft\.event_provider_id/);
  assert.match(sql, /touchline_club_social_posts_content_type_check/);
  assert.match(sql, /grant execute on function public\.touchline_social_045_expected_team_ids\(uuid\) to service_role/);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
  assert.match(rollback, /TL_SOCIAL_048_ROLLBACK_MATCH_PREVIEW_DATA_PRESENT/);
  assert.match(rollback, /v_draft\.content_type in \('FULL_TIME'/);
});

test("ClubHub UI exposes the bounded server reader with local like and native share actions", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/(app)/admin/social-publications/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/touchline/club-social/TouchlineClubSocialFeed.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/touchline/club-social/TouchlineClubSocialFeed.module.css", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../lib/touchlineArena/club-social-feed-server.ts", import.meta.url), "utf8");
  const shareRoute = readFileSync(new URL("../app/api/touchline-social/share-art/[postId]/route.ts", import.meta.url), "utf8");
  assert.match(page, /readTouchlineClubSocialFeed/);
  assert.match(page, /TouchlineClubSocialFeed/);
  assert.match(reader, /touchline_social_045_read_feed/);
  assert.match(adminPage, /touchline_social_045_admin_status/);
  assert.doesNotMatch(adminPage, /\.from\("touchline_club_social_(?:executor_cycles|fanout_jobs|posts|tombstones)"\)/);
  assert.match(component, /TouchLine Verified/);
  assert.match(component, /<ClubHubLikeButton/);
  assert.match(component, /<ClubHubShareButton/);
  assert.match(component, /postId=\{item\.id\}/);
  assert.match(component, /Post actions/);
  assert.match(component, /sizes="\(max-width: 620px\) 92vw, 540px"/);
  assert.match(component, /data-scrollable=\{page\.state === "ready" \? "true" : undefined\}/);
  assert.match(component, /data-club-feed-scroll-region="true"/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(reader, /touchline_social_049_read_share_art/);
  assert.match(shareRoute, /readTouchlineShareArtwork\(postId\)/);
  assert.match(shareRoute, /acquireShareCapacity\(request\)/);
  assert.ok(shareRoute.indexOf("acquireShareCapacity(request)") < shareRoute.indexOf("readTouchlineShareArtwork(postId)"));
  assert.match(shareRoute, /SHARE_RATE_LIMIT = 12/);
  assert.match(shareRoute, /SHARE_MAX_CONCURRENT = 8/);
  assert.doesNotMatch(shareRoute, /artwork\.arrayBuffer|new Response\(body/);
  assert.match(styles, /\.actions button\s*\{[\s\S]*?font-size:\s*12px/);
  assert.match(styles, /\.grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?justify-items:\s*center/);
  assert.match(styles, /\.card\s*\{[\s\S]*?width:\s*min\(100%, 540px\)/);
  assert.match(styles, /\.media img\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(styles, /\.shell\s*\{[\s\S]*?display:\s*flex[\s\S]*?height:\s*100%[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.grid\s*\{[\s\S]*?align-content:\s*start[\s\S]*?grid-auto-rows:\s*max-content[\s\S]*?overflow-y:\s*auto[\s\S]*?overscroll-behavior:\s*contain[\s\S]*?scrollbar-gutter:\s*stable[\s\S]*?touch-action:\s*pan-y/);
  const leagueLayoutStyles = readFileSync(new URL("../components/touchline/club-hub/ClubHubOfficialLeague.module.css", import.meta.url), "utf8");
  assert.match(leagueLayoutStyles, /\.layout\s*\{[\s\S]*?align-items:\s*stretch/);
  assert.match(leagueLayoutStyles, /\.feed\s*\{[\s\S]*?contain:\s*size/);
  assert.match(leagueLayoutStyles, /\.feed > section\s*\{[\s\S]*?height:\s*100%[\s\S]*?max-height:\s*100%/);
  assert.match(leagueLayoutStyles, /\.feed > section\[data-scrollable="true"\]\s*\{[\s\S]*?height:\s*clamp\(/);
  assert.doesNotMatch(component, /comment|reaction|SportMonks|provider|API/i);
});

test("049 reuses approved canonical posts for the shared ClubOwner official timeline and keeps external delivery disabled", () => {
  const sql = readFileSync(new URL("../supabase/qa/049_touchline_qa_clubowner_social_feed.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/049_touchline_qa_clubowner_social_feed_rollback.sql", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../lib/touchlineArena/club-social-feed-server.ts", import.meta.url), "utf8");
  const owner = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");
  const social = readFileSync(new URL("../components/touchline/social/TouchlineSocial.tsx", import.meta.url), "utf8");
  const nativeShare = readFileSync(new URL("../lib/touchlineArena/social-native-share.ts", import.meta.url), "utf8");
  assert.match(sql, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(sql, /from public\.touchline_club_social_posts post/);
  assert.match(sql, /select distinct on \(post\.source_draft_id\)/);
  assert.match(sql, /draft\.artwork_approval_state='APPROVED'/);
  assert.match(sql, /draft\.caption_approval_state='APPROVED'/);
  assert.match(sql, /touchline_social_source_revision_is_current/);
  assert.match(sql, /least\(greatest\(coalesce\(p_limit,6\),1\),12\)/);
  assert.match(sql, /grant execute on function public\.touchline_social_049_read_clubowner_feed\(integer,timestamptz,uuid\)\s+to service_role/);
  assert.match(sql, /touchline_social_049_read_share_art\(p_post_id uuid\)/);
  assert.match(sql, /post\.expires_at>clock_timestamp\(\)/);
  assert.match(sql, /post\.artifact_checksum=draft\.artifact_checksum/);
  assert.match(sql, /grant execute on function public\.touchline_social_049_read_share_art\(uuid\)\s+to service_role/);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
  assert.match(rollback, /drop function if exists public\.touchline_social_049_read_clubowner_feed/);
  assert.match(reader, /readTouchlineClubOwnerSocialFeed/);
  assert.match(owner, /<TouchlineClubSocialFeed/);
  assert.equal((owner.match(/<TouchlineClubSocialFeed/g) ?? []).length, 1);
  assert.doesNotMatch(owner, /<TouchlineSocialFeed/);
  assert.ok(owner.indexOf("<TouchlineClubSocialFeed") < owner.indexOf("club-owner-rank-deck"));
  assert.match(owner, /channelTitle=\{isPortuguese \? "Notícias oficiais primeiro" : "Official news first"\}/);
  assert.doesNotMatch(owner, /providerTeamId|club_provider_team_id/);
  assert.match(social, /shareTouchlinePost/);
  assert.match(nativeShare, /navigator\.share/);
  assert.match(nativeShare, /\/api\/touchline-social\/share-art/);
  assert.match(nativeShare, /blobSha256\(blob\) !== manifest\.checksum/);
  assert.match(nativeShare, /navigator\.canShare\(filePayload\)/);
  assert.match(nativeShare, /await navigator\.share\(filePayload\)/);
});

test("050 hides and refuses to sign a published post whose revision no longer matches its current draft", () => {
  const sql = readFileSync(new URL("../supabase/qa/050_touchline_qa_club_social_reader_revision_fence.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/050_touchline_qa_club_social_reader_revision_fence_rollback.sql", import.meta.url), "utf8");
  const clubHubStart = sql.indexOf("create or replace function public.touchline_social_045_read_feed");
  const ownerStart = sql.indexOf("create or replace function public.touchline_social_049_read_clubowner_feed");
  const shareStart = sql.indexOf("create or replace function public.touchline_social_049_read_share_art");
  const grantsStart = sql.indexOf("revoke all on function public.touchline_social_045_read_feed");
  assert.ok(clubHubStart >= 0 && ownerStart > clubHubStart && shareStart > ownerStart && grantsStart > shareStart);
  const clubHubReader = sql.slice(clubHubStart, ownerStart);
  const ownerReader = sql.slice(ownerStart, shareStart);
  const shareReader = sql.slice(shareStart, grantsStart);
  for (const reader of [clubHubReader, ownerReader, shareReader]) {
    assert.match(reader, /post\.source_checksum=draft\.source_checksum/);
    assert.match(reader, /post\.source_revision_checksum=draft\.source_revision_checksum/);
    assert.match(reader, /post\.manifest_checksum=draft\.manifest_checksum/);
    assert.match(reader, /post\.artifact_checksum=draft\.artifact_checksum/);
    assert.match(reader, /draft\.approved_artifact_checksum=draft\.artifact_checksum/);
    assert.match(reader, /draft\.approved_caption_checksum=draft\.caption_checksum/);
    assert.match(reader, /draft\.approved_manifest_checksum=draft\.manifest_checksum/);
    assert.match(reader, /touchline_social_source_revision_is_current/);
  }
  assert.match(clubHubReader, /ref\.source_checksum=post\.source_checksum/);
  assert.match(sql, /set search_path = ''/g);
  assert.match(rollback, /TL_SOCIAL_050_CLUB_FEED_DISABLED/);
  assert.match(rollback, /TL_SOCIAL_050_CLUBOWNER_FEED_DISABLED/);
  assert.match(rollback, /TL_SOCIAL_050_SHARE_ART_DISABLED/);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
});

test("051 retains the exact approved post snapshot until expiry while approval and fanout remain currentness-gated", () => {
  const sql = readFileSync(new URL("../supabase/qa/051_touchline_qa_club_social_snapshot_retention.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/qa/051_touchline_qa_club_social_snapshot_retention_rollback.sql", import.meta.url), "utf8");
  const fanout = readFileSync(new URL("../supabase/qa/045_touchline_qa_club_social_feed.sql", import.meta.url), "utf8");
  const approval = readFileSync(new URL("../supabase/qa/041_touchline_qa_social_match_preview.sql", import.meta.url), "utf8");
  const clubHubStart = sql.indexOf("create or replace function public.touchline_social_045_read_feed");
  const ownerStart = sql.indexOf("create or replace function public.touchline_social_049_read_clubowner_feed");
  const shareStart = sql.indexOf("create or replace function public.touchline_social_049_read_share_art");
  const grantsStart = sql.indexOf("revoke all on function public.touchline_social_045_read_feed");
  assert.ok(clubHubStart >= 0 && ownerStart > clubHubStart && shareStart > ownerStart && grantsStart > shareStart);
  const clubHubReader = sql.slice(clubHubStart, ownerStart);
  const ownerReader = sql.slice(ownerStart, shareStart);
  const shareReader = sql.slice(shareStart, grantsStart);
  for (const reader of [clubHubReader, ownerReader, shareReader]) {
    assert.match(reader, /post\.expires_at>clock_timestamp\(\)/);
    assert.match(reader, /post\.source_checksum=draft\.source_checksum/);
    assert.match(reader, /post\.source_revision_checksum=draft\.source_revision_checksum/);
    assert.match(reader, /post\.manifest_checksum=draft\.manifest_checksum/);
    assert.match(reader, /post\.artifact_checksum=draft\.artifact_checksum/);
    assert.match(reader, /draft\.approval_state='APPROVED'/);
    assert.match(reader, /draft\.artwork_approval_state='APPROVED'/);
    assert.match(reader, /draft\.caption_approval_state='APPROVED'/);
    assert.match(reader, /draft\.approved_artifact_checksum=draft\.artifact_checksum/);
    assert.match(reader, /draft\.approved_caption_checksum=draft\.caption_checksum/);
    assert.match(reader, /draft\.approved_manifest_checksum=draft\.manifest_checksum/);
    assert.doesNotMatch(reader, /touchline_social_source_revision_is_current/);
  }
  assert.match(clubHubReader, /ref\.source_checksum=post\.source_checksum/);
  assert.equal((rollback.match(/touchline_social_source_revision_is_current/g) ?? []).length, 3);
  assert.match(rollback, /post\.source_revision_checksum=draft\.source_revision_checksum/);
  assert.match(sql, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(sql, /set search_path = ''/g);
  assert.match(sql, /grant execute on function public\.touchline_social_045_read_feed[\s\S]*?to service_role/);
  assert.match(sql, /grant execute on function public\.touchline_social_049_read_clubowner_feed[\s\S]*?to service_role/);
  assert.match(sql, /grant execute on function public\.touchline_social_049_read_share_art[\s\S]*?to service_role/);
  assert.match(fanout, /touchline_social_045_enqueue_job[\s\S]*?touchline_social_source_revision_is_current/);
  assert.match(fanout, /touchline_social_045_claim_job[\s\S]*?touchline_social_source_revision_is_current/);
  assert.match(fanout, /touchline_social_045_complete_job[\s\S]*?touchline_social_source_revision_is_current/);
  assert.match(approval, /touchline_social_041_assert_approval_gate[\s\S]*?touchline_social_source_revision_is_current/);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
});
