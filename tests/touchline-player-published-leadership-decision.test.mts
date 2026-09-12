import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("published player leadership is immutable, snapshot-bound and fails closed for ties", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260910170851_touchline_player_published_leadership_decision.sql", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/touchlineArena/card-ranking-server.ts", import.meta.url), "utf8");
  assert.match(migration, /touchline_player_ranking_leadership_decisions/);
  assert.match(migration, /status in \('unique-leader', 'tied', 'unavailable'\)/);
  assert.match(migration, /Published TouchLine player leadership decisions are immutable/);
  assert.match(migration, /leader_count = 1/);
  assert.match(migration, /elsif leader_count > 1/);
  assert.match(migration, /jsonb_typeof\(snapshot\.ranking_payload -> 'players'\) = 'array'/);
  assert.match(migration, /else '\[\]'::jsonb/);
  assert.match(migration, /min\(player_id::text\)::uuid/);
  assert.doesNotMatch(migration, /min\(player_id\)/);
  assert.match(server, /touchline_player_ranking_leadership_decisions/);
  assert.match(server, /parsePersistedTouchlinePlayerLeadership/);
  assert.doesNotMatch(server, /payload\?\.leadershipDecision/);
});
