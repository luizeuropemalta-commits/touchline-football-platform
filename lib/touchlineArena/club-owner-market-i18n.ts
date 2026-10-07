import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  nameUnavailable: "Name unavailable", photoAria: "Change profile photo — unavailable", photoUnavailable: "Photo updates are not available yet",
  yourProfile: "YOUR PROFILE", location: "Location", nationality: "Nationality", memberSince: "Member since", watchIntro: "Watch intro",
  bank: "Bank", inactive: "INACTIVE", credits: "TouchLine Credits",
  purchasesUnavailable: "Credit purchases are not available yet. No payment can be made in this area.", buyCredits: "Buy credits",
  notCreditBalance: "Your XI budget and points appear below. They are not a credit balance.",
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
    bank: "Banco", inactive: "INATIVO", credits: "Créditos TouchLine",
    purchasesUnavailable: "A compra de créditos ainda não está disponível. Nenhum pagamento pode ser feito nesta área.", buyCredits: "Comprar créditos",
    notCreditBalance: "Seu orçamento do XI e seus pontos aparecem abaixo. Não são saldo de créditos.",
  },
  "es-ES": {
    nameUnavailable: "Nombre no disponible", photoAria: "Cambiar foto de perfil — no disponible", photoUnavailable: "La actualización de la foto aún no está disponible",
    yourProfile: "TU PERFIL", location: "Ubicación", nationality: "Nacionalidad", memberSince: "Miembro desde", watchIntro: "Ver introducción",
    bank: "Banco", inactive: "INACTIVO", credits: "Créditos TouchLine",
    purchasesUnavailable: "La compra de créditos aún no está disponible. No se puede realizar ningún pago en esta sección.", buyCredits: "Comprar créditos",
    notCreditBalance: "El presupuesto de tu once y tus puntos aparecen debajo. No son un saldo de créditos.",
  },
  "it-IT": {
    nameUnavailable: "Nome non disponibile", photoAria: "Modifica foto del profilo — non disponibile", photoUnavailable: "L’aggiornamento della foto non è ancora disponibile",
    yourProfile: "IL TUO PROFILO", location: "Località", nationality: "Nazionalità", memberSince: "Membro dal", watchIntro: "Guarda l’introduzione",
    bank: "Banca", inactive: "INATTIVA", credits: "Crediti TouchLine",
    purchasesUnavailable: "L’acquisto di crediti non è ancora disponibile. Non è possibile effettuare pagamenti in questa sezione.", buyCredits: "Acquista crediti",
    notCreditBalance: "Il budget degli undici titolari e i tuoi punti sono mostrati sotto. Non costituiscono un saldo di crediti.",
  },
  "fr-FR": {
    nameUnavailable: "Nom indisponible", photoAria: "Modifier la photo de profil — indisponible", photoUnavailable: "La modification de la photo n’est pas encore disponible",
    yourProfile: "VOTRE PROFIL", location: "Localisation", nationality: "Nationalité", memberSince: "Membre depuis", watchIntro: "Voir l’introduction",
    bank: "Banque", inactive: "INACTIVE", credits: "Crédits TouchLine",
    purchasesUnavailable: "L’achat de crédits n’est pas encore disponible. Aucun paiement ne peut être effectué dans cette section.", buyCredits: "Acheter des crédits",
    notCreditBalance: "Le budget de votre onze et vos points figurent ci-dessous. Ils ne constituent pas un solde de crédits.",
  },
  "ar-SA": {
    nameUnavailable: "الاسم غير متاح", photoAria: "تغيير صورة الملف الشخصي — غير متاح", photoUnavailable: "تحديث الصورة غير متاح بعد",
    yourProfile: "ملفك الشخصي", location: "الموقع", nationality: "الجنسية", memberSince: "عضو منذ", watchIntro: "مشاهدة المقدمة",
    bank: "البنك", inactive: "غير نشط", credits: "أرصدة TouchLine",
    purchasesUnavailable: "شراء الأرصدة غير متاح بعد. لا يمكن إجراء أي دفعة في هذا القسم.", buyCredits: "شراء الأرصدة",
    notCreditBalance: "تظهر أدناه ميزانية تشكيلتك الأساسية ونقاطك. وهي ليست رصيدًا من الأرصدة.",
  },
  "tr-TR": {
    nameUnavailable: "Ad bilgisi mevcut değil", photoAria: "Profil fotoğrafını değiştir — kullanılamıyor", photoUnavailable: "Fotoğraf güncelleme henüz kullanılamıyor",
    yourProfile: "PROFİLİNİZ", location: "Konum", nationality: "Uyruk", memberSince: "Üyelik başlangıcı", watchIntro: "Tanıtımı izle",
    bank: "Banka", inactive: "ETKİN DEĞİL", credits: "TouchLine Kredileri",
    purchasesUnavailable: "Kredi satın alma henüz kullanılamıyor. Bu bölümde hiçbir ödeme yapılamaz.", buyCredits: "Kredi satın al",
    notCreditBalance: "İlk 11 bütçeniz ve puanlarınız aşağıda gösterilir. Bunlar kredi bakiyesi değildir.",
  },
  "de-DE": {
    nameUnavailable: "Name nicht verfügbar", photoAria: "Profilfoto ändern — nicht verfügbar", photoUnavailable: "Das Profilfoto kann noch nicht geändert werden",
    yourProfile: "DEIN PROFIL", location: "Standort", nationality: "Nationalität", memberSince: "Mitglied seit", watchIntro: "Intro ansehen",
    bank: "Bank", inactive: "INAKTIV", credits: "TouchLine-Credits",
    purchasesUnavailable: "Der Kauf von Credits ist noch nicht verfügbar. In diesem Bereich sind keine Zahlungen möglich.", buyCredits: "Credits kaufen",
    notCreditBalance: "Das Budget deiner Startelf und deine Punkte stehen unten. Sie sind kein Credit-Guthaben.",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineClubOwnerMarketCopy>>;

export function getTouchlineClubOwnerMarketCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineClubOwnerMarketCopy {
  return TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
