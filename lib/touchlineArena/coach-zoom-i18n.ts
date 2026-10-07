import { type TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  currentClub: "Current club", nationality: "Nationality", role: "Role", firstTeamCoach: "First-team coach", dateOfBirth: "Date of birth", cardTier: "Card tier",
  competitionRank: "Competition rank", homeRecord: "Home · W-D-L", homePoints: "Home points", awayRecord: "Away · W-D-L", awayPoints: "Away points",
  status: "TouchLine status", verifiedIdentity: "Verified identity", matchEvidence: "Match evidence", awaitingVerifiedData: "Awaiting verified data",
  coachEyebrow: "TouchLine coach", record: "TouchLine record", verifiedOnly: "Verified evidence only", profile: "View full profile", openCard: "Open {coachName} coach card",
} as const;

export type TouchlineCoachZoomCopy = Readonly<Record<keyof typeof enGB, string>>;
export const TOUCHLINE_COACH_ZOOM_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_COACH_ZOOM_DRAFT_STATUS = "draft" as const;

/** Copy only: canonical records, coach identity, points and semantic tokens are
 * separate authorities. Six drafts await linguistic/RTL release approval.
 */
export const TOUCHLINE_COACH_ZOOM_CATALOGUES = {
  "en-GB": enGB,
  "pt-BR": {
    currentClub: "Clube atual", nationality: "Nacionalidade", role: "Função", firstTeamCoach: "Treinador principal", dateOfBirth: "Data de nascimento", cardTier: "Nível do card",
    competitionRank: "Posição na competição", homeRecord: "Casa · V-E-D", homePoints: "Pontos em casa", awayRecord: "Fora · V-E-D", awayPoints: "Pontos fora",
    status: "Estado TouchLine", verifiedIdentity: "Identidade verificada", matchEvidence: "Evidência de partidas", awaitingVerifiedData: "Aguardando dados verificados",
    coachEyebrow: "Treinador TouchLine", record: "Registo TouchLine", verifiedOnly: "Apenas evidência verificada", profile: "Ver perfil completo", openCard: "Ampliar card de {coachName}",
  },
  "es-ES": {
    currentClub: "Club actual", nationality: "Nacionalidad", role: "Función", firstTeamCoach: "Entrenador del primer equipo", dateOfBirth: "Fecha de nacimiento", cardTier: "Nivel de la tarjeta",
    competitionRank: "Posición en la competición", homeRecord: "Local · V-E-D", homePoints: "Puntos como local", awayRecord: "Visitante · V-E-D", awayPoints: "Puntos como visitante",
    status: "Estado TouchLine", verifiedIdentity: "Identidad verificada", matchEvidence: "Evidencia de partidos", awaitingVerifiedData: "Esperando datos verificados",
    coachEyebrow: "Entrenador TouchLine", record: "Registro TouchLine", verifiedOnly: "Solo evidencia verificada", profile: "Ver perfil completo", openCard: "Abrir la tarjeta del entrenador {coachName}",
  },
  "it-IT": {
    currentClub: "Club attuale", nationality: "Nazionalità", role: "Ruolo", firstTeamCoach: "Allenatore della prima squadra", dateOfBirth: "Data di nascita", cardTier: "Livello della carta",
    competitionRank: "Posizione nella competizione", homeRecord: "Casa · V-N-P", homePoints: "Punti in casa", awayRecord: "Trasferta · V-N-P", awayPoints: "Punti in trasferta",
    status: "Stato TouchLine", verifiedIdentity: "Identità verificata", matchEvidence: "Riscontri delle partite", awaitingVerifiedData: "In attesa di dati verificati",
    coachEyebrow: "Allenatore TouchLine", record: "Registro TouchLine", verifiedOnly: "Solo riscontri verificati", profile: "Visualizza il profilo completo", openCard: "Apri la carta dell’allenatore {coachName}",
  },
  "fr-FR": {
    currentClub: "Club actuel", nationality: "Nationalité", role: "Rôle", firstTeamCoach: "Entraîneur de l’équipe première", dateOfBirth: "Date de naissance", cardTier: "Niveau de la carte",
    competitionRank: "Classement dans la compétition", homeRecord: "Domicile · V-N-D", homePoints: "Points à domicile", awayRecord: "Extérieur · V-N-D", awayPoints: "Points à l’extérieur",
    status: "Statut TouchLine", verifiedIdentity: "Identité vérifiée", matchEvidence: "Données de matchs", awaitingVerifiedData: "En attente de données vérifiées",
    coachEyebrow: "Entraîneur TouchLine", record: "Bilan TouchLine", verifiedOnly: "Données vérifiées uniquement", profile: "Voir le profil complet", openCard: "Ouvrir la carte de l’entraîneur {coachName}",
  },
  "ar-SA": {
    currentClub: "النادي الحالي", nationality: "الجنسية", role: "الدور", firstTeamCoach: "مدرب الفريق الأول", dateOfBirth: "تاريخ الميلاد", cardTier: "مستوى البطاقة",
    competitionRank: "الترتيب في المسابقة", homeRecord: "على أرضه · فوز-تعادل-خسارة", homePoints: "النقاط على أرضه", awayRecord: "خارج أرضه · فوز-تعادل-خسارة", awayPoints: "النقاط خارج أرضه",
    status: "حالة TouchLine", verifiedIdentity: "هوية موثّقة", matchEvidence: "بيانات المباريات", awaitingVerifiedData: "في انتظار بيانات موثّقة",
    coachEyebrow: "مدرب TouchLine", record: "سجل TouchLine", verifiedOnly: "بيانات موثّقة فقط", profile: "عرض الملف الشخصي الكامل", openCard: "فتح بطاقة المدرب {coachName}",
  },
  "tr-TR": {
    currentClub: "Mevcut kulüp", nationality: "Uyruk", role: "Görev", firstTeamCoach: "A takım teknik direktörü", dateOfBirth: "Doğum tarihi", cardTier: "Kart seviyesi",
    competitionRank: "Müsabaka sıralaması", homeRecord: "İç saha · G-B-M", homePoints: "İç saha puanları", awayRecord: "Deplasman · G-B-M", awayPoints: "Deplasman puanları",
    status: "TouchLine durumu", verifiedIdentity: "Doğrulanmış kimlik", matchEvidence: "Maç verileri", awaitingVerifiedData: "Doğrulanmış veriler bekleniyor",
    coachEyebrow: "TouchLine teknik direktörü", record: "TouchLine kaydı", verifiedOnly: "Yalnızca doğrulanmış veriler", profile: "Tam profili görüntüle", openCard: "Teknik direktör {coachName} kartını aç",
  },
  "de-DE": {
    currentClub: "Aktueller Verein", nationality: "Nationalität", role: "Rolle", firstTeamCoach: "Trainer der ersten Mannschaft", dateOfBirth: "Geburtsdatum", cardTier: "Kartenstufe",
    competitionRank: "Platzierung im Wettbewerb", homeRecord: "Heim · S-U-N", homePoints: "Heimpunkte", awayRecord: "Auswärts · S-U-N", awayPoints: "Auswärtspunkte",
    status: "TouchLine-Status", verifiedIdentity: "Verifizierte Identität", matchEvidence: "Spielnachweise", awaitingVerifiedData: "Verifizierte Daten ausstehend",
    coachEyebrow: "TouchLine-Trainer", record: "TouchLine-Bilanz", verifiedOnly: "Nur verifizierte Nachweise", profile: "Vollständiges Profil ansehen", openCard: "Trainerkarte von {coachName} öffnen",
  },
} as const satisfies Readonly<Record<TouchLineLocale, TouchlineCoachZoomCopy>>;

/** One gated locale for both copy and existing formatters; retain the full
 * locale code so later approved locales are not silently collapsed to EN/PT.
 */
export function resolveTouchlineCoachZoomPresentation(locale?: string | null, draftLocalesEnabled = false): Readonly<{ locale: TouchLineLocale; copy: TouchlineCoachZoomCopy }> {
  const presentationLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { locale: presentationLocale, copy: TOUCHLINE_COACH_ZOOM_CATALOGUES[presentationLocale] };
}
