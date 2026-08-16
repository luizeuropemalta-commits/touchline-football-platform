import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../supabase/qa/007_touchline_qa_complete_matchweek_repair.sql", import.meta.url), "utf8");

test("QA matchweek repair is isolated, reversible and preserves the existing fixture facts", () => {
  assert.match(source, /QA-only repair/);
  assert.match(source, /Never add this file to supabase\/migrations/);
  assert.match(source, /touchline_assert_qa_fixture_target\(p_project_ref\)/);
  assert.match(source, /TL_QA_MATCHWEEK_EXACT_20_CLUBS_REQUIRED/);
  assert.match(source, /touchline_rollback_qa_complete_matchweek_repair/);
  assert.match(source, /prior_pairings/);
  assert.match(source, /prior_snapshot_payload/);
  assert.match(source, /revoke all on function public\.touchline_apply_qa_complete_matchweek_repair/);
  assert.doesNotMatch(source, /vxireiswggllwhbsmdcj|SUPABASE_SERVICE_ROLE_KEY/);
});

test("QA repair produces a complete ten-match round without changing timestamps, statuses or scores", () => {
  assert.match(source, /v_club_ids\[index\],\s*v_club_ids\[index \+ 10\]/);
  assert.match(source, /v_club_ids\[index \+ 10\],\s*v_club_ids\[index\]/);
  assert.match(source, /v_first_round_clubs <> 20 or v_second_round_clubs <> 20/);
  const mutationStart = source.indexOf("with pairings(provider_fixture_id");
  const mutation = source.slice(mutationStart, source.indexOf("select jsonb_build_object(", mutationStart));
  assert.match(mutation, /set home_club_id = pairings\.home_club_id,\s*away_club_id = pairings\.away_club_id/);
  assert.doesNotMatch(mutation, /starts_at|status\s*=|home_score|away_score/);
});
