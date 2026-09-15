import { STUDIO_SHA, validateStudioMedia, validateStudioProvenance, type StudioMedia } from "./social-studio-contract.ts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EVENT_ARTS = new Set(["GOAL_CONFIRMED", "OWN_GOAL", "HAT_TRICK_HERO", "RED_CARD_CONFIRMED", "FULL_TIME"]);
const OFFICIAL_EVENT_SOURCE = "PERSISTED_SPORTMONKS_FINAL_MATCH_REVIEW";

type SourceBinding = Pick<StudioMedia["provenance"], "source" | "snapshotSha256" | "competitionId" | "seasonId" | "fixtureIds" | "teamIds" | "playerIds">;
/** Only a fresh server-owned canonical reader may produce this proof, never a manifest or request body.
 * The reader must reconcile the factual snapshot and publication/membership/provider mappings,
 * with matching source revision checkpoints before/after its read. This is NOT an event-trigger attestation.
 */
export type StudioPublishedSourceProof = {
  binding: SourceBinding; checkedAt: string; validUntil: string; sourceRevisionChecksum: string;
  providerIds: Record<string, string>; publishedPlayerIds: string[]; activePlayerClubs: Record<string, string>;
};
export type StudioPublishedSourceReader = (input: { media: StudioMedia; snapshot: Record<string, unknown>; now: number }) => Promise<StudioPublishedSourceProof | null>;

function sameIds(left: readonly string[], right: readonly string[]) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || new Set(left).size !== left.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((id, index) => id === expected[index]);
}

export function validateStudioOfficialDeclaration(media: StudioMedia) {
  // This is the only observed official source contract. Other art families remain blocked until
  // their published snapshot/coach/lineup adapters are specified; never bless a local replay alias.
  if (media.provenance?.source !== OFFICIAL_EVENT_SOURCE || !EVENT_ARTS.has(media.artId)) throw new Error("OFFICIAL_SOURCE_NOT_ALLOWED");
  const p = media.provenance;
  if (![p.competitionId, p.seasonId].every(id => typeof id === "string" && UUID.test(id))
    || ![p.fixtureIds, p.teamIds, p.playerIds].every(ids => Array.isArray(ids) && ids.length > 0 && ids.length <= 128 && new Set(ids).size === ids.length && ids.every(id => typeof id === "string" && UUID.test(id)))) throw new Error("OFFICIAL_SOURCE_IDS_INVALID");
  validateStudioMedia(media);
}

function rejectProhibitedLineage(value: unknown, depth = 0) {
  if (depth > 30) throw new Error("OFFICIAL_SOURCE_SNAPSHOT_MISMATCH");
  if (typeof value === "string" && /^(?:LOCAL_.*NOT_PUBLISHED|SYNTHETIC_|UNKNOWN(?:_|$))/i.test(value.trim())) throw new Error("OFFICIAL_SOURCE_NOT_ALLOWED");
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) rejectProhibitedLineage(child, depth + 1);
}

/** No implicit fallback, cached boolean, provider request or publication mutation. */
export async function verifyStudioPublishedSource(media: StudioMedia, snapshot: Record<string, unknown>, reader: StudioPublishedSourceReader | null, now: number, clock: () => number = () => now) {
  validateStudioOfficialDeclaration(media);
  validateStudioProvenance(media, now);
  rejectProhibitedLineage(snapshot);
  const p = media.provenance;
  if (!snapshot || snapshot.source !== p.source || snapshot.competitionId !== p.competitionId || snapshot.seasonId !== p.seasonId
    || snapshot.asOf !== p.asOf || snapshot.fetchedAt !== p.fetchedAt || snapshot.validUntil !== p.validUntil
    || !sameIds(snapshot.fixtureIds as string[], p.fixtureIds) || !sameIds(snapshot.teamIds as string[], p.teamIds) || !sameIds(snapshot.playerIds as string[], p.playerIds)
    || !snapshot.factualData || typeof snapshot.factualData !== "object" || Array.isArray(snapshot.factualData) || !Object.keys(snapshot.factualData).length) throw new Error("OFFICIAL_SOURCE_SNAPSHOT_MISMATCH");
  if (!reader) throw new Error("OFFICIAL_SOURCE_INTEGRATION_REQUIRED");
  try {
    const proof = await reader({ media, snapshot, now });
    const validationNow = clock();
    const b = proof?.binding;
    const ids = [p.competitionId, p.seasonId, ...p.fixtureIds, ...p.teamIds, ...p.playerIds];
    if (!proof || !b || b.source !== p.source || b.snapshotSha256 !== p.snapshotSha256 || b.competitionId !== p.competitionId || b.seasonId !== p.seasonId
      || !sameIds(b.fixtureIds, p.fixtureIds) || !sameIds(b.teamIds, p.teamIds) || !sameIds(b.playerIds, p.playerIds)
      || !Number.isFinite(validationNow) || validationNow < now
      || !STUDIO_SHA.test(proof.sourceRevisionChecksum) || !Number.isFinite(Date.parse(proof.checkedAt)) || Date.parse(proof.checkedAt) > validationNow || Date.parse(proof.checkedAt) < validationNow - 5000
      || !Number.isFinite(Date.parse(proof.validUntil)) || Date.parse(proof.validUntil) <= validationNow || Date.parse(proof.validUntil) > Date.parse(p.validUntil)
      || !ids.every(id => typeof proof.providerIds[id] === "string" && /^[1-9]\d{0,15}$/.test(proof.providerIds[id]))
      || !sameIds(proof.publishedPlayerIds, p.playerIds) || !p.playerIds.every(id => p.teamIds.includes(proof.activePlayerClubs[id]))) throw new Error("OFFICIAL_SOURCE_UNVERIFIED");
    return proof;
  } catch { throw new Error("OFFICIAL_SOURCE_UNVERIFIED"); }
}
