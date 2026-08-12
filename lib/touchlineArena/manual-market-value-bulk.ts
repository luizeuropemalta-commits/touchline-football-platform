import { prepareTouchlineManualMarketValueEditorialDecision } from "./manual-market-value-editorial.ts";
import type { TouchlineCardPublicationState } from "./editorial-card-profile.ts";

export type TouchlineManualMarketValueBulkCandidate = Readonly<{
  playerId: string;
  canonicalName: string;
  clubId: string;
  clubName: string;
  position: string | null;
  canonicalAge: number | null;
  hasOneActiveMembership: boolean;
}>;

export type TouchlineManualMarketValueBulkRowStatus =
  | "READY"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "AGE_MISMATCH"
  | "WRONG_CLUB"
  | "NO_ACTIVE_MEMBERSHIP"
  | "DUPLICATE"
  | "REVIEW_REQUIRED";

export type TouchlineManualMarketValueBulkPreviewRow = Readonly<{
  rowNumber: number;
  referenceName: string;
  referenceAge: number | null;
  marketValueEur: number | null;
  currency: "EUR" | null;
  status: TouchlineManualMarketValueBulkRowStatus;
  canonicalPlayerId: string | null;
  canonicalName: string | null;
  clubName: string | null;
  position: string | null;
  calculatedTier: string | null;
  nominalPriceGbp: number | null;
  detail: string;
}>;

export type TouchlineManualMarketValueBulkPreview = Readonly<{
  rowsReceived: number;
  rows: readonly TouchlineManualMarketValueBulkPreviewRow[];
  counts: Readonly<Record<TouchlineManualMarketValueBulkRowStatus, number>>;
}>;

const MAX_BULK_ROWS = 50;

function normalizedName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

type ParsedManualMarketValueLine =
  | Readonly<{ error: string }>
  | Readonly<{
    referenceName: string;
    referenceAge: number;
    marketValueEur: number;
    currency: "EUR";
  }>;

function parseLine(line: string): ParsedManualMarketValueLine {
  const parts = line.split("|").map((part) => part.trim());
  const referenceName = parts[0] ?? "";
  const age = Number(parts[1]);
  const amount = Number(parts[2]);
  if (!referenceName) return { error: "A player name is required." } as const;
  if (!Number.isSafeInteger(age) || age < 14 || age > 60) return { error: "A whole age between 14 and 60 is required." } as const;
  if (!Number.isSafeInteger(amount) || amount < 0) return { error: "A whole non-negative market value is required." } as const;
  if (parts.length !== 3) return { error: "Use PLAYER NAME | AGE | MARKET VALUE." } as const;
  return { referenceName, referenceAge: age, marketValueEur: amount, currency: "EUR" as const } as const;
}

function initialCounts(): Record<TouchlineManualMarketValueBulkRowStatus, number> {
  return { READY: 0, AMBIGUOUS: 0, NOT_FOUND: 0, AGE_MISMATCH: 0, WRONG_CLUB: 0, NO_ACTIVE_MEMBERSHIP: 0, DUPLICATE: 0, REVIEW_REQUIRED: 0 };
}

/**
 * Pure batch preview for the protected owner UI. It never queries a provider
 * or writes a profile. The caller must supply a canonical roster already
 * filtered to the selected club and must separately verify every candidate.
 */
export function previewTouchlineManualMarketValueBulk(input: Readonly<{
  text: string;
  selectedClubId: string;
  canonicalClubCandidates: readonly TouchlineManualMarketValueBulkCandidate[];
  outsideClubCandidates?: readonly TouchlineManualMarketValueBulkCandidate[];
  effectiveSeason: string;
  publicationState: TouchlineCardPublicationState;
  lastReviewedAt: string;
}>): TouchlineManualMarketValueBulkPreview {
  const lines = input.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const counts = initialCounts();
  const seenNames = new Set<string>();
  const rows: TouchlineManualMarketValueBulkPreviewRow[] = [];

  for (const [index, line] of lines.entries()) {
    const parsed = parseLine(line);
    const base = { rowNumber: index + 1, referenceName: "", referenceAge: null, marketValueEur: null, currency: null, canonicalPlayerId: null, canonicalName: null, clubName: null, position: null, calculatedTier: null, nominalPriceGbp: null } as const;
    if (index >= MAX_BULK_ROWS) {
      rows.push({ ...base, status: "REVIEW_REQUIRED", detail: "The maximum bulk size is 50 rows." });
      counts.REVIEW_REQUIRED += 1;
      continue;
    }
    if ("error" in parsed) {
      rows.push({ ...base, referenceName: line, status: "REVIEW_REQUIRED", detail: parsed.error });
      counts.REVIEW_REQUIRED += 1;
      continue;
    }
    const normalized = normalizedName(parsed.referenceName);
    const rowBase = { ...base, referenceName: parsed.referenceName, referenceAge: parsed.referenceAge, marketValueEur: parsed.marketValueEur, currency: parsed.currency };
    if (seenNames.has(normalized)) {
      rows.push({ ...rowBase, status: "DUPLICATE", detail: "This reference name appears more than once in the submitted batch." });
      counts.DUPLICATE += 1;
      continue;
    }
    seenNames.add(normalized);
    const matches = input.canonicalClubCandidates.filter((candidate) => normalizedName(candidate.canonicalName) === normalized);
    if (matches.length > 1) {
      rows.push({ ...rowBase, status: "AMBIGUOUS", detail: "More than one canonical player matches this name inside the selected club." });
      counts.AMBIGUOUS += 1;
      continue;
    }
    const candidate = matches[0];
    if (!candidate) {
      const outside = (input.outsideClubCandidates ?? []).some((entry) => normalizedName(entry.canonicalName) === normalized);
      rows.push({ ...rowBase, status: outside ? "WRONG_CLUB" : "NOT_FOUND", detail: outside ? "The name belongs to a different canonical club." : "No canonical player matches this name." });
      counts[outside ? "WRONG_CLUB" : "NOT_FOUND"] += 1;
      continue;
    }
    if (candidate.clubId !== input.selectedClubId) {
      rows.push({ ...rowBase, status: "WRONG_CLUB", detail: "The resolved player is outside the selected club." });
      counts.WRONG_CLUB += 1;
      continue;
    }
    if (!candidate.hasOneActiveMembership) {
      rows.push({ ...rowBase, canonicalPlayerId: candidate.playerId, canonicalName: candidate.canonicalName, clubName: candidate.clubName, position: candidate.position, status: "NO_ACTIVE_MEMBERSHIP", detail: "The player does not have exactly one active canonical membership." });
      counts.NO_ACTIVE_MEMBERSHIP += 1;
      continue;
    }
    if (candidate.canonicalAge !== null && Math.abs(candidate.canonicalAge - parsed.referenceAge) > 1) {
      rows.push({ ...rowBase, canonicalPlayerId: candidate.playerId, canonicalName: candidate.canonicalName, clubName: candidate.clubName, position: candidate.position, status: "AGE_MISMATCH", detail: "The typed age does not match the canonical date-of-birth age within the birthday tolerance." });
      counts.AGE_MISMATCH += 1;
      continue;
    }
    const decision = prepareTouchlineManualMarketValueEditorialDecision({
      playerId: candidate.playerId,
      effectiveSeason: input.effectiveSeason,
      marketValueEur: parsed.marketValueEur,
      publicationState: input.publicationState,
      lastReviewedAt: input.lastReviewedAt,
    });
    if (!decision) {
      rows.push({ ...rowBase, canonicalPlayerId: candidate.playerId, canonicalName: candidate.canonicalName, clubName: candidate.clubName, position: candidate.position, status: "REVIEW_REQUIRED", detail: "The shared tier policy refused this row." });
      counts.REVIEW_REQUIRED += 1;
      continue;
    }
    rows.push({ ...rowBase, canonicalPlayerId: candidate.playerId, canonicalName: candidate.canonicalName, clubName: candidate.clubName, position: candidate.position, calculatedTier: decision.classification.tierKey, nominalPriceGbp: decision.classification.nominalPrice, status: "READY", detail: "Exact canonical player and active membership resolved." });
    counts.READY += 1;
  }

  return Object.freeze({ rowsReceived: lines.length, rows: Object.freeze(rows), counts: Object.freeze(counts) });
}
