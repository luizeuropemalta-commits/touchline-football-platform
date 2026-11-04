import type { TouchlineCoach } from "../football-data/types";
import type { TouchLineLocale } from "./i18n.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

const enGB = {
  club: "Club", historicalClub: "Club in this record", coach: "Coach",
  historicalRecord: "Published historical record", identity: "Coach identity",
  historicalNotice: "This historical record does not confirm a current appointment at this club.",
} as const;
type Copy = Readonly<Record<keyof typeof enGB, string>>;
const copies = {
  "en-GB": enGB,
  "pt-BR": { club: "Clube", historicalClub: "Clube no registro", coach: "Treinador", historicalRecord: "Registro histórico publicado", identity: "Identidade do treinador", historicalNotice: "Este registro histórico não confirma um vínculo atual com este clube." },
  "es-ES": { club: "Club", historicalClub: "Club del registro", coach: "Entrenador", historicalRecord: "Registro histórico publicado", identity: "Identidad del entrenador", historicalNotice: "Este registro histórico no confirma un vínculo actual con este club." },
  "it-IT": { club: "Club", historicalClub: "Club nel registro", coach: "Allenatore", historicalRecord: "Registro storico pubblicato", identity: "Identità dell’allenatore", historicalNotice: "Questo registro storico non conferma un incarico attuale presso questo club." },
  "fr-FR": { club: "Club", historicalClub: "Club du registre", coach: "Entraîneur", historicalRecord: "Enregistrement historique publié", identity: "Identité de l’entraîneur", historicalNotice: "Cet enregistrement historique ne confirme pas de fonction actuelle dans ce club." },
  "ar-SA": { club: "النادي", historicalClub: "النادي في هذا السجل", coach: "مدرب", historicalRecord: "سجل تاريخي منشور", identity: "هوية المدرب", historicalNotice: "هذا السجل التاريخي لا يؤكد ارتباطًا حاليًا بهذا النادي." },
  "tr-TR": { club: "Kulüp", historicalClub: "Kayıttaki kulüp", coach: "Teknik direktör", historicalRecord: "Yayımlanmış tarihsel kayıt", identity: "Teknik direktör kimliği", historicalNotice: "Bu tarihsel kayıt, bu kulüpte güncel bir görevi doğrulamaz." },
  "de-DE": { club: "Verein", historicalClub: "Verein in diesem Eintrag", coach: "Trainer", historicalRecord: "Veröffentlichter historischer Eintrag", identity: "Identität des Trainers", historicalNotice: "Dieser historische Eintrag bestätigt keine aktuelle Tätigkeit bei diesem Verein." },
} as const satisfies Readonly<Record<TouchLineLocale, Copy>>;

/** Membership is supplied by the canonical parser; names, tiers and scores do
 * not establish an appointment. Missing or mismatched context stays neutral. */
export function coachAssociationPresentation(coach: TouchlineCoach | null, locale?: string | null, draftLocalesEnabled = false) {
  const evidence = coach?.catalogueAssociation;
  const kind = evidence && evidence.providerId === coach?.providerId && evidence.teamId === coach?.teamId
    && (evidence.kind === "current" || evidence.kind === "historical") ? evidence.kind : "unknown";
  const copy = copies[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  return { kind, club: kind === "historical" ? copy.historicalClub : copy.club,
    role: copy.coach, identity: kind === "historical" ? copy.historicalRecord : copy.identity,
    note: kind === "historical" ? copy.historicalNotice : undefined } as const;
}
