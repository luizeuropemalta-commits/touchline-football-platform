import { normalizeTouchLineLocale, type TouchLineLocale } from "./i18n.ts";

export type TouchlineClubHubLikeCopy = Readonly<{
  like: string;
  unlike: string;
  liked: string;
}>;

export const TOUCHLINE_CLUB_HUB_LIKE_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_HUB_LIKE_DRAFT_STATUS = "draft" as const;

// Presentation-only feedback. The shared EN/PT normalizer keeps drafts gated.
export const TOUCHLINE_CLUB_HUB_LIKE_CATALOGUES = {
  "en-GB": { like: "Like post", unlike: "Unlike post", liked: "Liked" },
  "pt-BR": { like: "Curtir publicação", unlike: "Descurtir publicação", liked: "Curtido" },
  "es-ES": { like: "Me gusta", unlike: "Ya no me gusta", liked: "Te gusta" },
  "it-IT": { like: "Mi piace", unlike: "Non mi piace più", liked: "Ti piace" },
  "fr-FR": { like: "J’aime", unlike: "Je n’aime plus", liked: "Aimé" },
  "ar-SA": { like: "أعجبني", unlike: "إزالة الإعجاب", liked: "أعجبك" },
  "tr-TR": { like: "Beğen", unlike: "Beğenmekten vazgeç", liked: "Beğenildi" },
  "de-DE": { like: "Gefällt mir", unlike: "Gefällt mir nicht mehr", liked: "Gefällt dir" },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubHubLikeCopy>>;

export function getTouchlineClubHubLikeCopy(locale?: string | null): TouchlineClubHubLikeCopy {
  return TOUCHLINE_CLUB_HUB_LIKE_CATALOGUES[normalizeTouchLineLocale(locale)];
}
