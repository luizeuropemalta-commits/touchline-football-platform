import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildTouchlineFantasyArenaLineup } from "../lib/touchlineFantasy/arena-lineup.ts";

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

test("the classic Markt presentation keeps the guided coach-first Gameweek flow", async () => {
  const [client, card, exactCard, styles] = await Promise.all([
    source("app/fantasy/FantasyGameweekClient.tsx"),
    source("components/touchline/fantasy/TouchlineGameweekCard.tsx"),
    source("components/touchline/cards/TouchlineEliteExactCard.tsx"),
    source("app/fantasy/fantasy.module.css"),
  ]);
  assert.match(client, /const STEPS:[\s\S]*?"coach"[\s\S]*?"formation"[\s\S]*?"players"[\s\S]*?"review"[\s\S]*?"locked"/);
  assert.match(client, /data-market-visual="classic"/);
  assert.match(client, /Monte seu time TouchLine|Build Your TouchLine Team/);
  assert.match(client, /Escolha primeiro seu treinador, depois a formação/);
  assert.match(client, /TOUCHLINE_LIVE_COACHES|snapshot\.coaches\.map/);
  assert.match(client, /selections\.length === 11/);
  assert.match(client, /TouchlineGameweekCard/);
  assert.doesNotMatch(client, /TouchlineGoalFacingPitchCard/);
  assert.match(client, /className=\{styles\.pitchCard\}>\s*<TouchlineGameweekCard[^>]*compact[^>]*displayWidth=\{62\}/);
  assert.match(client, /data-player-choice-card="premium"/);
  assert.match(client, /import Image from "next\/image"/);
  assert.match(client, /findTouchLineClub/);
  assert.match(client, /function CompactClubIdentity[\s\S]*?data-club-identity="compact"[\s\S]*?<Image[^>]*unoptimized/);
  assert.match(client, /snapshot\.coaches\.map[\s\S]*?<CompactClubIdentity clubName=\{entry\.clubName\} clubLogoUrl=\{entry\.clubLogoUrl/);
  assert.match(client, /<aside className=\{styles\.guidePanel\} tabIndex=\{0\}[^>]*onPointerDown=\{\(event\) => event\.currentTarget\.focus\(\{ preventScroll: true \}\)\}/);
  const playerChooser = client.match(/<div className=\{styles\.playerGrid\}>[\s\S]*?<footer className=\{styles\.pagination\}>/)?.[0] ?? "";
  assert.match(playerChooser, /<div className=\{styles\.marketCard\}>[\s\S]*?<div className=\{styles\.playerIdentity\}>\s*<b>\{card\.name\}<\/b>/);
  assert.match(playerChooser, /<CompactClubIdentity clubName=\{card\.clubName\} clubLogoUrl=\{findTouchLineClub\(card\.clubName\)\?\.logoUrl \?\? null\} detail=\{card\.position\}/);
  assert.doesNotMatch(playerChooser, /card\.marketValue|VALOR DE MERCADO|MARKET VALUE/);
  assert.match(card, /TouchlineEliteExactCard/);
  assert.match(card, /TouchlineCardZoom/);
  assert.match(exactCard, /data-card-market-value-panel="true"/);
  assert.match(styles, /\.marketCard \[data-card-market-value-panel="true"\]\{display:none!important\}/);
  assert.match(styles, /\.playerIdentity\{[\s\S]*?text-align:center/);
  assert.match(styles, /\.clubIdentity\{[\s\S]*?justify-self:start[\s\S]*?width:calc\(100% - 4px\)[\s\S]*?max-width:100%[\s\S]*?box-sizing:border-box[\s\S]*?overflow:hidden/);
  assert.match(styles, /\.clubIdentity img\{[\s\S]*?width:22px[\s\S]*?height:22px[\s\S]*?object-fit:contain/);
  assert.match(styles, /\.guidePanel\{[\s\S]*?overflow:auto[\s\S]*?overscroll-behavior-y:contain[\s\S]*?scrollbar-gutter:stable[\s\S]*?touch-action:pan-y/);
  assert.match(styles, /\.guidePanel\{[\s\S]*?max-height:min\(760px,calc\(100dvh - 32px\)\)/);
  assert.match(styles, /@media\(max-width:1180px\)\{[\s\S]*?\.guidePanel\{max-height:min\(720px,70dvh\)\}/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.guidePanel\{[\s\S]*?max-height:min\(680px,72dvh\)/);
  assert.doesNotMatch(styles, /\.guidePanel\{max-height:none\}/);
  assert.match(styles, /\.pitchCard\{[\s\S]*?width:62px[\s\S]*?aspect-ratio:430 \/ 691/);
  assert.doesNotMatch(styles, /\.attackCard/);
  assert.match(styles, /\.shell\{[\s\S]*?width:min\(1880px,calc\(100% - 24px\)\)/);
  assert.match(styles, /\.hero h1\{[\s\S]*?font-size:clamp\(28px,3vw,46px\)/);
  assert.match(client, /touchlineFantasyLandscapeIsBlocked/);
  assert.match(client, /Android\|iPhone\|iPad\|iPod\|Mobile/);
  assert.match(client, /navigator\.maxTouchPoints > 1/);
  assert.match(client, /formatTouchlineFantasyDeadline\(activeGameweek\.locksAt, locale\)/);
  assert.match(client, /\/arena\?lang=/);
});

test("Club Owner and Arena consume the same canonical Gameweek snapshot without a Fantasy bench", async () => {
  const [shared, arena, arenaClient, arenaAdapter, owner] = await Promise.all([
    source("components/touchline/fantasy/TouchlineGameweekTeamSnapshot.tsx"),
    source("app/arena/page.tsx"),
    source("app/arena/ArenaClient.tsx"),
    source("lib/touchlineFantasy/arena-lineup.ts"),
    source("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx"),
  ]);
  assert.match(shared, /snapshot!?\.selections\.find/);
  assert.match(shared, /data-canonical-player-id/);
  assert.match(shared, /No Fantasy bench|Nenhum banco Fantasy/);
  assert.match(shared, /formatTouchlineFantasyDeadline\(gameweek\.locksAt, locale\)/);
  assert.match(arena, /buildTouchlineFantasyArenaLineup\(fantasySnapshot\)/);
  assert.match(arena, /initialFantasyLineup=\{fantasyArenaLineup\}/);
  assert.doesNotMatch(arena, /TouchlineGameweekTeamSnapshot/);
  assert.match(arenaAdapter, /userGameweek\.state === "DRAFT"/);
  assert.match(arenaAdapter, /snapshot\.selections\.length !== 11/);
  assert.match(arenaAdapter, /seen\.size !== 11/);
  assert.match(arenaAdapter, /canonicalPlayerId: playerId/);
  assert.match(arenaAdapter, /role: slot\.role/);
  assert.match(arenaClient, /data-fantasy-gameweek-xi=\{hasSyncedFantasyLineup \? "true"/);
  assert.match(arenaClient, /data-canonical-player-id=\{hasSyncedFantasyLineup/);
  assert.match(arenaClient, /GAMEWEEK XI SYNCED/);
  assert.match(arenaClient, /arenaDisplayFormationKey/);
  assert.match(arenaClient, /return initialFantasyLineup\.players\.map/);
  assert.match(arenaClient, /const savedLayout = hasSyncedFantasyLineup[\s\S]*?\? null/);
  assert.match(arenaClient, /const isQuickSubstitutionOpen = activeArenaPanel === "bench" && !hasSyncedFantasyLineup/);
  assert.match(arenaClient, /!hasSyncedFantasyLineup \? <a[\s\S]*?touchlineArenaPanelHref\("bench"/);
  assert.match(owner, /<TouchlineGameweekTeamSnapshot snapshot=\{fantasySnapshot\}[\s\S]*?surface="club-owner"/);
  assert.doesNotMatch(owner, />Fazer substituição<|>Make substitution<|<div className="club-owner-unified-bench"/);
});

test("the Arena adapter accepts only one confirmed canonical 11-player snapshot", () => {
  const playerIds = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const slots = playerIds.map((_, index) => ({
    id: `SLOT-${index + 1}`,
    x: 10 + (index * 7),
    y: 20 + (index * 5),
    role: index === 0 ? "goalkeeper" : index < 5 ? "defender" : index < 8 ? "midfielder" : "forward",
    roleIndex: index,
    line: "test",
    side: "centre",
    priority: index + 1,
    allowedPositions: index === 0 ? ["goalkeeper"] : ["midfield"],
  }));
  const snapshot = {
    activeGameweek: { number: 1 },
    userGameweek: { formationCode: "4-3-3", state: "CONFIRMED", selectedCoachId: "307" },
    selections: playerIds.map((playerId, index) => ({ playerId, slotId: slots[index].id })),
    catalogue: playerIds.map((canonicalPlayerId, index) => ({
      id: canonicalPlayerId,
      canonicalPlayerId,
      name: `Player ${index + 1}`,
      shortName: `P${index + 1}`,
      role: slots[index].role,
      position: slots[index].role,
      clubName: `Club ${index % 3}`,
      shirtNumber: index + 1,
      countryCode3: "ENG",
      marketValue: "€1m",
      touchlinePoints: 0,
      seasonTotalRating: 7 + (index / 100),
    })),
    formationRegistry: {
      "4-3-3": { schemaVersion: 1, formationCode: "4-3-3", geometryVersion: 1, source: "code-default", publishedAt: null, slots },
    },
  } as const;

  const result = buildTouchlineFantasyArenaLineup(snapshot);
  assert.equal(result?.players.length, 11);
  assert.deepEqual(result?.players.map((player) => player.id), playerIds);
  assert.equal(result?.formationCode, "4-3-3");
  assert.equal(result?.coachProviderId, "307");
  assert.equal(result?.players[0].card?.canonicalPlayerId, playerIds[0]);
  assert.equal(result?.players[10].card?.totalRating, 7.1);

  const threeFourTwoOneSlots = slots.map((slot, index) => ({
    ...slot,
    id: `3421-${index + 1}`,
    x: index === 0 ? 8 : index < 4 ? 29 : index < 10 ? (index < 8 ? 50 : 71) : 92,
    role: index === 0 ? "goalkeeper" : index < 4 ? "defender" : index < 10 ? "midfielder" : "forward",
  }));
  const threeFourTwoOne = buildTouchlineFantasyArenaLineup({
    ...snapshot,
    userGameweek: { ...snapshot.userGameweek, formationCode: "3-4-2-1" },
    selections: playerIds.map((playerId, index) => ({ playerId, slotId: threeFourTwoOneSlots[index].id })),
    formationRegistry: {
      "3-4-2-1": { schemaVersion: 1, formationCode: "3-4-2-1", geometryVersion: 1, source: "code-default", publishedAt: null, slots: threeFourTwoOneSlots },
    },
  });
  assert.equal(threeFourTwoOne?.formationCode, "3-4-2-1");
  assert.equal(threeFourTwoOne?.players.filter((player) => player.role === "midfielder").length, 6);
  assert.deepEqual(threeFourTwoOne?.players.map(({ x, y }) => ({ x, y })), threeFourTwoOneSlots.map(({ x, y }) => ({ x, y })));

  assert.equal(buildTouchlineFantasyArenaLineup({ ...snapshot, userGameweek: { ...snapshot.userGameweek, state: "DRAFT" } }), null);
  assert.equal(buildTouchlineFantasyArenaLineup({ ...snapshot, selections: snapshot.selections.slice(0, 10) }), null);
  assert.equal(buildTouchlineFantasyArenaLineup({ ...snapshot, selections: snapshot.selections.map((selection, index) => index === 10 ? { ...selection, playerId: playerIds[0] } : selection) }), null);
  assert.equal(buildTouchlineFantasyArenaLineup({ ...snapshot, selections: snapshot.selections.map((selection, index) => index === 10 ? { ...selection, playerId: "provider-123" } : selection) }), null);
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

test("the canonical Markt window opens five minutes after the previous round finishes", async () => {
  const [migration, correction, liveSync, rollback] = await Promise.all([
    source("supabase/migrations/20260826173229_touchline_fantasy_inter_round_market_window.sql"),
    source("supabase/migrations/20260826182434_touchline_fantasy_future_gameweeks_fail_closed.sql"),
    source("lib/football-data/live-sync.ts"),
    source("supabase/qa/031_touchline_qa_fantasy_inter_round_market_window_rollback.sql"),
  ]);
  for (const gameweekSync of [migration, correction]) {
    assert.match(gameweekSync, /lag\([\s\S]*?previous_round_completed_at/i);
    assert.match(gameweekSync, /previous_round_completed_at \+ interval '5 minutes'/i);
    assert.match(gameweekSync, /first_fixture_at - make_interval\(mins => lock_offset_minutes\)/i);
    assert.match(gameweekSync, /clock_timestamp\(\) < market_opens_at then 'UPCOMING'/i);
    assert.match(gameweekSync, /clock_timestamp\(\) < locks_at then 'MARKET_OPEN'/i);
    assert.match(gameweekSync, /when round_sequence = 1 then first_fixture_at - interval '7 days'/i);
    assert.match(gameweekSync, /when previous_round_all_final then previous_round_completed_at \+ interval '5 minutes'/i);
    assert.match(gameweekSync, /else locks_at - interval '1 microsecond'/i);
    assert.match(gameweekSync, /round_sequence > 1 and not coalesce\(previous_round_all_final, false\) then 'UPCOMING'/i);
    assert.doesNotMatch(gameweekSync, /else locks_at\s+end as market_opens_at/i);
  }
  assert.match(liveSync, /syncSportmonksFixtureSchedule/);
  assert.match(liveSync, /FIXTURE_SCHEDULE_REFRESH_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(liveSync, /sync_type", "fixture_schedule"/);
  assert.match(liveSync, /return \["fixture-schedule:refresh-failed"\]/);
  assert.match(rollback, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rollback, /drop trigger if exists touchline_stamp_fixture_finalized_at/);
  assert.match(rollback, /min\(fixture\.starts_at\) - interval '7 days'/);
});

test("the customer owns club choice and every successful save is reloaded from the QA source of truth", async () => {
  const [client, domain, stateRoute, migration, rollback] = await Promise.all([
    source("app/fantasy/FantasyGameweekClient.tsx"),
    source("lib/touchlineFantasy/domain.ts"),
    source("app/api/touchline-fantasy/state/route.ts"),
    source("supabase/migrations/20260826203421_touchline_fantasy_remove_club_limit.sql"),
    source("supabase/qa/032_touchline_qa_fantasy_remove_club_limit_rollback.sql"),
  ]);
  assert.match(domain, /TOUCHLINE_FANTASY_MAX_PLAYERS_PER_CLUB = 11/);
  assert.doesNotMatch(domain, /issues\.add\("CLUB_LIMIT"\)/);
  assert.match(client, /No per-club player limit|Escolha livre de jogadores por clube/);
  assert.doesNotMatch(client, /nextValidation\.issues\.includes\("CLUB_LIMIT"\)/);
  assert.match(client, /loadPersistedLineup/);
  assert.match(client, /authoritativeFingerprint !== expectedFingerprint/);
  assert.match(client, /Rascunho gravado e verificado no TouchLine/);
  assert.match(client, /Alterações não salvas/);
  assert.match(client, /Trocar treinador/);
  assert.match(client, /Editar jogadores/);
  assert.match(stateRoute, /selections: snapshot\.selections/);
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migration, /there is no per-club cap/);
  assert.match(migration, /set max_players_per_club = 11/);
  assert.match(rollback, /TL_FANTASY_CLUB_LIMIT_EXCEEDED/);
});
