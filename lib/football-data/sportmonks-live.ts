import type { TouchlineFixture } from "@/lib/football-data/types";

export const SPORTMONKS_INPLAY_LIVESCORES_PATH = "/livescores/inplay";
export const SPORTMONKS_LATEST_LIVESCORES_PATH = "/livescores/latest";

/** Merges provider deltas without making an incomplete response replace the league snapshot. */
export function mergeTouchlineLiveFixtureDeltas(
  current: readonly TouchlineFixture[],
  deltas: readonly TouchlineFixture[],
) {
  const merged = new Map(current.map((fixture) => [fixture.providerId, fixture]));
  for (const delta of deltas) merged.set(delta.providerId, delta);
  return [...merged.values()];
}

type SportmonksLiveEntity = Record<string, unknown>;

export type SportmonksLineupRole = Readonly<{
  isStarter: boolean;
  isSubstitute: boolean;
}>;

function primitiveString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Sportmonks Football API v3 defines lineup type 11 as a starter and type 12
 * as a substitute. The numeric contract is authoritative; text is only a
 * compatibility fallback for providers/snapshots that omit type_id.
 */
export function classifySportmonksLineupRole(
  lineup: SportmonksLiveEntity,
): SportmonksLineupRole {
  const typeId = primitiveString(lineup.type_id);
  if (typeId === "11") return { isStarter: true, isSubstitute: false };
  if (typeId === "12") return { isStarter: false, isSubstitute: true };

  const type = lineup.type && typeof lineup.type === "object" && !Array.isArray(lineup.type)
    ? lineup.type as SportmonksLiveEntity
    : null;
  const fallbackText = [
    primitiveString(lineup.type),
    primitiveString(lineup.lineup_type),
    primitiveString(type?.name),
    primitiveString(type?.code),
  ].filter(Boolean).join(" ").toLowerCase();
  const isSubstitute = /bench|substitute|reserve/.test(fallbackText);

  return {
    isStarter: !isSubstitute,
    isSubstitute,
  };
}

function scoreDescription(score: SportmonksLiveEntity) {
  return primitiveString(score.description).toUpperCase();
}

function scoreDetails(score?: SportmonksLiveEntity) {
  return score?.score && typeof score.score === "object" && !Array.isArray(score.score)
    ? score.score as SportmonksLiveEntity
    : null;
}

function scorePriority(description: string) {
  if (description === "CURRENT") return 0;
  if (description === "2ND_HALF") return 1;
  if (description === "EXTRA_TIME") return 2;
  if (description === "1ST_HALF") return 3;
  if (description === "PENALTIES") return 4;
  if (description === "2ND_HALF_ONLY") return 5;
  return 100;
}

function deterministicScoreKey(score: SportmonksLiveEntity) {
  const details = scoreDetails(score);
  const description = scoreDescription(score);
  const id = finiteNumber(score.id) ?? -1;
  const goals = finiteNumber(details?.goals) ?? -1;
  return {
    description,
    goals,
    id,
    priority: scorePriority(description),
    serialized: JSON.stringify(score),
  };
}

/**
 * Returns the CURRENT score for one participant. When CURRENT is absent, a
 * fixed semantic priority and stable tie-breakers make the fallback independent
 * from Sportmonks array ordering.
 */
export function selectSportmonksParticipantScore(
  scores: readonly SportmonksLiveEntity[],
  location: "home" | "away",
) {
  const candidates = scores
    .filter((score) => primitiveString(scoreDetails(score)?.participant).toLowerCase() === location)
    .filter((score) => finiteNumber(scoreDetails(score)?.goals) !== undefined)
    .map((score) => ({ score, ...deterministicScoreKey(score) }))
    .sort((a, b) => (
      a.priority - b.priority
      || b.id - a.id
      || b.goals - a.goals
      || a.description.localeCompare(b.description)
      || a.serialized.localeCompare(b.serialized)
    ));

  return finiteNumber(scoreDetails(candidates[0]?.score)?.goals);
}
