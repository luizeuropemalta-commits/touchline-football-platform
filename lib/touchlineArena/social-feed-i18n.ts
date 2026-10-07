import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES } from "./club-hub-share-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
type Translations = readonly [string, string, string, string, string, string, string, string];
// Presentation only. Posts, factual names, actions and persistence stay with callers.
const rows = {
  officialPost: ["Official update", "Atualização oficial", "Actualización oficial", "Aggiornamento ufficiale", "Actualité officielle", "تحديث رسمي", "Resmî güncelleme", "Offizielle Aktualisierung"],
  simulationPost: ["TouchLine simulation", "Simulação TouchLine", "Simulación TouchLine", "Simulazione TouchLine", "Simulation TouchLine", "محاكاة TouchLine", "TouchLine simülasyonu", "TouchLine-Simulation"],
  ownerPost: ["ClubOwner post", "Publicação do ClubOwner", "Publicación de ClubOwner", "Post di ClubOwner", "Publication ClubOwner", "منشور ClubOwner", "ClubOwner gönderisi", "ClubOwner-Beitrag"],
  verifiedProfile: ["Verified profile", "Perfil verificado", "Perfil verificado", "Profilo verificato", "Profil vérifié", "ملف شخصي موثّق", "Doğrulanmış profil", "Verifiziertes Profil"],
  empty: ["Official updates will appear here.", "As atualizações oficiais aparecerão aqui.", "Las actualizaciones oficiales aparecerán aquí.", "Gli aggiornamenti ufficiali appariranno qui.", "Les actualités officielles apparaîtront ici.", "ستظهر التحديثات الرسمية هنا.", "Resmî güncellemeler burada görünecek.", "Offizielle Aktualisierungen erscheinen hier."],
  feed: ["TouchLine feed", "Feed TouchLine", "Feed de TouchLine", "Feed TouchLine", "Fil TouchLine", "موجز TouchLine", "TouchLine akışı", "TouchLine-Feed"],
  title: ["Updates centre", "Central de atualizações", "Centro de actualizaciones", "Centro aggiornamenti", "Centre d’actualités", "مركز التحديثات", "Güncelleme merkezi", "Aktualisierungszentrale"],
  description: ["Real football meets card progression in a visual, automatic and verified feed.", "O futebol real encontra a evolução do card em um feed visual, automático e verificado.", "El fútbol real y la evolución de las tarjetas se unen en un feed visual, automático y verificado.", "Il calcio reale incontra l’evoluzione delle carte in un feed visivo, automatico e verificato.", "Le football réel rencontre la progression des cartes dans un fil visuel, automatique et vérifié.", "تلتقي كرة القدم الحقيقية بتطور البطاقات في موجز مرئي وتلقائي وموثّق.", "Gerçek futbol, görsel, otomatik ve doğrulanmış bir akışta kart gelişimiyle buluşur.", "Echter Fußball trifft auf Kartenentwicklung in einem visuellen, automatischen und verifizierten Feed."],
  safeguards: ["Feed safeguards", "Proteções do feed", "Protecciones del feed", "Protezioni del feed", "Protections du fil", "ضمانات الموجز", "Akış korumaları", "Feed-Schutzmaßnahmen"],
  officialData: ["Official data", "Dados oficiais", "Datos oficiales", "Dati ufficiali", "Données officielles", "بيانات رسمية", "Resmî veriler", "Offizielle Daten"],
  privateStrategy: ["Private strategy", "Estratégia privada", "Estrategia privada", "Strategia privata", "Stratégie privée", "استراتيجية خاصة", "Özel strateji", "Private Strategie"],
  summary: ["Profile summary", "Resumo do perfil", "Resumen del perfil", "Riepilogo del profilo", "Résumé du profil", "ملخص الملف الشخصي", "Profil özeti", "Profilübersicht"],
  filters: ["Filter updates", "Filtrar notícias", "Filtrar actualizaciones", "Filtra aggiornamenti", "Filtrer les actualités", "تصفية التحديثات", "Güncellemeleri filtrele", "Aktualisierungen filtern"],
  all: ["All", "Tudo", "Todo", "Tutto", "Tout", "الكل", "Tümü", "Alle"],
  official: ["Official", "Oficial", "Oficial", "Ufficiale", "Officiel", "رسمي", "Resmî", "Offiziell"],
  simulation: ["Simulation", "Simulação", "Simulación", "Simulazione", "Simulation", "محاكاة", "Simülasyon", "Simulation"],
  featured: ["Featured on profile", "Em destaque no perfil", "Destacado en el perfil", "In evidenza sul profilo", "À la une du profil", "مميز في الملف الشخصي", "Profilde öne çıkan", "Im Profil hervorgehoben"],
  likesUnavailable: ["Likes unavailable", "Curtidas indisponíveis", "Me gusta no disponibles", "Mi piace non disponibili", "Mentions J’aime indisponibles", "الإعجابات غير متاحة", "Beğeniler kullanılamıyor", "Gefällt-mir-Angaben nicht verfügbar"],
  likesUnavailableReason: ["Post likes unavailable: persistence integration pending.", "Curtidas indisponíveis: integração de publicações pendente.", "Me gusta no disponibles: integración de almacenamiento de publicaciones pendiente.", "Mi piace ai post non disponibili: integrazione dell’archiviazione in attesa.", "Mentions J’aime des publications indisponibles : intégration du stockage en attente.", "الإعجابات بالمنشورات غير متاحة: تكامل التخزين الدائم قيد الانتظار.", "Gönderi beğenileri kullanılamıyor: kalıcı kayıt entegrasyonu bekleniyor.", "Gefällt-mir-Angaben für Beiträge nicht verfügbar: Speicherintegration ausstehend."],
  profileDetails: ["{name} profile details", "Detalhes do perfil de {name}", "Detalles del perfil de {name}", "Dettagli del profilo di {name}", "Détails du profil de {name}", "تفاصيل الملف الشخصي لـ {name}", "{name} profil ayrıntıları", "Profildetails von {name}"],
} as const satisfies Record<string, Translations>;

type FeedCopy = Readonly<Record<keyof typeof rows, string> & { shared: string; copied: string; shareUnavailable: string; share: string }>;
export const TOUCHLINE_SOCIAL_FEED_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_SOCIAL_FEED_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_SOCIAL_FEED_CATALOGUES = Object.fromEntries(locales.map((locale, index) => {
  const sharing = TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES[locale];
  return [locale, {
    ...Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]])),
    shared: sharing.shared, copied: sharing.copied,
    // Preserve existing EN/PT feed-specific wording; reuse draft share copy.
    shareUnavailable: locale === "en-GB" ? "Unavailable" : locale === "pt-BR" ? "Indisponível" : sharing.unavailable,
    share: locale === "en-GB" ? "Share" : sharing.idle,
  }];
})) as Readonly<Record<TouchLineLocale, FeedCopy>>;

export function getTouchlineSocialFeedCopy(locale?: string | null, draftLocalesEnabled = false): FeedCopy {
  return TOUCHLINE_SOCIAL_FEED_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function touchlineSocialProfileDetailsLabel(name: string, locale?: string | null, draftLocalesEnabled = false): string {
  return getTouchlineSocialFeedCopy(locale, draftLocalesEnabled).profileDetails.replace("{name}", () => name);
}
