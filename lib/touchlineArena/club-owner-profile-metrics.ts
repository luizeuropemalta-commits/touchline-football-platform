import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const labels = {
  "en-GB": ["TouchLine Points", "Followers", "Following", "Unavailable"],
  "pt-BR": ["Pontos TouchLine", "Seguidores", "Seguindo", "Indisponível"],
  "es-ES": ["Puntos TouchLine", "Seguidores", "Siguiendo", "No disponible"],
  "it-IT": ["Punti TouchLine", "Follower", "Seguiti", "Non disponibile"],
  "fr-FR": ["Points TouchLine", "Abonnés", "Abonnements", "Indisponible"],
  "ar-SA": ["نقاط TouchLine", "المتابعون", "المتابَعون", "غير متاح"],
  "tr-TR": ["TouchLine Puanları", "Takipçiler", "Takip edilenler", "Kullanılamıyor"],
  "de-DE": ["TouchLine-Punkte", "Follower", "Gefolgt", "Nicht verfügbar"],
} as const;

const rankingLabels = {
  "en-GB": "Ranking", "pt-BR": "Ranking", "es-ES": "Ranking",
  "it-IT": "Classifica", "fr-FR": "Classement", "ar-SA": "الترتيب",
  "tr-TR": "Sıralama", "de-DE": "Rangliste",
} as const;

export function getClubOwnerProfileMetricsCopy(locale: string, draftLocalesEnabled = false) {
  const resolved = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const [points, followers, following, unavailable] = labels[resolved];
  return { points, followers, following, unavailable, ranking: rankingLabels[resolved], locale: resolved };
}

/** Reuse the ranking row tied to the authenticated viewer, never a display name. */
export function clubOwnerRankingPoints(rows?: readonly { isCurrentManager: boolean; score: number }[] | null): number | null {
  const ownRows = rows?.filter(row => row.isCurrentManager) ?? [];
  return ownRows.length === 1 && Number.isFinite(ownRows[0].score) ? ownRows[0].score : null;
}

export function clubOwnerRankingPosition(rows?: readonly { isCurrentManager: boolean; rank: number }[] | null): number | null {
  const ownRows = rows?.filter(row => row.isCurrentManager) ?? [];
  return ownRows.length === 1 && Number.isSafeInteger(ownRows[0].rank) && ownRows[0].rank > 0 ? ownRows[0].rank : null;
}

export function formatClubOwnerRankingPosition(rank: number, locale: string, draftLocalesEnabled = false): string {
  const resolved = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const value = rank.toLocaleString(resolved);
  if (resolved === "en-GB") {
    const suffixes: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
    return value + suffixes[new Intl.PluralRules("en-GB", { type: "ordinal" }).select(rank)];
  }
  if (resolved === "fr-FR") return `${value}${rank === 1 ? "er" : "e"}`;
  if (resolved === "de-DE" || resolved === "tr-TR") return `${value}.`;
  if (resolved === "ar-SA") return `المركز ${value}`;
  if (resolved === "es-ES") return `${value}.º`;
  return `${value}º`;
}
