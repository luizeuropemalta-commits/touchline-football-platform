import type { TouchlineCardZoomDetails } from "../../components/touchline/cards/TouchlineCardZoom.tsx";
import {
  touchlineArenaTierForKey,
  touchlineCardTierName,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import {
  formatTouchlineEditorialCardPrice,
  type TouchlinePublicEditorialCardPresentation,
} from "./editorial-card-profile.ts";
import {
  touchlineCardReviewFieldLabel,
  type TouchlineCardReviewPresentation,
} from "./card-review-state.ts";

export type TouchlineCardZoomExtraField = Readonly<{
  label: string;
  value: string | null | undefined;
  accent?: boolean;
}>;

type TouchlineVerifiedMatchStats = Readonly<Partial<Record<
  "goals" | "assists" | "cleanSheets" | "saves" | "goalsConceded" | "yellowCards" | "redCards",
  string | number | null
>>>;

/**
 * Builds the match-fact portion of a card overlay from the existing
 * allowlisted projection. This deliberately does not infer a statistic from
 * TouchLine points: absent keys stay absent, explicit zero stays visible and
 * an explicit null remains unavailable.
 */
export function buildTouchlineVerifiedMatchFactFields(
  statistics: TouchlineVerifiedMatchStats | null | undefined,
  locale: string,
): TouchlineCardZoomExtraField[] {
  if (!statistics) return [];
  const pt = locale === "pt-BR";
  const facts: readonly [keyof TouchlineVerifiedMatchStats, string, string][] = [
    ["goals", "Goals", "Gols"],
    ["assists", "Assists", "Assistências"],
    ["cleanSheets", "Clean sheets", "Jogos sem sofrer gols"],
    ["saves", "Saves", "Defesas"],
    ["goalsConceded", "Goals conceded", "Gols sofridos"],
    ["yellowCards", "Yellow cards", "Cartões amarelos"],
    ["redCards", "Red cards", "Cartões vermelhos"],
  ];

  return facts.flatMap(([key, englishLabel, portugueseLabel]) => {
    if (!(key in statistics)) return [];
    const value = statistics[key];
    return [{ label: pt ? portugueseLabel : englishLabel, value: value == null ? "—" : String(value) }];
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
 * This is deliberately editorial rather than economic: player valuation,
 * valuation sources and valuation-derived ranges never cross this public UI
 * boundary. A published editorial profile may expose only its manually
 * approved tier and display price.
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
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
  marketValue?: string | number | null;
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
  marketValueSource?: "provider" | "verified-cache" | "unavailable" | null;
  /** @deprecated Retained temporarily for call-site compatibility; ignored. */
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
  const field = (label: string, value: string | number | null | undefined, accent = false) => {
    if (value === null || value === undefined || value === "") return null;
    return { label, value: String(value), accent };
  };
  const publicCard = input.editorialCard
    ? {
      tierKey: input.editorialCard.tierKey,
      cardPrice: formatTouchlineEditorialCardPrice(input.editorialCard.cardPrice, input.locale),
    }
    : input.activeContractCard && touchlineArenaTierForKey(input.activeContractCard.tierKey)
      ? {
        tierKey: input.activeContractCard.tierKey,
        cardPrice: input.activeContractCard.cardPrice,
      }
      : null;
  const reviewRequired = input.cardReview?.state === "REVIEW_REQUIRED";
  const reviewFields = reviewRequired
    ? [
      field(
        isPortuguese ? "Status do card" : "Card status",
        isPortuguese ? "Revisão pendente" : "Review pending",
        true,
      ),
      ...(!publicCard
        ? [field(isPortuguese ? "Preço do card" : "Card price", isPortuguese ? "Pendente" : "Pending", true)]
        : []),
      ...(input.cardReview?.missingFields ?? []).map((missingField) => field(
        isPortuguese ? "Campo pendente" : "Missing field",
        touchlineCardReviewFieldLabel(missingField, input.locale),
      )),
    ]
    : [];
  const editorialFields = publicCard
    ? [
      field(
        isPortuguese ? "Tier do card" : "Card tier",
        touchlineCardTierName(publicCard.tierKey, input.locale),
        true,
      ),
      field(
        isPortuguese ? "Preço do card" : "Card price",
        publicCard.cardPrice,
        true,
      ),
    ]
    : [];
  const baseFields = [
    ...reviewFields,
    ...editorialFields,
    field(isPortuguese ? "Posição" : "Position", input.position),
    field(isPortuguese ? "Nacionalidade" : "Nationality", input.nationality),
    ...(input.touchlinePoints === null || input.touchlinePoints === undefined
      ? []
      : [field(isPortuguese ? "Pontos TouchLine" : "TouchLine points", input.touchlinePoints)]),
    ...(input.extraFields ?? []).map((extra) => field(extra.label, extra.value, extra.accent)),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return {
    eyebrow: input.eyebrow ?? (isPortuguese ? "Perfil do card" : "Card profile"),
    title: input.name,
    subtitle: [input.clubName, input.position].filter(Boolean).join(" · "),
    fields: baseFields,
    profileHref: input.profileHref ?? undefined,
    profileLabel: isPortuguese ? "Ver perfil completo" : "View full profile",
    historyHref: input.historyHref ?? undefined,
    historyLabel: isPortuguese ? "Ver histórico TouchLine" : "View TouchLine history",
    cardEngineHref: input.cardEngineHref ?? undefined,
    cardEngineLabel: isPortuguese ? "EDITAR NO CARD ENGINE" : "EDIT IN CARD ENGINE",
  };
}
