import type { TouchlineCardZoomDetails } from "../../components/touchline/cards/TouchlineCardZoom.tsx";
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
} from "./position-aware-card-stats.ts";

export type TouchlineCardZoomExtraField = Readonly<{
  label: string;
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
): TouchlineCardZoomExtraField[] {
  const statistics = projectTouchlineCardStatsByPosition(input);
  if (!statistics) return [];
  const pt = locale === "pt-BR";
  const labels: Record<TouchlineCardStatId, readonly [string, string]> = {
    goals: ["Goals", "Gols"],
    assists: ["Assists", "Assistências"],
    defense: ["DEF score", "Pontuação DEF"],
    cleanSheets: ["Clean sheets", "Jogos sem sofrer gols"],
    cards: ["Cards", "Cartões"],
    yellowCards: ["Yellow cards", "Cartões amarelos"],
    redCards: ["Red cards", "Cartões vermelhos"],
    saves: ["Saves", "Defesas"],
    goalsConceded: ["Goals conceded", "Gols sofridos"],
    minutes: ["Minutes", "Minutos"],
    appearances: ["Appearances", "Aparições"],
    shotsOnTarget: ["Shots on target", "Chutes no gol"],
    shotsOffTarget: ["Shots off target", "Chutes para fora"],
    defensiveActionsTotal: ["Defensive actions (DAT)", "Ações defensivas (DAT)"],
    penaltySaves: ["Penalty saves", "Pênaltis defendidos"],
    penaltiesMissed: ["Penalties missed", "Pênaltis perdidos"],
    ownGoals: ["Own goals", "Gols contra"],
    rating: ["Rating", "Nota"],
  };

  return touchlineMatchFactKeysForPosition(input.position).flatMap((key) => {
    if (!(key in statistics)) return [];
    const value = statistics[key];
    const [englishLabel, portugueseLabel] = labels[key];
    const icons: Partial<Record<TouchlineCardStatId, string>> = {
      goals: "goal", assists: "assist", defense: "defense", cleanSheets: "clean-sheet", cards: "cards",
      yellowCards: "yellow-card", redCards: "red-card", saves: "saves", shotsOnTarget: "shots-on-target",
      shotsOffTarget: "shots-off-target", defensiveActionsTotal: "defense", penaltySaves: "saves",
      penaltiesMissed: "penalty-missed", ownGoals: "own-goal", rating: "rating", minutes: "minutes", appearances: "appearances",
    };
    return [{ label: pt ? portugueseLabel : englishLabel, value: value == null ? "—" : String(value), icon: icons[key] }];
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
  name: string;
  clubName?: string | null;
  position?: string | null;
  nationality?: string | null;
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
  cardReview?: TouchlineCardReviewPresentation | null;
  activeContractCard?: TouchlineActiveContractCardPresentation | null;
  marketValue?: string | number | null;
  marketValueSource?: "provider" | "verified-cache" | "unavailable" | null;
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
  const isPortuguese = input.locale === "pt-BR";
  const field = (
    label: string,
    value: string | number | null | undefined,
    accent = false,
    group: "identity" | "performance" = "identity",
    icon?: string,
    primary = false,
    kind?: TouchlineCardZoomExtraField["kind"],
  ) => {
    if (value === null || value === undefined || value === "") return null;
    return { label, value: String(value), accent, group, icon, primary, kind };
  };
  const publicCard = input.editorialCard
    ? {
      tierKey: input.editorialCard.tierKey,
      marketValue: input.editorialCard.marketValueEur === undefined
        ? null
        : formatTouchlineMarketValueEur(input.editorialCard.marketValueEur, input.locale),
    }
    : input.activeContractCard && touchlineArenaTierForKey(input.activeContractCard.tierKey)
      ? {
        tierKey: input.activeContractCard.tierKey,
        marketValue: null,
      }
      : null;
  const marketValue = publicCard?.marketValue
    ?? (input.marketValueState === "verified" && input.marketValue !== null && input.marketValue !== undefined
      ? String(input.marketValue)
      : null);
  const reviewRequired = input.cardReview?.state === "REVIEW_REQUIRED";
  const reviewFields = reviewRequired
    ? [
      field(
        isPortuguese ? "Status do card" : "Card status",
        isPortuguese ? "Revisão pendente" : "Review pending",
        true,
        "identity",
        "status",
      ),
      ...(!marketValue
        ? [field(isPortuguese ? "Valor de mercado" : "Market value", isPortuguese ? "Pendente" : "Pending", true, "identity", "price")]
        : []),
      ...(input.cardReview?.missingFields ?? []).map((missingField) => field(
        isPortuguese ? "Campo pendente" : "Missing field",
        touchlineCardReviewFieldLabel(missingField, input.locale),
        false,
        "identity",
        "missing-field",
      )),
    ]
    : [];
  const editorialFields = publicCard
    ? [
      field(
        isPortuguese ? "Tier do card" : "Card tier",
        touchlineCardTierName(publicCard.tierKey, input.locale),
        true,
        "identity",
        "tier",
      ),
      field(
        isPortuguese ? "Valor de mercado" : "Market value",
        marketValue ?? (isPortuguese ? "Pendente" : "Pending"),
        true,
        "identity",
        "price",
      ),
    ]
    : [];
  const baseFields = [
    ...reviewFields,
    ...editorialFields,
    field(isPortuguese ? "Clube atual" : "Current club", input.clubName, false, "identity", "club"),
    field(isPortuguese ? "Posição" : "Position", input.position, false, "identity", "position"),
    field(isPortuguese ? "Nacionalidade" : "Nationality", input.nationality, false, "identity", "nationality"),
    ...(input.extraFields ?? []).map((extra) => field(
      extra.label,
      extra.value,
      extra.accent,
      "performance",
      extra.icon ?? (extra.label.toLowerCase().includes("total rating") || extra.label.toLowerCase().includes("nota total") ? "rating" : undefined),
      extra.primary ?? (extra.label.toLowerCase().includes("total rating") || extra.label.toLowerCase().includes("nota total")),
      extra.kind,
    )),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return {
    eyebrow: input.eyebrow ?? (isPortuguese ? "Perfil do card" : "Card profile"),
    title: input.name,
    subtitle: [input.clubName, input.position].filter(Boolean).join(" · "),
    performanceTitle: isPortuguese ? "Desempenho" : "Performance",
    performanceSubtitle: isPortuguese ? "Ratings e estatísticas oficiais da partida" : "Official match ratings and statistics",
    fields: baseFields,
    profileHref: input.profileHref ?? undefined,
    profileLabel: isPortuguese ? "Ver perfil completo" : "View full profile",
    historyHref: input.historyHref ?? undefined,
    historyLabel: isPortuguese ? "Ver histórico TouchLine" : "View TouchLine history",
    cardEngineHref: input.cardEngineHref ?? undefined,
    cardEngineLabel: isPortuguese ? "EDITAR NO CARD ENGINE" : "EDIT IN CARD ENGINE",
  };
}
