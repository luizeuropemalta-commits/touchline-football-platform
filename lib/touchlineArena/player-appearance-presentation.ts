import type { TouchLinePlayerFixtureStatistics } from "./player-season-statistics.ts";

const labels = {
  pt: {
    started: "Titular",
    substitute: "Substituto",
    unused: "Não utilizado",
    absent: "Participação não confirmada",
    unavailable: "Indisponível",
  },
  en: {
    started: "Started",
    substitute: "Substitute",
    unused: "Unused",
    absent: "Participation unconfirmed",
    unavailable: "Unavailable",
  },
} as const;

/** Legacy absent rows do not prove fixture-specific squad or registration evidence. */
export function touchlinePlayerAppearanceLabel(
  status: TouchLinePlayerFixtureStatistics["appearanceStatus"] | null | undefined,
  locale: string,
): string {
  return labels[locale.toLowerCase().startsWith("pt") ? "pt" : "en"][status ?? "unavailable"];
}

export function touchlinePlayerDataSourceLabel(locale: string): string {
  return locale.toLowerCase().startsWith("pt")
    ? "Fonte: Sportmonks · cobertura por partida"
    : "Source: Sportmonks · coverage varies by match";
}
