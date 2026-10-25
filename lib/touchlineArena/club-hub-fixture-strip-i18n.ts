import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export const CLUB_HUB_STRIP_COPY = {
  "en-GB": { pause: "Pause movement", play: "Resume movement" },
  "pt-BR": { pause: "Pausar movimento", play: "Retomar movimento" },
  "es-ES": { pause: "Pausar movimiento", play: "Reanudar movimiento" },
  "it-IT": { pause: "Metti in pausa", play: "Riprendi movimento" },
  "fr-FR": { pause: "Suspendre le mouvement", play: "Reprendre le mouvement" },
  "ar-SA": { pause: "إيقاف الحركة", play: "استئناف الحركة" },
  "tr-TR": { pause: "Hareketi duraklat", play: "Hareketi sürdür" },
  "de-DE": { pause: "Bewegung pausieren", play: "Bewegung fortsetzen" },
} as const;

const navigation = {
  "en-GB": { previous: "Previous matches", next: "Next matches", unavailable: "Matches could not be loaded. Try again by reloading the page." },
  "pt-BR": { previous: "Partidas anteriores", next: "Próximas partidas", unavailable: "Não foi possível carregar as partidas. Recarregue a página para tentar novamente." },
  "es-ES": { previous: "Partidos anteriores", next: "Próximos partidos", unavailable: "No se pudieron cargar los partidos. Recarga la página para volver a intentarlo." },
  "it-IT": { previous: "Partite precedenti", next: "Partite successive", unavailable: "Impossibile caricare le partite. Ricarica la pagina per riprovare." },
  "fr-FR": { previous: "Matchs précédents", next: "Matchs suivants", unavailable: "Impossible de charger les matchs. Rechargez la page pour réessayer." },
  "ar-SA": { previous: "المباريات السابقة", next: "المباريات التالية", unavailable: "تعذر تحميل المباريات. أعد تحميل الصفحة للمحاولة مرة أخرى." },
  "tr-TR": { previous: "Önceki maçlar", next: "Sonraki maçlar", unavailable: "Maçlar yüklenemedi. Tekrar denemek için sayfayı yenileyin." },
  "de-DE": { previous: "Vorherige Spiele", next: "Nächste Spiele", unavailable: "Spiele konnten nicht geladen werden. Laden Sie die Seite erneut, um es noch einmal zu versuchen." },
} as const;
export function getClubHubStripCopy(locale: string, draftLocalesEnabled = false) {
  const key = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { ...CLUB_HUB_STRIP_COPY[key], ...navigation[key] };
}
