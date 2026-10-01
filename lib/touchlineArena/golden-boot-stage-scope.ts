import type { FootballDataResult, TouchlineSeasonStages } from "../football-data/types.ts";
import { strictSportmonksId } from "../football-data/sportmonks-season-topscorers.ts";
import type { GoldenBootStageScope } from "./golden-boot-eligibility.ts";

type CanonicalPremierSeason = Readonly<{ leagueId: string; seasonId: string }>;

/** Normalized adapter IDs are strings; never coerce a request/name into one. */
function isId(value: unknown): value is string {
  return typeof value === "string" && strictSportmonksId(value) === value;
}

/** Adapter fetch times are UTC ISO timestamps, not provider update times. */
function fetchTime(value: unknown): number | null {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return new Date(parsed).toISOString() === normalized ? parsed : null;
}

/**
 * Premier League policy: simple domestic competition with one Regular Season
 * (Sportmonks type 223). Authority is the independent, complete stages list,
 * corroborated by an externally resolved canonical league/season, not names
 * or top-scorer rows. Multiple stages fail closed; never choose or sum them.
 *
 * Policy reference: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/leagues
 * Stage source: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/stages/get-stages-by-season-id
 *
 * Fetch age is the only freshness assertion. This scope does not confer a
 * public award, canonical player UUID, membership, publication or entitlement.
 * No caller is wired here; resolveGoldenBootEligibility retains
 * publicAwardEligible:false.
 */
export function resolveGoldenBootPremierStageScope(input: {
  evidence: FootballDataResult<TouchlineSeasonStages> | null;
  /** Must be supplied by canonical server authority, never URL selectors. */
  canonicalScope: CanonicalPremierSeason | null;
  maxAgeMs: number;
  /** Explicit clock keeps the resolver pure and deterministic. */
  nowMs: number;
}): GoldenBootStageScope | null {
  const { evidence, canonicalScope, maxAgeMs, nowMs } = input;
  if (!canonicalScope || canonicalScope.leagueId !== "8"
    || !isId(canonicalScope.seasonId)
    || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0
    || !Number.isSafeInteger(nowMs) || nowMs < 0) return null;
  if (!evidence || evidence.ok !== true || evidence.provider !== "sportmonks") return null;
  const data = evidence.data;
  if (!data || typeof data !== "object" || Array.isArray(data)
    || data.coverage !== "complete"
    || data.leagueId !== canonicalScope.leagueId
    || data.requestedSeasonId !== canonicalScope.seasonId
    || !Array.isArray(data.rows) || data.rows.length !== 1) return null;
  const fetchedAt = fetchTime(data.fetchedAt);
  if (fetchedAt === null || fetchTime(evidence.fetchedAt) !== fetchedAt
    || fetchedAt > nowMs || nowMs - fetchedAt > maxAgeMs) return null;
  const stage = data.rows[0];
  if (!stage || typeof stage !== "object" || Array.isArray(stage)
    || !isId(stage.id) || !isId(stage.leagueId) || !isId(stage.seasonId)
    || stage.leagueId !== canonicalScope.leagueId
    || stage.seasonId !== canonicalScope.seasonId || stage.typeId !== "223") return null;
  return {
    authority: "canonical-season-stage",
    leagueId: canonicalScope.leagueId,
    seasonId: canonicalScope.seasonId,
    stageId: stage.id,
  };
}
