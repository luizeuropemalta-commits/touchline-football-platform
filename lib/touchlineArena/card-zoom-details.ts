import type { TouchlineCardZoomDetails } from "../../components/touchline/cards/TouchlineCardZoom.tsx";
import {
  resolveTouchlineVerifiedPlayerEconomy,
  touchlineCardTierName,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import {
  formatPlayerMarketTierRange,
  formatPlayerMarketValueEur,
} from "./player-market-tiers.ts";
import {
  formatTouchlineCommercialCardPrice,
  formatTouchlineContractedCommercialCardPrice,
  resolveTouchlineCommercialCardPrice,
} from "./commercial-card-pricing.ts";
import {
  hasTouchlinePublicCardState,
  resolveTouchlinePublicCardPresentation,
  touchlinePublicCardStatusLabel,
  touchlinePublicMarketValueStatusLabel,
  type TouchlinePublicCardState,
} from "./public-card-presentation.ts";

type TouchlineCardZoomExtraField = Readonly<{
  label: string;
  value: string | null | undefined;
  accent?: boolean;
}>;

/**
 * Shared, provider-safe presentation model for every player-card zoom.
 *
 * The image is never the source of economic information. Arena, ClubHub,
 * ClubOwner and player profile call this function so the same player receives
 * the same market-value, tier and price explanation in every surface.
 */
export function buildTouchlinePlayerCardZoomDetails(input: Readonly<{
  locale: string;
  name: string;
  clubName?: string | null;
  position?: string | null;
  nationality?: string | null;
  marketValue?: string | number | null;
  marketValueSource?: "provider" | "verified-cache" | "unavailable" | null;
  marketValueState?: TouchlinePublicCardState | null;
  classificationState?: TouchlinePublicCardState | null;
  cardTier?: TouchlineCardTierKey | null;
  cardPriceAuthority?: "active-contract" | null;
  cardPriceVersion?: string | null;
  touchlinePoints?: string | number | null;
  profileHref?: string | null;
  eyebrow?: string;
  extraFields?: readonly TouchlineCardZoomExtraField[];
}>): TouchlineCardZoomDetails {
  const isPortuguese = input.locale === "pt-BR";
  const updating = isPortuguese ? "Em atualização" : "Updating";
  const economy = resolveTouchlineVerifiedPlayerEconomy({
    marketValue: input.marketValue,
    marketValueSource: input.marketValueSource ?? "unavailable",
  });
  const hasCanonicalPublicState = hasTouchlinePublicCardState(input);
  const presentation = hasCanonicalPublicState
    ? resolveTouchlinePublicCardPresentation({
      marketValue: input.marketValue,
      marketValueSource: input.marketValueSource,
      marketValueState: input.marketValueState,
      classificationState: input.classificationState,
      cardTier: input.cardTier,
      cardPriceAuthority: input.cardPriceAuthority,
    })
    : null;
  const resolved = economy.status === "resolved";
  const canExposeCommercialPresentation = presentation?.canExposeCommercialPresentation
    ?? resolved;
  const tierKey = presentation?.tierKey ?? (resolved ? economy.tierKey : null);
  const contractedPrice = presentation?.isActiveContract
    ? formatTouchlineContractedCommercialCardPrice({
      tierKey,
      priceTableVersion: input.cardPriceVersion,
      competition: "england",
      locale: input.locale,
    })
    : null;
  const marketValueText = presentation
    ? presentation.marketValueState === "verified" && resolved
      ? formatPlayerMarketValueEur(economy.marketValueEur, input.locale)
      : touchlinePublicMarketValueStatusLabel(presentation.marketValueState, input.locale)
    : resolved
      ? formatPlayerMarketValueEur(economy.marketValueEur, input.locale)
      : updating;
  const tierLabel = tierKey && canExposeCommercialPresentation
    ? touchlineCardTierName(tierKey, input.locale)
    : presentation
      ? touchlinePublicCardStatusLabel(presentation.visualState, input.locale)
      : updating;
  const marketRange = canExposeCommercialPresentation && resolved
    ? formatPlayerMarketTierRange(economy.tier, input.locale)
    : presentation
      ? touchlinePublicCardStatusLabel(presentation.visualState, input.locale)
      : updating;
  const cardPrice = canExposeCommercialPresentation && tierKey
    ? contractedPrice ?? formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
      tierKey,
      competition: "england",
    }))
    : presentation
      ? touchlinePublicCardStatusLabel(presentation.visualState, input.locale)
      : updating;
  const field = (label: string, value: string | number | null | undefined, accent = false) => ({
    label,
    value: value === null || value === undefined || value === "" ? updating : String(value),
    accent,
  });

  return {
    eyebrow: input.eyebrow ?? (isPortuguese ? "Perfil económico oficial" : "Official economic profile"),
    title: input.name,
    subtitle: [input.clubName, input.position].filter(Boolean).join(" · "),
    fields: [
      field(isPortuguese ? "Valor de mercado" : "Market value", marketValueText, presentation ? presentation.marketValueState === "verified" && resolved : resolved),
      field(isPortuguese ? "Borda oficial" : "Official tier", tierLabel, Boolean(tierKey && canExposeCommercialPresentation)),
      field(isPortuguese ? "Faixa de valor" : "Market range", marketRange),
      field(isPortuguese ? "Preço do card" : "Card price", cardPrice, Boolean(tierKey && canExposeCommercialPresentation)),
      field(isPortuguese ? "Posição" : "Position", input.position),
      field(isPortuguese ? "Nacionalidade" : "Nationality", input.nationality),
      ...(input.touchlinePoints === null || input.touchlinePoints === undefined
        ? []
        : [field(isPortuguese ? "Pontos TouchLine" : "TouchLine points", input.touchlinePoints)]),
      ...(input.extraFields ?? []).map((extra) => field(extra.label, extra.value, extra.accent)),
    ],
    profileHref: input.profileHref ?? undefined,
    profileLabel: isPortuguese ? "Ver perfil completo" : "View full profile",
  };
}
