import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  interactionsWith: "Interactions with {playerName}", follow: "Follow", following: "Following", like: "Like", liked: "Liked",
  loading: "Loading interactions…", saving: "Saving…", error: "Interactions unavailable. No confirmation received.",
  signedOut: "Sign in with TouchLine access to interact.", saved: "Interactions saved to your account.", checkAgain: "Check again", signIn: "Sign in to TouchLine", contractPlayer: "Contract player",
} as const;

export type TouchlinePlayerSocialCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_PLAYER_SOCIAL_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_PLAYER_SOCIAL_DRAFT_STATUS = "draft" as const;

/** Presentation only: no reaction authority, mutations, identity or commercial
 * CTA. Six extra catalogues are drafts pending linguistic/RTL release review.
 */
export const TOUCHLINE_PLAYER_SOCIAL_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    interactionsWith: "Interações com {playerName}", follow: "Seguir", following: "Seguindo", like: "Curtir", liked: "Curtiu",
    loading: "Carregando interações…", saving: "Salvando…", error: "Interações indisponíveis. Nenhuma confirmação recebida.",
    signedOut: "Entre em uma conta com acesso à TouchLine para interagir.", saved: "Interações salvas na sua conta.", checkAgain: "Consultar novamente", signIn: "Entrar na TouchLine", contractPlayer: "Contratar jogador",
  },
  "es-ES": {
    interactionsWith: "Interacciones con {playerName}", follow: "Seguir", following: "Siguiendo", like: "Me gusta", liked: "Te gusta",
    loading: "Cargando interacciones…", saving: "Guardando…", error: "Interacciones no disponibles. No se ha recibido confirmación.",
    signedOut: "Inicia sesión con acceso a TouchLine para interactuar.", saved: "Interacciones guardadas en tu cuenta.", checkAgain: "Consultar de nuevo", signIn: "Iniciar sesión en TouchLine", contractPlayer: "Contratar jugador",
  },
  "it-IT": {
    interactionsWith: "Interazioni con {playerName}", follow: "Segui", following: "Seguito", like: "Mi piace", liked: "Ti piace",
    loading: "Caricamento delle interazioni…", saving: "Salvataggio…", error: "Interazioni non disponibili. Nessuna conferma ricevuta.",
    signedOut: "Accedi con un account abilitato a TouchLine per interagire.", saved: "Interazioni salvate nel tuo account.", checkAgain: "Verifica di nuovo", signIn: "Accedi a TouchLine", contractPlayer: "Ingaggia giocatore",
  },
  "fr-FR": {
    interactionsWith: "Interactions avec {playerName}", follow: "Suivre", following: "Suivi", like: "J’aime", liked: "Aimé",
    loading: "Chargement des interactions…", saving: "Enregistrement…", error: "Interactions indisponibles. Aucune confirmation reçue.",
    signedOut: "Connectez-vous avec un accès à TouchLine pour interagir.", saved: "Interactions enregistrées dans votre compte.", checkAgain: "Vérifier à nouveau", signIn: "Se connecter à TouchLine", contractPlayer: "Recruter le joueur",
  },
  "ar-SA": {
    interactionsWith: "التفاعلات مع {playerName}", follow: "متابعة", following: "تتم المتابعة", like: "إعجاب", liked: "تم الإعجاب",
    loading: "جارٍ تحميل التفاعلات…", saving: "جارٍ الحفظ…", error: "التفاعلات غير متاحة. لم يتم تلقي أي تأكيد.",
    signedOut: "سجّل الدخول بحساب لديه صلاحية الوصول إلى TouchLine للتفاعل.", saved: "تم حفظ التفاعلات في حسابك.", checkAgain: "التحقق مجددًا", signIn: "تسجيل الدخول إلى TouchLine", contractPlayer: "التعاقد مع اللاعب",
  },
  "tr-TR": {
    interactionsWith: "{playerName} ile etkileşimler", follow: "Takip et", following: "Takip ediliyor", like: "Beğen", liked: "Beğenildi",
    loading: "Etkileşimler yükleniyor…", saving: "Kaydediliyor…", error: "Etkileşimler kullanılamıyor. Onay alınmadı.",
    signedOut: "Etkileşim için TouchLine erişimi olan bir hesapla giriş yapın.", saved: "Etkileşimler hesabınıza kaydedildi.", checkAgain: "Yeniden kontrol et", signIn: "TouchLine hesabına giriş yap", contractPlayer: "Oyuncuyu kadroya kat",
  },
  "de-DE": {
    interactionsWith: "Interaktionen mit {playerName}", follow: "Folgen", following: "Gefolgt", like: "Gefällt mir", liked: "Mit Gefällt mir markiert",
    loading: "Interaktionen werden geladen…", saving: "Wird gespeichert…", error: "Interaktionen nicht verfügbar. Keine Bestätigung erhalten.",
    signedOut: "Melde dich mit TouchLine-Zugang an, um zu interagieren.", saved: "Interaktionen in deinem Konto gespeichert.", checkAgain: "Erneut prüfen", signIn: "Bei TouchLine anmelden", contractPlayer: "Spieler verpflichten",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlinePlayerSocialCopy>>;

export function getTouchlinePlayerSocialCopy(locale?: string | null, draftLocalesEnabled = false): TouchlinePlayerSocialCopy {
  return TOUCHLINE_PLAYER_SOCIAL_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function formatTouchlinePlayerSocialAria(playerName: string, locale?: string | null, draftLocalesEnabled = false): string {
  return getTouchlinePlayerSocialCopy(locale, draftLocalesEnabled).interactionsWith.replace("{playerName}", () => playerName);
}

export function formatTouchlinePlayerSocialCount(value: number | undefined, locale?: string | null, draftLocalesEnabled = false): string {
  return value === undefined ? "—" : new Intl.NumberFormat(resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
