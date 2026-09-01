import type { SupabaseClient } from "@supabase/supabase-js";

import { inspectTouchlineOfficialTeamSheet } from "./official-team-sheet-readiness.ts";
import type { TouchlineFantasyFixtureFeed, TouchlineFantasyLineupMember } from "./types";

export type TouchlineOfficialLineupShirtFact = Readonly<{
  playerId: string;
  teamId: string;
  jerseyNumber: number;
  role: "STARTER" | "SUBSTITUTE";
  formationPosition: number | null;
}>;

function positiveId(value: string | undefined) {
  return typeof value === "string" && /^\d{1,20}$/.test(value.trim()) ? value.trim() : null;
}

function positiveShirt(value: number | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999 ? value : null;
}

function startingPosition(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return /^(?:[1-9]|1[01])$/.test(normalized) ? Number(normalized) : null;
}

function fact(member: TouchlineFantasyLineupMember): TouchlineOfficialLineupShirtFact | null {
  const playerId = positiveId(member.playerId);
  const teamId = positiveId(member.teamId);
  const jerseyNumber = positiveShirt(member.jerseyNumber);
  const role = member.isStarter === true && member.isSubstitute !== true
    ? "STARTER"
    : member.isSubstitute === true && member.isStarter !== true
      ? "SUBSTITUTE"
      : null;
  const formationPosition = role === "STARTER" ? startingPosition(member.formationPosition) : null;
  return playerId && teamId && jerseyNumber && role && (role === "SUBSTITUTE" || formationPosition)
    ? { playerId, teamId, jerseyNumber, role, formationPosition }
    : null;
}

/**
 * Returns facts only for a complete Premier League-style official sheet:
 * two clubs, each with exactly 11 unique starters and nine unique substitutes.
 */
export function selectTouchlineOfficialLineupShirtFacts(feed: TouchlineFantasyFixtureFeed) {
  if (!inspectTouchlineOfficialTeamSheet(feed).completeTeamSheetsReady) {
    return [] as TouchlineOfficialLineupShirtFact[];
  }
  const homeTeamId = positiveId(feed.fixture.homeTeam?.providerId);
  const awayTeamId = positiveId(feed.fixture.awayTeam?.providerId);
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return [] as TouchlineOfficialLineupShirtFact[];
  const facts = feed.lineups.map(fact);
  if (facts.some((entry) => entry === null)) return [] as TouchlineOfficialLineupShirtFact[];
  const complete = facts as TouchlineOfficialLineupShirtFact[];
  const allowedTeams = new Set([homeTeamId, awayTeamId]);
  if (complete.some((entry) => !allowedTeams.has(entry.teamId))) return [];
  if (new Set(complete.map((entry) => entry.playerId)).size !== complete.length) return [];
  for (const teamId of allowedTeams) {
    const team = complete.filter((entry) => entry.teamId === teamId);
    if (team.filter((entry) => entry.role === "STARTER").length !== 11) return [];
    if (team.filter((entry) => entry.role === "SUBSTITUTE").length !== 9) return [];
  }
  return complete;
}

type ReconcileRpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function reconcileTouchlineProvisionalShirtsFromOfficialLineup(input: Readonly<{
  admin: SupabaseClient;
  feed: TouchlineFantasyFixtureFeed;
  persistedAt: string;
}>) {
  const facts = selectTouchlineOfficialLineupShirtFacts(input.feed);
  if (!facts.length) return { reconciled: false, reason: "official-lineup-not-ready" } as const;
  const { data, error } = await (input.admin as unknown as ReconcileRpc).rpc("touchline_card_engine_reconcile_official_lineup_shirts", {
    p_provider_fixture_id: input.feed.fixture.providerId,
    p_persisted_at: input.persistedAt,
    p_facts: facts,
  });
  if (error) return { reconciled: false, reason: error.message } as const;
  return { reconciled: true, result: data } as const;
}
