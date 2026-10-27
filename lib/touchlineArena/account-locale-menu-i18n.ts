import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import type { TouchLineLocale } from "./i18n.ts";

type Copy = { language: string; select: string; loading: string; saving: string; blocked: string };
const catalogues: Record<TouchLineLocale, Copy> = {
  "en-GB": { language: "Language", select: "Select language", loading: "Loading language…", saving: "Saving language…", blocked: "Language could not be confirmed." },
  "pt-BR": { language: "Idioma", select: "Selecionar idioma", loading: "Carregando idioma…", saving: "Salvando idioma…", blocked: "Não foi possível confirmar o idioma." },
  "es-ES": { language: "Idioma", select: "Seleccionar idioma", loading: "Cargando idioma…", saving: "Guardando idioma…", blocked: "No se pudo confirmar el idioma." },
  "it-IT": { language: "Lingua", select: "Seleziona lingua", loading: "Caricamento della lingua…", saving: "Salvataggio della lingua…", blocked: "Impossibile confermare la lingua." },
  "fr-FR": { language: "Langue", select: "Choisir la langue", loading: "Chargement de la langue…", saving: "Enregistrement de la langue…", blocked: "La langue n’a pas pu être confirmée." },
  "ar-SA": { language: "اللغة", select: "اختر اللغة", loading: "جارٍ تحميل اللغة…", saving: "جارٍ حفظ اللغة…", blocked: "تعذّر تأكيد اللغة." },
  "tr-TR": { language: "Dil", select: "Dil seçin", loading: "Dil yükleniyor…", saving: "Dil kaydediliyor…", blocked: "Dil doğrulanamadı." },
  "de-DE": { language: "Sprache", select: "Sprache auswählen", loading: "Sprache wird geladen…", saving: "Sprache wird gespeichert…", blocked: "Die Sprache konnte nicht bestätigt werden." },
};
export const TOUCHLINE_ACCOUNT_LOCALE_MENU_DRAFT_STATUS = "draft" as const;
export function getTouchlineAccountLocaleMenuCopy(locale?: string | null, draftLocalesEnabled = false): Copy {
  return catalogues[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
