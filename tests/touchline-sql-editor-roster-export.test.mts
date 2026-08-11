import assert from "node:assert/strict";
import test from "node:test";

import { TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS } from "../scripts/reconcile-owner-approved-transcript-market-values.mjs";
import {
  canonicalRosterExportFromSqlEditorRows,
  parseSqlEditorCanonicalRosterCsv,
} from "../scripts/archive-touchline-sql-editor-roster-export.mjs";

const headers = [
  "competition_id", "competition_provider", "provider_competition_id", "competition_source_updated_at",
  "club_id", "club_provider", "provider_team_id", "club_name", "club_source_updated_at",
  "player_id", "player_provider", "provider_player_id", "current_club_id", "player_name", "display_name",
  "player_source_updated_at", "membership_id", "membership_status", "membership_source_updated_at",
];

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function csvFixture() {
  const competitionId = uuid(1);
  const timestamp = "2026-08-11T10:00:00.000Z";
  const rows = Object.entries(TOUCHLINE_ROSTER_AUDIT_PROVIDER_TEAM_IDS).map(([clubName, teamId], index) => [
    competitionId, "sportmonks", "8", timestamp,
    uuid(100 + index), "sportmonks", teamId, clubName, timestamp,
    uuid(200 + index), "sportmonks", String(1000 + index), uuid(100 + index), `Player ${index}`, `Player ${index}`,
    timestamp, uuid(300 + index), "active", timestamp,
  ].join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

test("parses the strict SQL Editor column contract and produces a ready 20-club export", () => {
  const roster = canonicalRosterExportFromSqlEditorRows(parseSqlEditorCanonicalRosterCsv(csvFixture()), "2026-08-11T10:01:00.000Z");
  assert.equal(roster.schemaVersion, "touchline-canonical-roster-export-v1");
  assert.equal(roster.audit.state, "ready", JSON.stringify(roster.audit));
  assert.equal(roster.clubs.length, 20);
  assert.equal(roster.players.length, 20);
  assert.equal(roster.memberships.length, 20);
});

test("rejects a changed SQL Editor projection contract", () => {
  assert.throws(
    () => parseSqlEditorCanonicalRosterCsv("player_id\n123\n"),
    /TL_SQL_EDITOR_ROSTER_CSV_COLUMNS_INVALID/,
  );
});
