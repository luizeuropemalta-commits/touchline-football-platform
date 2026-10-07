import type { TouchlineCardZoomDetails } from "../../components/touchline/cards/TouchlineCardZoom.tsx";
import { getTouchlineCardMatchFactLabels } from "./card-match-fact-i18n.ts";
import { getTouchlinePlayerZoomIdentityCopy } from "./player-zoom-identity-i18n.ts";
import { localizedPositionLabel } from "./position-labels.ts";
import {
  touchlineArenaTierForKey,
  touchlineCardTierName,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import {
  formatTouchlineMarketValueEur,
  type TouchlinePublicEditorialCardPresentation,
} from "./editorial-card-profile.ts";
import {
  touchlineCardReviewFieldLabel,
  type TouchlineCardReviewPresentation,
} from "./card-review-state.ts";
import {
  projectTouchlineCardStatsByPosition,
  touchlineMatchFactKeysForPosition,
  type TouchlineCardStatId,
  type TouchlineCardStats,
  type TouchlinePlayerPositionKind,
} from "./position-aware-card-stats.ts";

export type TouchlineCardZoomExtraField = Readonly<{
  label: string;
  historyDisplayLabel?: string;
  value: string | null | undefined;
  accent?: boolean;
  kind?: "rating-total" | "rating-last" | "stat" | "history";
  icon?: string;
  primary?: boolean;
}>;

/**
 * Builds the match-fact portion of a card overlay from the existing
 * allowlisted projection. This deliberately does not infer a statistic from
 * TouchLine points: absent keys stay absent, explicit zero stays visible and
 * an explicit null remains unavailable.
 */
export function buildTouchlineVerifiedMatchFactFields(
  input: Readonly<{
    position: string | null | undefined;
    statistics: TouchlineCardStats | null | undefined;
  }>,
  locale: string,
  draftLocalesEnabled = false,
): TouchlineCardZoomExtraField[] {
  const statistics = projectTouchlineCardStatsByPosition(input);
  if (!statistics) return [];
  const labels = getTouchlineCardMatchFactLabels(locale, draftLocalesEnabled);

  return touchlineMatchFactKeysForPosition(input.position).flatMap((key) => {
    if (!(key in statistics)) return [];
    const value = statistics[key];
    const icons: Record<TouchlineCardStatId, string> = {
      goals: "goal", assists: "assist", defense: "defense", cleanSheets: "clean-sheet", cards: "cards",
      yellowCards: "yellow-card", redCards: "red-card", saves: "saves", shotsOnTarget: "shots-on-target",
      shotsOffTarget: "shots-off-target", defensiveActionsTotal: "defense", penaltySaves: "saves",
      penaltiesMissed: "penalty-missed", ownGoals: "own-goal", rating: "rating", minutes: "minutes", appearances: "appearances",
      goalsConceded: "goals-conceded",
    };
    return [{ label: labels[key], value: value == null ? "—" : String(value), icon: icons[key], kind: "stat" }];
  });
}

/**
 * The scoring explanation comes from the persisted, versioned contribution
 * ledger. It is never reverse-engineered from the total shown on the card.
 */
export function buildTouchlineMatchScoringBreakdownFields(
  contributions: readonly Readonly<{
    role: "primary" | "assist" | "fact";
    ruleCode?: string;
    eventType: string;
    minute: number | null;
    quantity?: number;
    unitPoints?: number;
    points: number;
    factValue?: number;
    detail?: string;
  }>[] | null | undefined,
  locale: string,
): TouchlineCardZoomExtraField[] {
  if (!contributions?.length) return [];
  const pt = locale === "pt-BR";
  return contributions.map((contribution) => {
    const eventType = contribution.role === "assist"
      ? (pt ? "Assistência" : "Assist")
      : contribution.eventType;
    const minute = contribution.minute === null ? "" : ` ${contribution.minute}′`;
    const signedPoints = `${contribution.points > 0 ? "+" : ""}${contribution.points}`;
    const equation = contribution.quantity !== undefined && contribution.unitPoints !== undefined
      ? `${contribution.quantity} × ${contribution.unitPoints > 0 ? "+" : ""}${contribution.unitPoints} = ${signedPoints}`
      : signedPoints;
    const verifiedFact = contribution.detail
      ?? (contribution.factValue === undefined ? null : String(contribution.factValue));
    return {
      label: pt ? "Pontuação da partida" : "Match scoring",
      value: `${eventType}${minute}${verifiedFact ? ` · ${verifiedFact}` : ""} · ${equation}`,
      accent: true,
    };
  });
}

/**
 * Existing contracted cards retain their previously agreed stored terms.
 * This is deliberately separate from the editorial profile: it is a display
 * exception for an active contract, never a valuation-derived offer.
 */
type TouchlineActiveContractCardPresentation = Readonly<{
  tierKey: TouchlineCardTierKey;
  cardPrice: string;
}>;

/**
 * Shared player-card zoom model.
 *
 * Tier remains editorial. Market value is the independently verified,
 * persisted football fact displayed on every card surface; it never becomes
 * checkout authority and never recalculates the tier.
 */
export function buildTouchlinePlayerCardZoomDetails(input: Readonly<{
  locale: string;
  draftLocalesEnabled?: boolean;
  name: string;
  clubName?: string | null;
  position?: string | null;
  /** Explicit canonical role when position is already localized for display. */
  positionKind?: TouchlinePlayerPositionKind;
  nationality?: string | null;
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
  cardReview?: TouchlineCardReviewPresentation | null;
  activeContractCard?: TouchlineActiveContractCardPresentation | null;
  marketValue?: string | number | null;
  marketValueSource?: "provider" | "verified-cache" | "provisional-fallback" | "unavailable" | null;
  marketValueState?: string | null;
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
  classificationState?: string | null;
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
  cardTier?: string | null;
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
  cardPriceAuthority?: "active-contract" | null;
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
  cardPriceVersion?: string | null;
  touchlinePoints?: string | number | null;
  profileHref?: string | null;
  historyHref?: string | null;
  cardEngineHref?: string | null;
  eyebrow?: string;
  extraFields?: readonly TouchlineCardZoomExtraField[];
}>): TouchlineCardZoomDetails {
  const copy = getTouchlinePlayerZoomIdentityCopy(input.locale, input.draftLocalesEnabled);
  const displayPosition = localizedPositionLabel(input.position, input.locale, input.draftLocalesEnabled);
  const field = (
    label: string,
    value: string | number | null | undefined,
    accent = false,
    group: "identity" | "performance" = "identity",
    icon?: string,
    primary = false,
    kind?: TouchlineCardZoomExtraField["kind"],
    historyDisplayLabel?: string,
  ) => {
    if (value === null || value === undefined || value === "") return null;
    return { label, value: String(value), accent, group, icon, primary, kind, historyDisplayLabel };
  };
  const publicCard = input.editorialCard
    ? {
      tierKey: input.editorialCard.tierKey,
      marketValueState: input.editorialCard.marketValueState ?? "verified" as const,
      marketValue: input.editorialCard.marketValueEur === undefined
        ? null
        : formatTouchlineMarketValueEur(input.editorialCard.marketValueEur, input.locale),
    }
    : input.activeContractCard && touchlineArenaTierForKey(input.activeContractCard.tierKey)
      ? {
        tierKey: input.activeContractCard.tierKey,
        marketValueState: "unavailable" as const,
        marketValue: null,
      }
      : null;
  const marketValue = publicCard?.marketValue
    ?? (input.marketValueState === "verified" && input.marketValue !== null && input.marketValue !== undefined
      ? String(input.marketValue)
      : null);
  const reviewRequired = !publicCard && input.cardReview?.state === "REVIEW_REQUIRED";
  const reviewFields = reviewRequired
    ? [
      field(
        copy.cardStatus,
        copy.reviewPending,
        true,
        "identity",
        "player-identity-status",
      ),
      ...(!marketValue
        ? [field(copy.marketValue, copy.pending, true, "identity", "player-identity-price")]
        : []),
      ...(input.cardReview?.missingFields ?? []).map((missingField) => field(
        copy.missingField,
        touchlineCardReviewFieldLabel(missingField, input.locale, input.draftLocalesEnabled),
        false,
        "identity",
        "player-identity-missing-field",
      )),
    ]
    : [];
  const editorialFields = publicCard
    ? [
      field(
        copy.cardTier,
        touchlineCardTierName(publicCard.tierKey, input.locale, input.draftLocalesEnabled),
        true,
        "identity",
        "player-identity-tier",
      ),
      field(
        publicCard.marketValueState === "provisional"
          ? copy.provisionalValue
          : copy.marketValue,
        marketValue ?? copy.pending,
        true,
        "identity",
        "player-identity-price",
      ),
    ]
    : [];
  const baseFields = [
    ...reviewFields,
    ...editorialFields,
    field(copy.currentClub, input.clubName, false, "identity", "player-identity-club"),
    field(copy.position, displayPosition, false, "identity", "player-identity-position"),
    field(copy.nationality, input.nationality, false, "identity", "player-identity-nationality"),
    ...(input.extraFields ?? []).map((extra) => field(
      extra.label,
      extra.value,
      extra.accent,
      "performance",
      extra.icon ?? (extra.label.toLowerCase().includes("total rating") || extra.label.toLowerCase().includes("nota total") ? "rating" : undefined),
      extra.primary ?? (extra.label.toLowerCase().includes("total rating") || extra.label.toLowerCase().includes("nota total")),
      extra.kind,
      extra.historyDisplayLabel,
    )),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return {
    eyebrow: input.eyebrow ?? copy.cardProfile,
    title: input.name,
    subtitle: [input.clubName, displayPosition].filter(Boolean).join(" · "),
    positionKind: input.positionKind,
    performanceTitle: copy.performance,
    performanceSubtitle: copy.performanceScope,
    fields: baseFields,
    profileHref: input.profileHref ?? undefined,
    profileLabel: copy.profile,
    historyHref: input.historyHref ?? undefined,
    historyLabel: copy.history,
    cardEngineHref: input.cardEngineHref ?? undefined,
    cardEngineLabel: copy.cardEngine,
  };
}
