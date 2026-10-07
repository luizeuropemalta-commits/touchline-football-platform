import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  cardStatus: "Card status", reviewPending: "Review pending", marketValue: "Market value", pending: "Pending", missingField: "Missing field", cardTier: "Card tier", provisionalValue: "Provisional value",
  currentClub: "Current club", position: "Position", nationality: "Nationality", cardProfile: "Card profile", performance: "Performance",
  performanceScope: "Total rating: season total. Match statistics: selected match.", profile: "View full profile", history: "View TouchLine history", cardEngine: "EDIT IN CARD ENGINE",
  missingFields: { display_name: "Display name", shirt_number: "Shirt number", nationality: "Nationality", position: "Position", market_value: "Market Value", club_asset: "Club asset" },
} as const;
export type TouchlinePlayerZoomIdentityCopy = Readonly<Record<Exclude<keyof typeof enGB, "missingFields">, string> & {
  missingFields: Readonly<Record<keyof typeof enGB.missingFields, string>>;
}>;
export const TOUCHLINE_PLAYER_ZOOM_IDENTITY_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_PLAYER_ZOOM_IDENTITY_DRAFT_STATUS = "draft" as const;

/** Presentation only. Completeness enums/rules remain in card-review-state;
 * canonical tier, position and country values remain with their authorities.
 * Six drafts await linguistic and rendered/RTL approval, never auto-enabled.
 */
export const TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    cardStatus: "Status do card", reviewPending: "Revisão pendente", marketValue: "Valor de mercado", pending: "Pendente", missingField: "Campo pendente", cardTier: "Tier do card", provisionalValue: "Valor provisório",
    currentClub: "Clube atual", position: "Posição", nationality: "Nacionalidade", cardProfile: "Perfil do card", performance: "Desempenho",
    performanceScope: "Nota total: acumulado da temporada. Estatísticas de jogo: partida selecionada.", profile: "Ver perfil completo", history: "Ver histórico TouchLine", cardEngine: "EDITAR NO CARD ENGINE",
    missingFields: { display_name: "Nome de exibição", shirt_number: "Número da camisa", nationality: "Nacionalidade", position: "Posição", market_value: "Valor de mercado", club_asset: "Asset do clube" },
  },
  "es-ES": {
    cardStatus: "Estado de la tarjeta", reviewPending: "Revisión pendiente", marketValue: "Valor de mercado", pending: "Pendiente", missingField: "Campo pendiente", cardTier: "Nivel de la tarjeta", provisionalValue: "Valor provisional",
    currentClub: "Club actual", position: "Posición", nationality: "Nacionalidad", cardProfile: "Perfil de la tarjeta", performance: "Rendimiento",
    performanceScope: "Valoración total: acumulado de la temporada. Estadísticas de partido: partido seleccionado.", profile: "Ver perfil completo", history: "Ver historial TouchLine", cardEngine: "EDITAR EN CARD ENGINE",
    missingFields: { display_name: "Nombre visible", shirt_number: "Número de camiseta", nationality: "Nacionalidad", position: "Posición", market_value: "Valor de mercado", club_asset: "Recurso gráfico del club" },
  },
  "it-IT": {
    cardStatus: "Stato della carta", reviewPending: "Revisione in attesa", marketValue: "Valore di mercato", pending: "In attesa", missingField: "Campo mancante", cardTier: "Livello della carta", provisionalValue: "Valore provvisorio",
    currentClub: "Club attuale", position: "Posizione", nationality: "Nazionalità", cardProfile: "Profilo della carta", performance: "Prestazioni",
    performanceScope: "Valutazione totale: totale stagionale. Statistiche della partita: partita selezionata.", profile: "Visualizza il profilo completo", history: "Visualizza la cronologia TouchLine", cardEngine: "MODIFICA IN CARD ENGINE",
    missingFields: { display_name: "Nome visualizzato", shirt_number: "Numero di maglia", nationality: "Nazionalità", position: "Posizione", market_value: "Valore di mercato", club_asset: "Risorsa grafica del club" },
  },
  "fr-FR": {
    cardStatus: "Statut de la carte", reviewPending: "Révision en attente", marketValue: "Valeur marchande", pending: "En attente", missingField: "Champ manquant", cardTier: "Niveau de la carte", provisionalValue: "Valeur provisoire",
    currentClub: "Club actuel", position: "Poste", nationality: "Nationalité", cardProfile: "Profil de la carte", performance: "Performances",
    performanceScope: "Note totale : cumul de la saison. Statistiques de match : match sélectionné.", profile: "Voir le profil complet", history: "Voir l’historique TouchLine", cardEngine: "MODIFIER DANS CARD ENGINE",
    missingFields: { display_name: "Nom affiché", shirt_number: "Numéro de maillot", nationality: "Nationalité", position: "Poste", market_value: "Valeur marchande", club_asset: "Ressource graphique du club" },
  },
  "ar-SA": {
    cardStatus: "حالة البطاقة", reviewPending: "المراجعة قيد الانتظار", marketValue: "القيمة السوقية", pending: "قيد الانتظار", missingField: "حقل مفقود", cardTier: "مستوى البطاقة", provisionalValue: "قيمة مؤقتة",
    currentClub: "النادي الحالي", position: "المركز", nationality: "الجنسية", cardProfile: "ملف البطاقة", performance: "الأداء",
    performanceScope: "التقييم الإجمالي: مجموع الموسم. إحصائيات المباراة: المباراة المحددة.", profile: "عرض الملف الكامل", history: "عرض سجل TouchLine", cardEngine: "تعديل في CARD ENGINE",
    missingFields: { display_name: "اسم العرض", shirt_number: "رقم القميص", nationality: "الجنسية", position: "المركز", market_value: "القيمة السوقية", club_asset: "المورد الرسومي للنادي" },
  },
  "tr-TR": {
    cardStatus: "Kart durumu", reviewPending: "İnceleme bekleniyor", marketValue: "Piyasa değeri", pending: "Beklemede", missingField: "Eksik alan", cardTier: "Kart seviyesi", provisionalValue: "Geçici değer",
    currentClub: "Mevcut kulüp", position: "Pozisyon", nationality: "Uyruk", cardProfile: "Kart profili", performance: "Performans",
    performanceScope: "Toplam değerlendirme: sezon toplamı. Maç istatistikleri: seçilen maç.", profile: "Tam profili görüntüle", history: "TouchLine geçmişini görüntüle", cardEngine: "CARD ENGINE İLE DÜZENLE",
    missingFields: { display_name: "Görünen ad", shirt_number: "Forma numarası", nationality: "Uyruk", position: "Pozisyon", market_value: "Piyasa değeri", club_asset: "Kulüp görseli" },
  },
  "de-DE": {
    cardStatus: "Kartenstatus", reviewPending: "Überprüfung ausstehend", marketValue: "Marktwert", pending: "Ausstehend", missingField: "Fehlendes Feld", cardTier: "Kartenstufe", provisionalValue: "Vorläufiger Wert",
    currentClub: "Aktueller Verein", position: "Position", nationality: "Nationalität", cardProfile: "Kartenprofil", performance: "Leistung",
    performanceScope: "Gesamtbewertung: Saisonsumme. Spielstatistiken: ausgewähltes Spiel.", profile: "Vollständiges Profil anzeigen", history: "TouchLine-Verlauf anzeigen", cardEngine: "IN CARD ENGINE BEARBEITEN",
    missingFields: { display_name: "Anzeigename", shirt_number: "Trikotnummer", nationality: "Nationalität", position: "Position", market_value: "Marktwert", club_asset: "Vereinsgrafik" },
  },
} as const satisfies Record<TouchLineLocale, TouchlinePlayerZoomIdentityCopy>;

export function getTouchlinePlayerZoomIdentityCopy(locale?: string | null, draftLocalesEnabled = false): TouchlinePlayerZoomIdentityCopy {
  return TOUCHLINE_PLAYER_ZOOM_IDENTITY_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
