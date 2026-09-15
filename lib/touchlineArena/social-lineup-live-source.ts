import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readTouchlineSocialLineupDraft } from "./social-lineup-draft-server";
import { checksumTouchlineCanonicalJson } from "./social-lineup-render-source";
import { assessSocialLineupLiveReference, assessSocialLineupLiveRendered, type SocialLineupLiveReference } from "./social-lineup-live-contract";
import type { ClubOwnerSquadCard } from "./demo-data";

/** Reuses the canonical read-only reader and fails closed if any audited identity has changed. */
export async function readSocialLineupLiveSource() {
  if (process.env.NODE_ENV !== "development") return null;
  const configuredUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl || configuredUrl.replace(/\/+$/, "") !== "https://xgxbwqxjssxxuihuwmgy.supabase.co") {
    return { ok: false as const, reason: "EXACT_QA_PROJECT_REQUIRED" };
  }
  const reference = JSON.parse(await readFile(resolve(process.cwd(), "artifacts/social-studio/lineup/render-reference-20260914.json"), "utf8")) as SocialLineupLiveReference;
  const fetchedAt = new Date().toISOString();
  const gate = assessSocialLineupLiveReference(reference, Date.parse(fetchedAt));
  if (!gate.reviewable) return { ok: false as const, reason: gate.reason };
  const result = await readTouchlineSocialLineupDraft({ fixtureId: reference.fixtureId, teamId: reference.teamId });
  if (!result.ok) return result;
  const conflict = assessSocialLineupLiveRendered(reference, result.data);
  if (conflict) return { ok: false as const, reason: conflict };
  // The team-sheet review does not attest to season aggregates, ranks or ratings.
  // Null stays absent in the shared exact-card bridge; no statistic is replaced by zero.
  const withoutMetrics = (card: ClubOwnerSquadCard): ClubOwnerSquadCard => ({ ...card,
    seasonTotalRating: null, seasonTouchlinePoints: null, matchRating: null, matchTouchlinePoints: null,
    seasonStats: undefined, matchStats: undefined, matchPointContributions: undefined });
  const { capturedAt, sourceVersion, sourceChecksum: originalSourceChecksum, sourceRevisionManifest, sourceRevisionChecksum, ...original } = result.data;
  const renderSource = { ...original, caption: reference.caption,
    players: original.players.map(player => ({ ...player, card: withoutMetrics(player.card) })),
    bench: original.bench.map(withoutMetrics),
    coach: { ...original.coach, slot: { ...original.coach.slot, touchlinePoints: null, rankingPosition: null,
      scoreEvidence: null, status: "awaiting-match-evidence" as const } } };
  const sourceChecksum = checksumTouchlineCanonicalJson(renderSource);
  const draft = { ...renderSource, capturedAt, sourceVersion, sourceChecksum, sourceRevisionManifest, sourceRevisionChecksum };
  const provenance = { reference, fetchedAt, originalSourceChecksum, renderedSourceChecksum: sourceChecksum,
    referenceChecksum: checksumTouchlineCanonicalJson(reference), sourceRevisionManifest, sourceRevisionChecksum,
    metricPolicy: reference.metricPolicy, approval: reference.approval, publishable: false, gate: gate.reason };
  return { ok: true as const, draft, reference, provenance, checksum: checksumTouchlineCanonicalJson({ draft, provenance }) };
}
