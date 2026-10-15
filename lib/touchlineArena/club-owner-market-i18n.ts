import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  nameUnavailable: "Name unavailable", photoAria: "Change profile photo — unavailable", photoUnavailable: "Photo updates are not available yet",
  yourProfile: "YOUR PROFILE", location: "Location", nationality: "Nationality", memberSince: "Member since", watchIntro: "Watch intro",
  plan: "My plan", planStandard: "Standard", planPro: "PRO", planActive: "ACTIVE", planInactive: "NOT ACTIVE", marketPower: "Market power", marketPowerUnavailable: "Market power unavailable", activatePlan: "Activate plan", renewPlan: "Renew",
  proMember: "PRO MEMBER", proAccess: "PRO ACCESS", proPrivileges: "Exclusive member benefits",
  planUntil: "Valid until {date}", planActiveNoEnd: "Your plan is active.", planInactiveDetail: "Activate a plan to manage your XI.", planStandardPrice: "€49.90/season", planStandardBenefit: "Full access to the game and rankings.", planProPrice: "€89.90/season", planProBenefit: "Premium visual, history, reports and alerts.",
  planActionUnavailable: "Plan activation and renewal are not available yet.", virtualBudgetSeparate: "Your XI budget remains separate from your plan.",
} as const;

export type TouchlineClubOwnerMarketCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_STATUS = "draft" as const;

/** Presentation only: photo editing and purchases remain unavailable.
 * Six new catalogues are drafts, not evidence of human/RTL review or runtime
 * readiness. No account facts, balances, prices or payment rules live here.
 */
export const TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    nameUnavailable: "Nome não disponível", photoAria: "Alterar foto do perfil — indisponível", photoUnavailable: "Alteração de foto ainda indisponível",
    yourProfile: "SEU PERFIL", location: "Localização", nationality: "Nacionalidade", memberSince: "Membro desde", watchIntro: "Ver intro",
    plan: "Meu plano", planStandard: "Standard", planPro: "PRO", planActive: "ATIVO", planInactive: "NÃO ATIVO", marketPower: "Poder de mercado", marketPowerUnavailable: "Poder de mercado indisponível", activatePlan: "Ativar plano", renewPlan: "Renovar",
    proMember: "MEMBRO PRO", proAccess: "ACESSO PRO", proPrivileges: "Benefícios exclusivos do membro",
    planUntil: "Válido até {date}", planActiveNoEnd: "Seu plano está ativo.", planInactiveDetail: "Ative um plano para gerenciar seu XI.", planStandardPrice: "€49,90/temporada", planStandardBenefit: "Acesso completo ao jogo e ao ranking.", planProPrice: "€89,90/temporada", planProBenefit: "Visual premium, histórico, relatórios e alertas.",
    planActionUnavailable: "A ativação e a renovação do plano ainda não estão disponíveis.", virtualBudgetSeparate: "O orçamento do seu XI continua separado do seu plano.",
  },
  "es-ES": {
    nameUnavailable: "Nombre no disponible", photoAria: "Cambiar foto de perfil — no disponible", photoUnavailable: "La actualización de la foto aún no está disponible",
    yourProfile: "TU PERFIL", location: "Ubicación", nationality: "Nacionalidad", memberSince: "Miembro desde", watchIntro: "Ver introducción",
    plan: "Mi plan", planStandard: "Estándar", planPro: "PRO", planActive: "ACTIVO", planInactive: "INACTIVO", marketPower: "Poder de mercado", marketPowerUnavailable: "Poder de mercado no disponible", activatePlan: "Activar plan", renewPlan: "Renovar",
    proMember: "MIEMBRO PRO", proAccess: "ACCESO PRO", proPrivileges: "Beneficios exclusivos del miembro",
    planUntil: "Válido hasta {date}", planActiveNoEnd: "Tu plan está activo.", planInactiveDetail: "Activa un plan para gestionar tu once.", planStandardPrice: "49,90 €/temporada", planStandardBenefit: "Acceso completo al juego y al ranking.", planProPrice: "89,90 €/temporada", planProBenefit: "Visual premium, historial, informes y alertas.",
    planActionUnavailable: "La activación y la renovación del plan aún no están disponibles.", virtualBudgetSeparate: "El presupuesto de tu once sigue separado de tu plan.",
  },
  "it-IT": {
    nameUnavailable: "Nome non disponibile", photoAria: "Modifica foto del profilo — non disponibile", photoUnavailable: "L’aggiornamento della foto non è ancora disponibile",
    yourProfile: "IL TUO PROFILO", location: "Località", nationality: "Nazionalità", memberSince: "Membro dal", watchIntro: "Guarda l’introduzione",
    plan: "Il mio piano", planStandard: "Standard", planPro: "PRO", planActive: "ATTIVO", planInactive: "NON ATTIVO", marketPower: "Potere di mercato", marketPowerUnavailable: "Potere di mercato non disponibile", activatePlan: "Attiva piano", renewPlan: "Rinnova",
    proMember: "MEMBRO PRO", proAccess: "ACCESSO PRO", proPrivileges: "Benefici esclusivi del membro",
    planUntil: "Valido fino al {date}", planActiveNoEnd: "Il tuo piano è attivo.", planInactiveDetail: "Attiva un piano per gestire i tuoi undici.", planStandardPrice: "49,90 €/stagione", planStandardBenefit: "Accesso completo al gioco e alla classifica.", planProPrice: "89,90 €/stagione", planProBenefit: "Visual premium, storico, report e avvisi.",
    planActionUnavailable: "L’attivazione e il rinnovo del piano non sono ancora disponibili.", virtualBudgetSeparate: "Il budget dei tuoi undici resta separato dal tuo piano.",
  },
  "fr-FR": {
    nameUnavailable: "Nom indisponible", photoAria: "Modifier la photo de profil — indisponible", photoUnavailable: "La modification de la photo n’est pas encore disponible",
    yourProfile: "VOTRE PROFIL", location: "Localisation", nationality: "Nationalité", memberSince: "Membre depuis", watchIntro: "Voir l’introduction",
    plan: "Mon plan", planStandard: "Standard", planPro: "PRO", planActive: "ACTIF", planInactive: "INACTIF", marketPower: "Pouvoir de marché", marketPowerUnavailable: "Pouvoir de marché indisponible", activatePlan: "Activer le plan", renewPlan: "Renouveler",
    proMember: "MEMBRE PRO", proAccess: "ACCÈS PRO", proPrivileges: "Avantages exclusifs réservés aux membres",
    planUntil: "Valable jusqu’au {date}", planActiveNoEnd: "Votre plan est actif.", planInactiveDetail: "Activez un plan pour gérer votre onze.", planStandardPrice: "49,90 €/saison", planStandardBenefit: "Accès complet au jeu et au classement.", planProPrice: "89,90 €/saison", planProBenefit: "Visuel premium, historique, rapports et alertes.",
    planActionUnavailable: "L’activation et le renouvellement du plan ne sont pas encore disponibles.", virtualBudgetSeparate: "Le budget de votre onze reste séparé de votre plan.",
  },
  "ar-SA": {
    nameUnavailable: "الاسم غير متاح", photoAria: "تغيير صورة الملف الشخصي — غير متاح", photoUnavailable: "تحديث الصورة غير متاح بعد",
    yourProfile: "ملفك الشخصي", location: "الموقع", nationality: "الجنسية", memberSince: "عضو منذ", watchIntro: "مشاهدة المقدمة",
    plan: "خطتي", planStandard: "قياسي", planPro: "PRO", planActive: "نشط", planInactive: "غير نشط", marketPower: "قوة السوق", marketPowerUnavailable: "قوة السوق غير متاحة", activatePlan: "تفعيل الخطة", renewPlan: "تجديد",
    proMember: "عضو PRO", proAccess: "وصول PRO", proPrivileges: "مزايا العضو الحصرية",
    planUntil: "صالح حتى {date}", planActiveNoEnd: "خطتك نشطة.", planInactiveDetail: "فعّل خطة لإدارة تشكيلتك الأساسية.", planStandardPrice: "49.90 € لكل موسم", planStandardBenefit: "وصول كامل إلى اللعبة والترتيب.", planProPrice: "89.90 € لكل موسم", planProBenefit: "مظهر مميز وسجل وتقارير وتنبيهات.",
    planActionUnavailable: "تفعيل الخطة وتجديدها غير متاحين بعد.", virtualBudgetSeparate: "تبقى ميزانية تشكيلتك الأساسية منفصلة عن خطتك.",
  },
  "tr-TR": {
    nameUnavailable: "Ad bilgisi mevcut değil", photoAria: "Profil fotoğrafını değiştir — kullanılamıyor", photoUnavailable: "Fotoğraf güncelleme henüz kullanılamıyor",
    yourProfile: "PROFİLİNİZ", location: "Konum", nationality: "Uyruk", memberSince: "Üyelik başlangıcı", watchIntro: "Tanıtımı izle",
    plan: "Planım", planStandard: "Standart", planPro: "PRO", planActive: "AKTİF", planInactive: "AKTİF DEĞİL", marketPower: "Piyasa gücü", marketPowerUnavailable: "Piyasa gücü kullanılamıyor", activatePlan: "Planı etkinleştir", renewPlan: "Yenile",
    proMember: "PRO ÜYE", proAccess: "PRO ERİŞİM", proPrivileges: "Üyelere özel avantajlar",
    planUntil: "{date} tarihine kadar geçerli", planActiveNoEnd: "Planınız aktif.", planInactiveDetail: "İlk 11'inizi yönetmek için planı etkinleştirin.", planStandardPrice: "49,90 €/sezon", planStandardBenefit: "Oyuna ve sıralamaya tam erişim.", planProPrice: "89,90 €/sezon", planProBenefit: "Premium görünüm, geçmiş, raporlar ve uyarılar.",
    planActionUnavailable: "Plan etkinleştirme ve yenileme henüz kullanılamıyor.", virtualBudgetSeparate: "İlk 11 bütçeniz planınızdan ayrı kalır.",
  },
  "de-DE": {
    nameUnavailable: "Name nicht verfügbar", photoAria: "Profilfoto ändern — nicht verfügbar", photoUnavailable: "Das Profilfoto kann noch nicht geändert werden",
    yourProfile: "DEIN PROFIL", location: "Standort", nationality: "Nationalität", memberSince: "Mitglied seit", watchIntro: "Intro ansehen",
    plan: "Mein Plan", planStandard: "Standard", planPro: "PRO", planActive: "AKTIV", planInactive: "INAKTIV", marketPower: "Marktmacht", marketPowerUnavailable: "Marktmacht nicht verfügbar", activatePlan: "Plan aktivieren", renewPlan: "Verlängern",
    proMember: "PRO-MITGLIED", proAccess: "PRO-ZUGANG", proPrivileges: "Exklusive Mitgliedsvorteile",
    planUntil: "Gültig bis {date}", planActiveNoEnd: "Dein Plan ist aktiv.", planInactiveDetail: "Aktiviere einen Plan, um deine Startelf zu verwalten.", planStandardPrice: "49,90 €/Saison", planStandardBenefit: "Voller Zugang zum Spiel und Ranking.", planProPrice: "89,90 €/Saison", planProBenefit: "Premium-Optik, Verlauf, Berichte und Hinweise.",
    planActionUnavailable: "Planaktivierung und Verlängerung sind noch nicht verfügbar.", virtualBudgetSeparate: "Das Budget deiner Startelf bleibt von deinem Plan getrennt.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubOwnerMarketCopy>>;

export function getTouchlineClubOwnerMarketCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubOwnerMarketCopy {
  return TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
