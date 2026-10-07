import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

// Display names for the existing known inputs, not an ISO/identity resolver.
// Column order: EN, PT, ES, IT, FR, AR, TR, DE. Six drafts remain unpublished.
const labels = {
  brazil: ["Brazil", "Brasil", "Brasil", "Brasile", "Brésil", "البرازيل", "Brezilya", "Brasilien"],
  england: ["England", "Inglaterra", "Inglaterra", "Inghilterra", "Angleterre", "إنجلترا", "İngiltere", "England"],
  france: ["France", "França", "Francia", "Francia", "France", "فرنسا", "Fransa", "Frankreich"],
  norway: ["Norway", "Noruega", "Noruega", "Norvegia", "Norvège", "النرويج", "Norveç", "Norwegen"],
  spain: ["Spain", "Espanha", "España", "Spagna", "Espagne", "إسبانيا", "İspanya", "Spanien"],
  portugal: ["Portugal", "Portugal", "Portugal", "Portogallo", "Portugal", "البرتغال", "Portekiz", "Portugal"],
  italy: ["Italy", "Itália", "Italia", "Italia", "Italie", "إيطاليا", "İtalya", "Italien"],
  germany: ["Germany", "Alemanha", "Alemania", "Germania", "Allemagne", "ألمانيا", "Almanya", "Deutschland"],
  netherlands: ["Netherlands", "Holanda", "Países Bajos", "Paesi Bassi", "Pays-Bas", "هولندا", "Hollanda", "Niederlande"],
  sweden: ["Sweden", "Suécia", "Suecia", "Svezia", "Suède", "السويد", "İsveç", "Schweden"],
  denmark: ["Denmark", "Dinamarca", "Dinamarca", "Danimarca", "Danemark", "الدنمارك", "Danimarka", "Dänemark"],
  croatia: ["Croatia", "Croácia", "Croacia", "Croazia", "Croatie", "كرواتيا", "Hırvatistan", "Kroatien"],
  argentina: ["Argentina", "Argentina", "Argentina", "Argentina", "Argentine", "الأرجنتين", "Arjantin", "Argentinien"],
  belgium: ["Belgium", "Bélgica", "Bélgica", "Belgio", "Belgique", "بلجيكا", "Belçika", "Belgien"],
  ecuador: ["Ecuador", "Equador", "Ecuador", "Ecuador", "Équateur", "الإكوادور", "Ekvador", "Ecuador"],
  egypt: ["Egypt", "Egito", "Egipto", "Egitto", "Égypte", "مصر", "Mısır", "Ägypten"],
  cameroon: ["Cameroon", "Camarões", "Camerún", "Camerun", "Cameroun", "الكاميرون", "Kamerun", "Kamerun"],
  japan: ["Japan", "Japão", "Japón", "Giappone", "Japon", "اليابان", "Japonya", "Japan"],
  southKorea: ["South Korea", "Coreia do Sul", "Corea del Sur", "Corea del Sud", "Corée du Sud", "كوريا الجنوبية", "Güney Kore", "Südkorea"],
  unitedStates: ["United States", "Estados Unidos", "Estados Unidos", "Stati Uniti", "États-Unis", "الولايات المتحدة", "Amerika Birleşik Devletleri", "Vereinigte Staaten"],
  austria: ["Austria", "Áustria", "Austria", "Austria", "Autriche", "النمسا", "Avusturya", "Österreich"],
  scotland: ["Scotland", "Escócia", "Escocia", "Scozia", "Écosse", "اسكتلندا", "İskoçya", "Schottland"],
  republicOfIreland: ["Republic of Ireland", "República da Irlanda", "República de Irlanda", "Repubblica d’Irlanda", "République d’Irlande", "جمهورية أيرلندا", "İrlanda Cumhuriyeti", "Republik Irland"],
  bosniaAndHerzegovina: ["Bosnia and Herzegovina", "Bósnia e Herzegovina", "Bosnia y Herzegovina", "Bosnia ed Erzegovina", "Bosnie-Herzégovine", "البوسنة والهرسك", "Bosna-Hersek", "Bosnien und Herzegowina"],
} as const satisfies Record<string, readonly [string, string, string, string, string, string, string, string]>;
type CountryLabel = keyof typeof labels;
function column(index: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7): Readonly<Record<CountryLabel, string>> {
  return Object.fromEntries(Object.entries(labels).map(([key, row]) => [key, row[index]])) as Record<CountryLabel, string>;
}
export const TOUCHLINE_COUNTRY_LABEL_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_COUNTRY_LABEL_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_COUNTRY_LABEL_CATALOGUES = {
  "en-GB": column(0), "pt-BR": column(1), "es-ES": column(2), "it-IT": column(3),
  "fr-FR": column(4), "ar-SA": column(5), "tr-TR": column(6), "de-DE": column(7),
} satisfies Record<TouchLineLocale, Readonly<Record<CountryLabel, string>>>;

const aliases: Readonly<Record<string, CountryLabel>> = {
  brazil: "brazil", england: "england", france: "france", norway: "norway",
  spain: "spain", portugal: "portugal", italy: "italy", germany: "germany",
  netherlands: "netherlands", sweden: "sweden", denmark: "denmark", croatia: "croatia",
  argentina: "argentina", belgium: "belgium", ecuador: "ecuador", egypt: "egypt",
  cameroon: "cameroon", japan: "japan", "south korea": "southKorea",
  "korea republic": "southKorea", "united states": "unitedStates", usa: "unitedStates",
  austria: "austria", scotland: "scotland", "republic of ireland": "republicOfIreland",
  "bosnia and herzegovina": "bosniaAndHerzegovina",
};

/** Presentation only: unknown values and authoritative identity stay untouched. */
export function localizedCountryLabel(value: string | null | undefined, locale: string, draftLocalesEnabled = false) {
  const presentationLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  // Preserve English provider spelling and all unknown/ISO evidence verbatim.
  if (!value || presentationLocale === "en-GB") return value;
  const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Object.hasOwn(aliases, key) ? TOUCHLINE_COUNTRY_LABEL_CATALOGUES[presentationLocale][aliases[key]] : value;
}
