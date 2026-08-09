import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCanonicalRosterExport,
  readOnlyConnectionConfig,
} from "../scripts/export-touchline-canonical-roster-readonly.mjs";
import { TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS } from "../scripts/reconcile-owner-approved-transcript-market-values.mjs";

const source = readFileSync(
  new URL("../scripts/export-touchline-canonical-roster-readonly.mjs", import.meta.url),
  "utf8",
);
const timestamp = "2026-08-09T18:00:00.000Z";

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function jwt(payload: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function snapshot() {
  const competitionId = uuid(1);
  const teams = Object.entries(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS);
  const clubs = teams.map(([name, providerTeamId], index) => ({
    id: uuid(index + 10),
    provider: "sportmonks",
    provider_team_id: providerTeamId,
    competition_id: competitionId,
    name,
    source_updated_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const players = clubs.map((club, index) => ({
    id: uuid(index + 100),
    provider: "sportmonks",
    provider_player_id: String(1000 + index),
    current_club_id: club.id,
    name: `Player ${club.provider_team_id}`,
    display_name: `Player ${club.provider_team_id}`,
    source_updated_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const memberships = players.map((player, index) => ({
    id: uuid(index + 200),
    provider: "sportmonks",
    club_id: clubs[index].id,
    player_id: player.id,
    competition_id: competitionId,
    status: "active",
    source_updated_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  return {
    competitions: [{
      id: competitionId,
      provider: "sportmonks",
      provider_competition_id: "8",
      name: "Premier League",
      source_updated_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    }],
    clubs,
    players,
    memberships,
    syncRuns: [{
      id: uuid(300),
      provider: "sportmonks",
      sync_type: "squad",
      status: "success",
      competition_id: competitionId,
      club_id: clubs[0].id,
      started_at: timestamp,
      completed_at: timestamp,
      records_created: 0,
      records_updated: 20,
      records_skipped: 0,
    }],
  };
}

test("canonical export is deterministic and proves the complete 20-club active roster scope", () => {
  const input = snapshot();
  const forward = buildCanonicalRosterExport({ ...input, exportedAt: timestamp });
  const reversed = buildCanonicalRosterExport({
    ...input,
    exportedAt: "2026-08-09T19:00:00.000Z",
    clubs: [...input.clubs].reverse(),
    players: [...input.players].reverse(),
    memberships: [...input.memberships].reverse(),
  });
  assert.equal(forward.schemaVersion, "touchline-canonical-roster-export-v1");
  assert.equal(forward.source.sourceRevision, reversed.source.sourceRevision);
  assert.equal(forward.audit.state, "ready");
  assert.equal(forward.audit.scopeChecks.length, 20);
  assert.ok(forward.audit.scopeChecks.every((check: { state: string; activeMembershipCount: number }) => check.state === "READY" && check.activeMembershipCount === 1));
  assert.equal(forward.audit.exceptionalMemberships.length, 0);
});

test("canonical export preserves invalid active rows as exceptions rather than filtering them", () => {
  const input = snapshot();
  input.memberships[0] = { ...input.memberships[0], provider: "other-provider" };
  const document = buildCanonicalRosterExport({ ...input, exportedAt: timestamp });
  assert.equal(document.audit.state, "incomplete");
  assert.equal(document.audit.exceptionalMemberships.length, 1);
  assert.deepEqual(document.audit.exceptionalMemberships[0].reasons, ["MEMBERSHIP_PROVIDER_NOT_SPORTMONKS"]);
});

test("read-only connection requires a dedicated authenticated token and never accepts service role semantics", () => {
  const environment = {
    TOUCHLINE_ROSTER_EXPORT_MODE: "read-only",
    TOUCHLINE_ROSTER_EXPORT_URL: "https://example.supabase.co",
    TOUCHLINE_ROSTER_EXPORT_ANON_KEY: jwt({ role: "anon", aud: "authenticated" }),
    TOUCHLINE_ROSTER_EXPORT_ACCESS_TOKEN: jwt({ role: "authenticated", aud: "authenticated" }),
  };
  assert.equal(readOnlyConnectionConfig(environment).url, environment.TOUCHLINE_ROSTER_EXPORT_URL);
  assert.throws(
    () => readOnlyConnectionConfig({ ...environment, TOUCHLINE_ROSTER_EXPORT_ACCESS_TOKEN: jwt({ role: "service_role", aud: "authenticated" }) }),
    /TL_ROSTER_EXPORT_AUTHENTICATED_TOKEN_REQUIRED/,
  );
  assert.throws(
    () => readOnlyConnectionConfig({ ...environment, TOUCHLINE_ROSTER_EXPORT_ANON_KEY: jwt({ role: "service_role", aud: "authenticated" }) }),
    /TL_ROSTER_EXPORT_ANON_KEY_REQUIRED/,
  );
  assert.throws(
    () => readOnlyConnectionConfig({ ...environment, TOUCHLINE_ROSTER_EXPORT_MODE: "" }),
    /TL_ROSTER_EXPORT_READ_ONLY_MODE_REQUIRED/,
  );
});

test("exporter is select-only, revision-fenced, and refuses output overwrite", () => {
  assert.match(source, /two-pass-membership-revision-fence/);
  assert.match(source, /TL_SQL_EDITOR_INCIDENT_HOLD_REQUIRES_INDEPENDENT_CLOSURE/);
  assert.ok(source.indexOf("assertSqlIncidentHold();") < source.indexOf("readOnlyConnectionConfig()"));
  assert.match(source, /TL_ROSTER_EXPORT_OUTPUT_OUTSIDE_VERSIONED_ARCHIVE_FORBIDDEN/);
  assert.match(source, /flag: "wx"/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|\.insert\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
  assert.doesNotMatch(source, /\.from\([^\n]+\)[\s\S]{0,160}\.update\s*\(/);
  assert.match(source, /\.select\(/);
  assert.match(source, /TL_ROSTER_EXPORT_REVISION_CHANGED_DURING_READ/);
});
