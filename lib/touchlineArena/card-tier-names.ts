export const TOUCHLINE_CARD_TIER_KEYS = [
  "ruby-red",
  "sapphire-blue",
  "amethyst-purple",
  "radiant-gold",
  "emerald-green",
  "clear-diamond",
  "diamond-gold",
] as const;

export type TouchlineCardTierKey = (typeof TOUCHLINE_CARD_TIER_KEYS)[number];

/**
 * The one human-readable identity for each approved card tier. Economy,
 * cards and every localized surface derive labels here rather than carrying
 * their own English copy.
 */
export const TOUCHLINE_CARD_TIER_NAMES: Record<
  TouchlineCardTierKey,
  { en: string; pt: string }
> = {
  "ruby-red": { en: "Red Ruby", pt: "Rubi Vermelho" },
  "sapphire-blue": { en: "Blue Sapphire", pt: "Safira Azul" },
  "amethyst-purple": { en: "Purple Amethyst", pt: "Ametista Roxa" },
  "radiant-gold": { en: "Radiant Gold", pt: "Ouro Radiante" },
  "emerald-green": { en: "Green Emerald", pt: "Esmeralda Verde" },
  "clear-diamond": { en: "Clear Diamond", pt: "Diamante Cristalino" },
  "diamond-gold": { en: "Golden Diamond", pt: "Diamante Dourado" },
};

export function touchlineCardTierName(
  tier: TouchlineCardTierKey,
  locale: "pt-BR" | "en" | string = "en",
) {
  const names = TOUCHLINE_CARD_TIER_NAMES[tier];
  return locale === "pt-BR" ? names.pt : names.en;
}
