import type { SupabaseClient } from "@supabase/supabase-js";
import { touchlineFixtureState } from "@/lib/touchlineArena/fixture-state";

import {
  emptyTouchlineCoachRecord,
  touchlineCoachContractCoversFixture,
  TOUCHLINE_COACH_SCORING_VERSION,
  type TouchlineCoachContractSnapshot,
  type TouchlineCoachFixtureContext,
  type TouchlineCoachFixtureOutcome,
} from "@/lib/touchlineArena/coach-scoring";

type DbRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isContext(value: unknown): value is TouchlineCoachFixtureContext {
  return value === "home" || value === "away";
}

function isOutcome(value: unknown): value is TouchlineCoachFixtureOutcome {
  return value === "win" || value === "draw" || value === "loss";
}

function isSettlementStatus(value: unknown): value is "provisional" | "final" {
  return value === "provisional" || value === "final";
}

function recordFor(rows: DbRow[], context: TouchlineCoachFixtureContext) {
  const record = { ...emptyTouchlineCoachRecord() };
  for (const row of rows) {
    if (row.fixture_context !== context || !isOutcome(row.outcome)) continue;
    if (row.outcome === "win") record.wins += 1;
    if (row.outcome === "draw") record.draws += 1;
    if (row.outcome === "loss") record.losses += 1;
    record.touchlinePoints += integer(row.touchline_points) ?? 0;
  }
  return record;
}

export async function readTouchlineCoachContracts(
  admin: SupabaseClient,
  userId: string,
): Promise<TouchlineCoachContractSnapshot[]> {
  const { data: contracts, error: contractsError } = await admin
    .from("touchline_coach_contracts")
    .select("id,coach_provider_id,club_id,status,scoring_version,started_at,ended_at,end_reason")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (contractsError) {
    if (contractsError.code === "42P01") return [];
    throw new Error(`TL_COACH_CONTRACT_READ_FAILED:${contractsError.code ?? "unknown"}`);
  }
  const contractRows = (contracts ?? []) as DbRow[];
  if (!contractRows.length) return [];

  const contractIds = contractRows.map((row) => text(row.id)).filter((value): value is string => Boolean(value));
  const clubIds = [...new Set(contractRows.map((row) => text(row.club_id)).filter((value): value is string => Boolean(value)))];
  const [{ data: points, error: pointsError }, { data: clubs, error: clubsError }] = await Promise.all([
    admin
      .from("touchline_coach_fixture_points")
      .select("contract_id,fixture_id,fixture_context,outcome,home_score,away_score,touchline_points,settlement_status,scoring_version")
      .in("contract_id", contractIds),
    admin.from("football_clubs").select("id,provider_team_id").in("id", clubIds),
  ]);
  if (pointsError || clubsError) {
    throw new Error(`TL_COACH_CONTRACT_RELATION_READ_FAILED:${pointsError?.code ?? clubsError?.code ?? "unknown"}`);
  }
  const pointRows = (points ?? []) as DbRow[];
  const fixtureIds = [...new Set(pointRows.map((row) => text(row.fixture_id)).filter((value): value is string => Boolean(value)))];
  const { data: historyFixtures, error: historyError } = fixtureIds.length
    ? await admin.from("football_fixtures").select("id,provider_fixture_id,starts_at,status,home_club_id,away_club_id").in("id", fixtureIds)
    : { data: [], error: null };
  if (historyError) throw new Error(`TL_COACH_FIXTURE_HISTORY_READ_FAILED:${historyError.code ?? "unknown"}`);

  const clubsById = new Map(((clubs ?? []) as DbRow[]).map((row) => [text(row.id), text(row.provider_team_id)]));
  const fixturesById = new Map(((historyFixtures ?? []) as DbRow[]).map((row) => [text(row.id), row]));
  const nowFloor = new Date(Date.now() - 4 * 60 * 60 * 1_000).toISOString();

  return Promise.all(contractRows.map(async (contract) => {
    const contractId = text(contract.id) ?? "";
    const clubId = text(contract.club_id) ?? "";
    const scoringVersion = text(contract.scoring_version) === "coach_scoring_v1"
      ? "coach_scoring_v1" as const
      : TOUCHLINE_COACH_SCORING_VERSION;
    const contractPoints = pointRows.filter((row) => text(row.contract_id) === contractId && text(row.scoring_version) === scoringVersion);
    const home = recordFor(contractPoints, "home");
    const away = recordFor(contractPoints, "away");
    const contractStart = text(contract.started_at);
    // Purchased club remains an audit field. Current context must belong to
    // this coach's verified fixture receipt, even after a real-club transfer.
    // The SQL verifier checks at most six candidates in one server roundtrip.
    const { data: currentData, error: currentError } = contract.status === "active"
      ? await admin.rpc("touchline_read_verified_coach_current_fixture", { p_contract_id: contractId })
      : { data: null, error: null };
    if (currentError) throw new Error(`TL_COACH_CURRENT_FIXTURE_READ_FAILED:${currentError.code ?? "unknown"}`);
    const candidate = currentData && typeof currentData === "object" && !Array.isArray(currentData) ? currentData as DbRow : null;
    const current = candidate && text(candidate.contractId) === contractId
      && text(candidate.coachProviderId) === text(contract.coach_provider_id)
      && text(candidate.provider_fixture_id) && isContext(candidate.context)
      && touchlineFixtureState({ status: text(candidate.status) ?? undefined, startsAt: text(candidate.starts_at) ?? undefined }) === "live"
      && Number.isSafeInteger(candidate.sourceRevisionId) && Number(candidate.sourceRevisionId) > 0
      && /^[a-f0-9]{32}$/.test(text(candidate.checksum) ?? "")
      && Date.parse(text(candidate.starts_at) ?? "") >= Date.parse(nowFloor)
      && touchlineCoachContractCoversFixture({ startedAt: contractStart ?? "", endedAt: text(contract.ended_at) }, text(candidate.starts_at) ?? "")
      ? candidate : null;
    const currentContext = current && isContext(current.context) ? current.context : null;
    const fixtureHistory = contractPoints.flatMap((row) => {
      const fixture = fixturesById.get(text(row.fixture_id));
      const context = row.fixture_context;
      const outcome = row.outcome;
      const fixtureId = text(fixture?.provider_fixture_id);
      const homeScore = integer(row.home_score);
      const awayScore = integer(row.away_score);
      const touchlinePoints = integer(row.touchline_points);
      const settlementStatus = row.settlement_status;
      if (!fixtureId || !isContext(context) || !isOutcome(outcome)
          || homeScore === null || awayScore === null || touchlinePoints === null
          || !isSettlementStatus(settlementStatus)) return [];
      return [{
        fixtureId,
        context,
        outcome,
        homeScore,
        awayScore,
        touchlinePoints,
        settlementStatus,
        startsAt: text(fixture?.starts_at),
      }];
    }).sort((left, right) => Date.parse(right.startsAt ?? "") - Date.parse(left.startsAt ?? ""));

    return {
      id: contractId,
      coachProviderId: text(contract.coach_provider_id) ?? "",
      clubProviderId: clubsById.get(clubId) ?? "",
      status: contract.status === "ended" ? "ended" : "active",
      startedAt: text(contract.started_at) ?? new Date(0).toISOString(),
      endedAt: text(contract.ended_at),
      endReason: text(contract.end_reason),
      scoringVersion,
      home,
      away,
      totalTouchlinePoints: home.touchlinePoints + away.touchlinePoints,
      currentFixture: current && currentContext ? {
        fixtureId: text(current.provider_fixture_id) ?? "",
        context: currentContext,
        status: text(current.status),
        startsAt: text(current.starts_at),
        provisionalPoints: integer(current.provisionalPoints),
      } : null,
      fixtureHistory,
    } satisfies TouchlineCoachContractSnapshot;
  }));
}
