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
