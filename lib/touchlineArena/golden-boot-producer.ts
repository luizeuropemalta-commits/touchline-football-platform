import "server-only";

import { randomUUID } from "node:crypto";
import type { FootballDataProvider } from "../football-data/types.ts";
import type { SportmonksQuotaOperation, SportmonksQuotaTrace } from "../football-data/sportmonks-quota-observation.ts";
import { strictSportmonksId } from "../football-data/sportmonks-season-topscorers.ts";
import { summarizeSportmonksQuotaCooldown } from "../football-data/sportmonks-quota-cooldown.ts";
import { readGoldenBootCanonicalLeaders } from "./golden-boot-canonical-reader.ts";

type Admin = NonNullable<Parameters<typeof readGoldenBootCanonicalLeaders>[0]["admin"]>;
type Failure = "PROVIDER_UNAVAILABLE" | "EVIDENCE_INVALID" | "CANONICAL_UNAVAILABLE";
export type GoldenBootProducerOutcome = Readonly<{
  status: "stored" | "unavailable" | "unconfirmed" | "skipped";
  reason: Failure | "PERSISTENCE_UNCONFIRMED" | "WORK_NOT_DUE" | null;
  leaderCount: number;
  /** A write receipt is never the current public read authority. */
  publicAwardEligible: false;
  /** Private evidence. Null/unknown never implies spare quota. */
  providerQuota: Readonly<Record<SportmonksQuotaOperation, SportmonksQuotaTrace | null>>;
}>;
const MAX_AGE_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function revision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775807");
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function single(response: { error: unknown; data: unknown; count: number | null }) {
  return !response.error && response.count === 1 && Array.isArray(response.data) && response.data.length === 1
    ? record(response.data[0]) : null;
}

/** Internal producer. Only trusted server code supplies the admin and
 * real provider factory. No validated DTO, eligible flag or policy override can
 * bypass the canonical reader. SQL functions must be installed before wiring.
 * The dedicated server route defaults OFF; no page fetch or automatic retry
 * invokes this producer. A scheduler requires separate verified activation. */
export async function produceGoldenBootSnapshot(input: {
  admin: Admin | null;
  createProvider: () => FootballDataProvider;
}): Promise<GoldenBootProducerOutcome> {
  // Capture boundaries before the first await; caller mutation cannot switch
  // client/factory halfway through a run. Policy is module-owned and fixed.
  const { admin, createProvider } = input;
  let scope: { competitionId: string; seasonId: string; providerSeasonId: string } | null = null;
  let token: string | null = null;
  let workerGeneration: string | null = null;
  let leaseDeadline = 0;
  let failure: Failure = "CANONICAL_UNAVAILABLE";
  let quotaClosed = false;
  const providerQuota: Record<SportmonksQuotaOperation, SportmonksQuotaTrace | null> = { stages: null, topscorers: null };
  const observeQuota = (operation: SportmonksQuotaOperation) => (trace: SportmonksQuotaTrace) => {
    if (!quotaClosed) providerQuota[operation] = structuredClone(trace);
  };
  const outcome = async (status: GoldenBootProducerOutcome["status"], reason: GoldenBootProducerOutcome["reason"], leaderCount = 0): Promise<GoldenBootProducerOutcome> =>
    {
      // Late completions cannot upgrade this detached terminal snapshot.
      quotaClosed = true;
      if (admin && token && workerGeneration && status !== "skipped") {
        const quota = summarizeSportmonksQuotaCooldown(providerQuota);
        try {
          const completed = await admin.rpc("complete_touchline_golden_boot_worker", {
            p_token: token, p_generation: workerGeneration, p_status: status,
            p_quota_known: quota.known, p_cooldown_until: quota.cooldownUntil,
          });
          const receipt = record(completed.data);
          if (completed.error || receipt?.completed !== true || receipt.generation !== workerGeneration
            || !Number.isSafeInteger(receipt.notBeforeMs) || Number(receipt.notBeforeMs) <= 0) throw Error("Unconfirmed completion");
        } catch {
          // The ack may have committed. Never repeat provider work or undo a
          // successful snapshot merely because its completion receipt was lost.
          status = "unconfirmed"; reason = "PERSISTENCE_UNCONFIRMED"; leaderCount = 0;
        }
      }
      return { status, reason, leaderCount, publicAwardEligible: false, providerQuota: structuredClone(providerQuota) };
    };

  async function fail(code: Failure): Promise<GoldenBootProducerOutcome> {
    if (!admin || !scope || !token || !workerGeneration) return outcome("unavailable", code);
    try {
      const response = await admin.rpc("finish_touchline_golden_boot_refresh", {
        p_comp: scope.competitionId, p_season: scope.seasonId, p_token: token,
        p_revision: "0", p_stages: null, p_scorers: null, p_leaders: null,
        p_ttl_ms: MAX_AGE_MS, p_failure: code, p_worker_generation: workerGeneration,
      });
      const receipt = record(response.data);
      if (!response.error && receipt?.phase === "unavailable" && receipt.snapshot_id === null
        && revision(receipt.stateRevision) && receipt.stateRevision !== "0") return outcome("unavailable", code);
    } catch { /* Same-token cleanup only. Never start another run to hide failure. */ }
    // A transport failure can occur after commit, or our token was superseded.
    // Neither case authorizes clearing a newer run or asserting revocation.
    return outcome("unconfirmed", "PERSISTENCE_UNCONFIRMED");
  }

  try {
    if (!admin) return outcome("unavailable", failure);
    const competition = single(await admin.from("football_competitions")
      .select("id,provider,provider_competition_id", { count: "exact" })
      .eq("provider", "sportmonks").eq("provider_competition_id", "8").limit(2));
    if (!competition || !uuid(competition.id) || competition.provider !== "sportmonks"
      || competition.provider_competition_id !== "8") return outcome("unavailable", failure);
    const season = single(await admin.from("football_seasons")
      .select("id,provider,provider_season_id,competition_id,is_current", { count: "exact" })
      .eq("provider", "sportmonks").eq("competition_id", competition.id).eq("is_current", true).limit(2));
    if (!season || !uuid(season.id) || season.provider !== "sportmonks" || season.competition_id !== competition.id
      || season.is_current !== true || typeof season.provider_season_id !== "string"
      || strictSportmonksId(season.provider_season_id) !== season.provider_season_id) return outcome("unavailable", failure);
    scope = { competitionId: competition.id, seasonId: season.id, providerSeasonId: season.provider_season_id };
    token = randomUUID();
    const claimStart = performance.now();
    let started;
    try {
      started = await admin.rpc("try_begin_touchline_golden_boot_worker", {
        p_comp: scope.competitionId, p_season: scope.seasonId, p_token: token,
      });
    } catch { return outcome("unconfirmed", "PERSISTENCE_UNCONFIRMED"); }
    const claim = record(started.data);
    if (!started.error && claim?.acquired === false && (claim.reason === "duplicate" || claim.reason === "not_due")) {
      return outcome("skipped", "WORK_NOT_DUE");
    }
    if (started.error || claim?.acquired !== true || claim.token !== token || !revision(claim.generation)
      || claim.generation === "0" || claim.competitionId !== scope.competitionId || claim.seasonId !== scope.seasonId
      || !Number.isSafeInteger(claim.observedAtMs) || !Number.isSafeInteger(claim.leaseUntilMs)
      || Number(claim.observedAtMs) <= 0 || Number(claim.leaseUntilMs) <= Number(claim.observedAtMs)
      || Number(claim.leaseUntilMs) - Number(claim.observedAtMs) > 45_000) {
      return outcome("unconfirmed", "PERSISTENCE_UNCONFIRMED");
    }
    workerGeneration = claim.generation;
    // Charge the entire round trip against the DB-issued duration, without
    // assuming the application clock agrees with the database clock.
    leaseDeadline = claimStart + Number(claim.leaseUntilMs) - Number(claim.observedAtMs);

    failure = "PROVIDER_UNAVAILABLE";
    if (performance.now() >= leaseDeadline) return fail(failure);
    const deadline = Date.now() + 15_000;
    const provider = createProvider();
    if (provider.name !== "sportmonks") return fail(failure);
    async function bounded<T>(start: () => Promise<T>, capMs: number): Promise<T> {
      const budget = Math.min(capMs, deadline - Date.now(), Math.floor(leaseDeadline - performance.now()));
      if (budget <= 0) throw Error("Provider budget exhausted");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Promise.race installs rejection handlers even if the provider settles
        // after timeout. Adapter budgets bound its own in-flight work separately.
        return await Promise.race([
          Promise.resolve().then(start),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Provider timeout")), budget); }),
        ]);
      } finally { if (timer !== undefined) clearTimeout(timer); }
    }
    const stageBudget = Math.min(3_000, deadline - Date.now(), Math.floor(leaseDeadline - performance.now()));
    const stages = structuredClone(await bounded(() => provider.getSeasonStages({
      seasonId: scope!.providerSeasonId, leagueId: "8", totalBudgetMs: stageBudget,
      quotaObserver: observeQuota("stages"),
    }), stageBudget));
    if (!stages.ok) return fail(failure);
    const scorerBudget = Math.min(12_000, deadline - Date.now(), Math.floor(leaseDeadline - performance.now()));
    const topScorers = structuredClone(await bounded(() => provider.getSeasonTopScorers({
      seasonId: scope!.providerSeasonId, totalBudgetMs: scorerBudget, maxPages: 10,
      quotaObserver: observeQuota("topscorers"),
    }), scorerBudget));
    if (!topScorers.ok || Date.now() > deadline) return fail(failure);
    failure = "EVIDENCE_INVALID";
    if (!Array.isArray(stages.data?.rows) || stages.data.rows.length !== 1
      || !Array.isArray(topScorers.data?.rows) || topScorers.data.rows.length > 500
      || !Number.isSafeInteger(topScorers.data.pagesRead) || topScorers.data.pagesRead < 1
      || topScorers.data.pagesRead > 10) return fail(failure);

    failure = "CANONICAL_UNAVAILABLE";
    const before = await admin.rpc("read_touchline_golden_boot_source_revision");
    if (before.error || !revision(before.data)) return fail(failure);
    const sourceRevision = before.data;
    const canonical = await readGoldenBootCanonicalLeaders({
      admin, stages, topScorers, maxAgeMs: MAX_AGE_MS, now: () => Date.now(),
    });
    const after = await admin.rpc("read_touchline_golden_boot_source_revision");
    if (after.error || !revision(after.data) || after.data !== sourceRevision
      || canonical.phase === "unavailable" || !canonical.leaders.length || canonical.leaders.length > 500
      || canonical.canonicalScope?.competitionId !== scope.competitionId || canonical.canonicalScope.seasonId !== scope.seasonId
      || canonical.scope?.leagueId !== "8" || canonical.scope.seasonId !== scope.providerSeasonId
      || !canonical.expiresAt || !Number.isFinite(Date.parse(canonical.expiresAt))
      || Date.parse(canonical.expiresAt) <= Date.now()) return fail(failure);
    const leaders = canonical.leaders.map(leader => ({
      player_id: leader.playerId, provider_player_id: leader.providerPlayerId,
      club_id: leader.clubId, provider_team_id: leader.providerTeamId,
      membership_id: leader.membershipId, goals: leader.goals,
    }));
    const finished = await admin.rpc("finish_touchline_golden_boot_refresh", {
      p_comp: scope.competitionId, p_season: scope.seasonId, p_token: token,
      p_revision: sourceRevision, p_stages: stages, p_scorers: topScorers, p_leaders: leaders,
      p_ttl_ms: MAX_AGE_MS, p_failure: null, p_worker_generation: workerGeneration,
    });
    const receipt = record(finished.data);
    // A current-token validation rejection can commit revocation itself. Do
    // not send a different finish body afterward: that is a replay conflict.
    if (!finished.error && receipt?.phase === "unavailable" && receipt.snapshot_id === null
      && revision(receipt.stateRevision) && receipt.stateRevision !== "0"
      && (receipt.reason === "PROVIDER_UNAVAILABLE" || receipt.reason === "EVIDENCE_INVALID"
        || receipt.reason === "CANONICAL_UNAVAILABLE")) return outcome("unavailable", receipt.reason);
    if (finished.error || receipt?.phase !== "ready" || !uuid(receipt.snapshot_id)
      || !revision(receipt.stateRevision) || receipt.stateRevision === "0") return fail(failure);
    return outcome("stored", null, leaders.length);
  } catch {
    return fail(failure);
  }
}
