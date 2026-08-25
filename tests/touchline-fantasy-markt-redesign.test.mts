import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("TouchLine Markt reuses the one Fantasy Gameweek transaction boundary", async () => {
  const [market, alias, client, route] = await Promise.all([
    source("app/market-transfer/page.tsx"),
    source("app/fantasy/page.tsx"),
    source("app/fantasy/FantasyGameweekClient.tsx"),
    source("app/api/touchline-fantasy/lineup/route.ts"),
  ]);
  assert.match(market, /loadTouchlineFantasySnapshot\(user\)/);
  assert.match(market, /<FantasyGameweekClient initialSnapshot=\{snapshot\}/);
  assert.doesNotMatch(market, /standaloneMarket|<ArenaClient/);
  assert.match(alias, /redirect\(`\/market-transfer\?lang=/);
  assert.match(client, /selectedCoachId/);
  assert.match(route, /p_selected_coach_id: input\.selectedCoachId/);
  assert.match(route, /MAX_LINEUP_REQUEST_BYTES = 8_192/);
  assert.match(route, /new URL\(origin\)\.origin === request\.nextUrl\.origin/);
  assert.match(route, /new TextEncoder\(\)\.encode\(bodyText\)\.byteLength/);
  assert.match(route, /parseTouchlineFantasyLineupRequest\(await readBoundedJson\(request\)\)/);
});

test("the guided Markt presents coach, formation, 11 upright cards, review and Arena sync", async () => {
  const [client, card] = await Promise.all([
    source("app/fantasy/FantasyGameweekClient.tsx"),
    source("components/touchline/fantasy/TouchlineGameweekCard.tsx"),
  ]);
  assert.match(client, /const STEPS:[\s\S]*?"coach"[\s\S]*?"formation"[\s\S]*?"players"[\s\S]*?"review"[\s\S]*?"locked"/);
  assert.match(client, /TOUCHLINE_LIVE_COACHES|snapshot\.coaches\.map/);
  assert.match(client, /selections\.length === 11/);
  assert.match(client, /TouchlineGameweekCard/);
  assert.match(card, /TouchlineEliteExactCard/);
  assert.match(card, /TouchlineCardZoom/);
  assert.doesNotMatch(client, /TouchlineGoalFacingPitchCard/);
  assert.match(client, /touchlineFantasyLandscapeIsBlocked/);
  assert.match(client, /\/arena\?lang=/);
});

test("Club Owner and Arena render the same canonical Gameweek snapshot without a Fantasy bench", async () => {
  const [shared, arena, owner] = await Promise.all([
    source("components/touchline/fantasy/TouchlineGameweekTeamSnapshot.tsx"),
    source("app/arena/page.tsx"),
    source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx"),
  ]);
  assert.match(shared, /snapshot!?\.selections\.find/);
  assert.match(shared, /data-canonical-player-id/);
  assert.match(shared, /No Fantasy bench|Nenhum banco Fantasy/);
  assert.match(arena, /<TouchlineGameweekTeamSnapshot snapshot=\{fantasySnapshot\}[\s\S]*?surface="arena"/);
  assert.match(owner, /<TouchlineGameweekTeamSnapshot snapshot=\{fantasySnapshot\}[\s\S]*?surface="club-owner"/);
  assert.doesNotMatch(owner, />Fazer substituição<|>Make substitution<|<div className="club-owner-unified-bench"/);
});

test("the forward migration fixes T-5, coach snapshot immutability and official-lineup alert state", async () => {
  const [migration, wallClock, indexes] = await Promise.all([
    source("supabase/migrations/20260825202938_touchline_fantasy_markt_gameweek_xi.sql"),
    source("supabase/migrations/20260825213744_touchline_fantasy_wall_clock_deadline.sql"),
    source("supabase/migrations/20260825214912_touchline_fantasy_lineup_alert_fk_indexes.sql"),
  ]);
  assert.match(migration, /set lock_offset_minutes = 5/);
  assert.match(migration, /selected_coach_id text/);
  assert.match(migration, /locked_coach_id text/);
  assert.match(migration, /TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE/);
  assert.match(migration, /NOT_SELECTED_ALERT_ELIGIBLE/);
  assert.match(migration, /stats\.appearance_status = 'absent'/);
  assert.match(migration, /drop function if exists public\.touchline_fantasy_save_lineup\(uuid, uuid, text, jsonb, text, text\)/);
  assert.match(migration, /grant execute on function public\.touchline_fantasy_save_lineup\(uuid, uuid, text, text, jsonb, text, text\) to service_role/);
  assert.match(migration, /revoke all on table public\.touchline_fantasy_lineup_alerts from public, anon, authenticated/);
  assert.match(wallClock, /clock_timestamp\(\) >= v_gameweek\.locks_at/);
  assert.match(wallClock, /clock_timestamp\(\) < v_gameweek\.locks_at/);
  assert.match(indexes, /touchline_fantasy_lineup_alerts_gameweek_idx/);
  assert.match(indexes, /touchline_fantasy_lineup_alerts_player_idx/);
  assert.match(indexes, /touchline_fantasy_lineup_alerts_fixture_idx/);
});
