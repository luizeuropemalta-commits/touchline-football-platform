import type { TouchlineCoach } from "../football-data/types";
import type { TouchlineCoachClassification } from "./coach-classification.ts";
import { classifyTouchlineCoach, TOUCHLINE_COACH_CLASSIFICATION_VERSION } from "./coach-classification.ts";
import { TOUCHLINE_ARENA_MARKET_TIERS } from "./card-rules.ts";
import { TOUCHLINE_LIVE_COACHES, touchlineCoachClassificationForProviderId, type TouchlineLiveCoachSnapshot } from "./live-coaches.ts";

export type CoachCatalogueEntry = TouchlineLiveCoachSnapshot & Readonly<{
  internalId: string | null;
  publicationId: string | null;
  classification: TouchlineCoachClassification;
  sourceKind: "legacy_seed_bootstrap" | "sportmonks.fixture.coaches";
}>;
export type CoachCatalogue = Readonly<{
  phase: "legacy" | "ready" | "unavailable";
  revision: number | null;
  current: readonly CoachCatalogueEntry[];
  history: readonly CoachCatalogueEntry[];
}>;
export const UNAVAILABLE_COACH_CATALOGUE: CoachCatalogue = Object.freeze({ phase: "unavailable", revision: null, current: [], history: [] });
export function legacyCoachCatalogue(): CoachCatalogue {
  const entries = TOUCHLINE_LIVE_COACHES.map(snapshot => ({ ...snapshot, internalId: null, publicationId: null,
    classification: touchlineCoachClassificationForProviderId(snapshot.coach.providerId)!, sourceKind: "legacy_seed_bootstrap" as const }));
  return { phase: "legacy", revision: null, current: entries, history: entries };
}
export function catalogueCoachForId(catalogue: CoachCatalogue, id: string | number | null | undefined) {
  const value = String(id ?? "");
  return catalogue.current.find(entry => entry.coach.providerId === value)
    ?? [...catalogue.history].reverse().find(entry => entry.coach.providerId === value) ?? null;
}
export function catalogueCoachForTeam(catalogue: CoachCatalogue, team: string | number | null | undefined) {
  return catalogue.current.find(entry => entry.coach.teamId === String(team ?? "")) ?? null;
}
/** A historical club association is resolved from a published version, not a current appointment. */
export function catalogueCoachForTeamHistory(catalogue: CoachCatalogue, id: string, team: string) {
  return [...catalogue.history].reverse().find(entry => entry.coach.providerId === id && entry.coach.teamId === team) ?? null;
}
export function catalogueCoachAssignments(catalogue: CoachCatalogue) {
  if (catalogue.phase === "unavailable" || catalogue.current.length !== 20) throw new Error("COACH_CATALOGUE_UNAVAILABLE");
  const approved = new Map(catalogue.history.map(entry => [entry.coach.providerId, entry]));
  return [...approved.values()].map(({ coach }) => ({ coach_provider_id: coach.providerId, club_provider_id: coach.teamId! }));
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const id = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function parseEntry(value: unknown): CoachCatalogueEntry | null {
  const row = object(value); if (!row) return null;
  const classification = object(row.classification);
  if (!id(row.providerId) || !id(row.teamId) || !uuid(row.id) || !uuid(row.publicationId)
    || typeof row.name !== "string" || !row.name.trim() || row.name.length > 120 || /[<>@\u0000-\u001f]/.test(row.name)
    || typeof row.observedAt !== "string" || !Number.isFinite(Date.parse(row.observedAt))
    || (row.sourceKind !== "legacy_seed_bootstrap" && row.sourceKind !== "sportmonks.fixture.coaches")
    || !classification || classification.coachProviderId !== row.providerId
    || classification.classificationVersion !== TOUCHLINE_COACH_CLASSIFICATION_VERSION
    || !TOUCHLINE_ARENA_MARKET_TIERS.some(tier => tier.key === classification.tierKey)
    || typeof row.countryCode3 !== "string" || !/^(?:[A-Z]{3})?$/.test(row.countryCode3)) return null;
  const coach: TouchlineCoach = { id: `sportmonks:${row.providerId}`, providerId: row.providerId, provider: "sportmonks", name: row.name,
    displayName: row.name, teamId: row.teamId, ...(typeof row.nationality === "string" ? { nationality: row.nationality } : {}),
    ...(typeof row.countryId === "string" ? { countryId: row.countryId } : {}),
    source: { provider: "sportmonks", providerId: row.providerId, lastSyncedAt: row.observedAt } };
  for (const key of ["sourceLeagueId", "sourceLeagueName", "sourceClub", "sourceSeasonId"] as const) {
    if (classification[key] !== null && (typeof classification[key] !== "string" || classification[key].length > 200)) return null;
  }
  if (classification.finalPosition !== null && (!Number.isSafeInteger(classification.finalPosition) || Number(classification.finalPosition) < 1 || Number(classification.finalPosition) > 100)
    || ![null, "champions", "runners-up", "playoff-winners"].includes(classification.promotionType as string | null)) return null;
  const captured = classifyTouchlineCoach({ coachProviderId: row.providerId, sourceLeagueId: classification.sourceLeagueId as string | null,
    sourceLeagueName: classification.sourceLeagueName as string | null, sourceClub: classification.sourceClub as string | null,
    sourceSeasonId: classification.sourceSeasonId as string | null, finalPosition: classification.finalPosition as number | null,
    promotionType: classification.promotionType as TouchlineCoachClassification["promotionType"], isNewcomer: classification.classificationReason === "newcomer" });
  if (Object.entries(captured).some(([key, value]) => classification[key] !== value)) return null;
  return { coach, countryCode3: row.countryCode3, fetchedAt: row.observedAt, internalId: row.id, publicationId: row.publicationId,
    classification: captured, sourceKind: row.sourceKind };
}
export function parseCoachCatalogue(value: unknown): CoachCatalogue {
  const row = object(value);
  if (!row || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || !Array.isArray(row.current) || row.current.length !== 20 || !Array.isArray(row.history)) return UNAVAILABLE_COACH_CATALOGUE;
  const current = row.current.map(parseEntry), history = row.history.map(parseEntry);
  if (current.some(entry => !entry) || history.some(entry => !entry)) return UNAVAILABLE_COACH_CATALOGUE;
  const entries = current as CoachCatalogueEntry[], versions = history as CoachCatalogueEntry[];
  if (new Set(entries.map(entry => entry.coach.providerId)).size !== 20 || new Set(entries.map(entry => entry.coach.teamId)).size !== 20
    || new Set(versions.map(entry => entry.publicationId)).size !== versions.length
    || entries.some(entry => !versions.some(version => version.publicationId === entry.publicationId && JSON.stringify(version) === JSON.stringify(entry)))) return UNAVAILABLE_COACH_CATALOGUE;
  return { phase: "ready", revision: Number(row.revision), current: entries, history: versions };
}

/** Validate the public transport projection as rigorously as the SQL projection. */
export function parseCoachCatalogueTransport(value: unknown): CoachCatalogue | null {
  const row = object(value);
  if (!row || !Array.isArray(row.current) || !Array.isArray(row.history)) return null;
  if (row.phase === "legacy") {
    const expected = legacyCoachCatalogue();
    return JSON.stringify(row) === JSON.stringify(expected) ? expected : null;
  }
  if (row.phase === "unavailable") return row.current.length === 0 && row.history.length === 0 && row.revision === null ? UNAVAILABLE_COACH_CATALOGUE : null;
  if (row.phase !== "ready") return null;
  const raw = (value: unknown) => {
    const entry = object(value), coach = object(entry?.coach);
    return { id: entry?.internalId, providerId: coach?.providerId, publicationId: entry?.publicationId, teamId: coach?.teamId,
      name: coach?.name, nationality: coach?.nationality, countryId: coach?.countryId, countryCode3: entry?.countryCode3,
      sourceKind: entry?.sourceKind, observedAt: entry?.fetchedAt, classification: entry?.classification };
  };
  const parsed = parseCoachCatalogue({ revision: row.revision, current: row.current.map(raw), history: row.history.map(raw) });
  return parsed.phase === "ready" ? parsed : null;
}

export type CoachEditorialCandidate = Readonly<{ id: string; revision: number; status: "pending" | "approved" | "ignored" | "published";
  providerId: string; teamId: string; name: string | null; clubName: string; sourceKind: string; sourceId: string; sourceHash: string;
  observedAt: string; fixtureAt: string | null; currentProviderId: string | null; currentName: string | null }>;
export type CoachEditorialState = Readonly<{ revision: number; publicEnabled: boolean; currentCount: number; candidates: readonly CoachEditorialCandidate[] }>;
export function parseCoachEditorial(value: unknown): CoachEditorialState | null {
  const row = object(value);
  if (!row || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || typeof row.publicEnabled !== "boolean"
    || !Number.isSafeInteger(row.currentCount) || Number(row.currentCount) < 0 || Number(row.currentCount) > 20 || !Array.isArray(row.candidates)
    || row.candidates.some(value => { const c = object(value); return !c || !uuid(c.id) || !id(c.providerId) || !id(c.teamId)
      || !Number.isSafeInteger(c.revision) || Number(c.revision) < 1 || !["pending", "approved", "ignored", "published"].includes(String(c.status))
      || typeof c.clubName !== "string" || !c.clubName || typeof c.sourceId !== "string" || typeof c.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(c.sourceHash)
      || !["legacy_seed_bootstrap", "sportmonks.fixture.coaches"].includes(String(c.sourceKind))
      || c.name !== null && (typeof c.name !== "string" || !c.name || c.name.length > 120)
      || c.currentName !== null && typeof c.currentName !== "string" || c.currentProviderId !== null && !id(c.currentProviderId)
      || c.fixtureAt !== null && (typeof c.fixtureAt !== "string" || !Number.isFinite(Date.parse(c.fixtureAt)))
      || typeof c.observedAt !== "string" || !Number.isFinite(Date.parse(c.observedAt)); })) return null;
  return row as CoachEditorialState;
}
