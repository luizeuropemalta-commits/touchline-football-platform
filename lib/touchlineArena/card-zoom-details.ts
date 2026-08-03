import type { TouchlineCardZoomDetails } from "../../components/touchline/cards/TouchlineCardZoom.tsx";
import {
  resolveTouchlineVerifiedPlayerEconomy,
  touchlineCardTierName,
} from "./card-rules.ts";
import {
  formatPlayerMarketTierRange,
  formatPlayerMarketValueEur,
} from "./player-market-tiers.ts";
import {
  formatTouchlineCommercialCardPrice,
  resolveTouchlineCommercialCardPrice,
} from "./commercial-card-pricing.ts";

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
  const resolved = economy.status === "resolved";
  const tierLabel = resolved ? touchlineCardTierName(economy.tierKey, input.locale) : updating;
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
      field(isPortuguese ? "Valor de mercado" : "Market value", resolved ? formatPlayerMarketValueEur(economy.marketValueEur, input.locale) : null, resolved),
      field(isPortuguese ? "Borda oficial" : "Official tier", tierLabel, resolved),
      field(isPortuguese ? "Faixa de valor" : "Market range", resolved ? formatPlayerMarketTierRange(economy.tier, input.locale) : null),
      field(
        isPortuguese ? "Preço do card" : "Card price",
        resolved
          ? formatTouchlineCommercialCardPrice(resolveTouchlineCommercialCardPrice({
              tierKey: economy.tierKey,
              competition: "england",
            }))
          : null,
        resolved,
      ),
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
