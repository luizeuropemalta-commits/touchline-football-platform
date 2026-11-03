import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";
import type { GameweekScoreStatus } from "./gameweek-score-status.ts";

type ScoreCopy = Readonly<Record<GameweekScoreStatus | "reconfirm" | "noValidLineupDetail" | "automaticLineupDetail", string>>;
const catalogues: Readonly<Record<TouchLineLocale, ScoreCopy>> = {
  "en-GB": {
    UNAVAILABLE: "Points temporarily unavailable", NO_GAMEWEEK: "Awaiting the next gameweek",
    AWAITING_CONFIRMATION: "Confirm your XI before kickoff", AWAITING_KICKOFF: "Awaiting kickoff",
    NO_VALID_LINEUP: "No valid XI for this gameweek", PENDING_SCORE: "Awaiting points",
    PROVISIONAL: "Provisional points", FINAL: "Final points",
    reconfirm: "Your lineup changed after confirmation. Confirm your XI again before kickoff to earn points.",
    noValidLineupDetail: "No valid XI was locked for this gameweek. Confirm your lineup during the next open window to earn points. Points earned earlier this season are preserved.",
    automaticLineupDetail: "No valid XI was locked for this gameweek. Keep 11 eligible players on the pitch before the next deadline. Your earlier season points are preserved.",
  },
  "pt-BR": {
    UNAVAILABLE: "Pontos temporariamente indisponíveis", NO_GAMEWEEK: "Aguardando a próxima rodada",
    AWAITING_CONFIRMATION: "Confirme seu XI antes do início", AWAITING_KICKOFF: "Aguardando o início da rodada",
    NO_VALID_LINEUP: "Sem XI válido nesta rodada", PENDING_SCORE: "Aguardando pontuação",
    PROVISIONAL: "Pontuação provisória", FINAL: "Pontuação final",
    reconfirm: "Sua escalação mudou após a confirmação. Confirme o XI novamente antes do início da rodada para pontuar.",
    noValidLineupDetail: "Nenhum XI válido foi registrado no fechamento desta rodada. Confirme sua escalação na próxima janela aberta para pontuar. Seus pontos anteriores da temporada estão preservados.",
    automaticLineupDetail: "Nenhum XI válido foi registrado no fechamento desta rodada. Deixe 11 jogadores elegíveis em campo antes do próximo fechamento. Seus pontos anteriores da temporada estão preservados.",
  },
  "es-ES": {
    UNAVAILABLE: "Puntos temporalmente no disponibles", NO_GAMEWEEK: "Esperando la próxima jornada",
    AWAITING_CONFIRMATION: "Confirma tu XI antes del inicio", AWAITING_KICKOFF: "Esperando el inicio",
    NO_VALID_LINEUP: "Sin XI válido en esta jornada", PENDING_SCORE: "Esperando puntos",
    PROVISIONAL: "Puntos provisionales", FINAL: "Puntos definitivos",
    reconfirm: "Tu alineación cambió tras la confirmación. Confirma de nuevo tu XI antes del inicio para puntuar.",
    noValidLineupDetail: "No se registró un XI válido al cierre de esta jornada. Confirma tu alineación en la próxima ventana abierta para puntuar. Tus puntos anteriores de la temporada se conservan.",
    automaticLineupDetail: "No se registró un XI válido al cierre de esta jornada. Mantén 11 jugadores elegibles en el campo antes del próximo cierre. Tus puntos anteriores de la temporada se conservan.",
  },
  "it-IT": {
    UNAVAILABLE: "Punti temporaneamente non disponibili", NO_GAMEWEEK: "In attesa della prossima giornata",
    AWAITING_CONFIRMATION: "Conferma l’XI prima dell’inizio", AWAITING_KICKOFF: "In attesa del calcio d’inizio",
    NO_VALID_LINEUP: "Nessun XI valido per questa giornata", PENDING_SCORE: "In attesa dei punti",
    PROVISIONAL: "Punti provvisori", FINAL: "Punti definitivi",
    reconfirm: "La formazione è cambiata dopo la conferma. Conferma nuovamente l’XI prima dell’inizio per ottenere punti.",
    noValidLineupDetail: "Nessun XI valido è stato registrato alla chiusura di questa giornata. Conferma la formazione nella prossima finestra aperta per ottenere punti. I punti precedenti della stagione sono conservati.",
    automaticLineupDetail: "Nessun XI valido è stato registrato alla chiusura di questa giornata. Mantieni 11 giocatori idonei in campo prima della prossima chiusura. I punti precedenti della stagione sono conservati.",
  },
  "fr-FR": {
    UNAVAILABLE: "Points temporairement indisponibles", NO_GAMEWEEK: "En attente de la prochaine journée",
    AWAITING_CONFIRMATION: "Confirmez votre XI avant le début", AWAITING_KICKOFF: "En attente du coup d’envoi",
    NO_VALID_LINEUP: "Aucun XI valide pour cette journée", PENDING_SCORE: "En attente des points",
    PROVISIONAL: "Points provisoires", FINAL: "Points définitifs",
    reconfirm: "Votre composition a changé après confirmation. Confirmez à nouveau votre XI avant le début pour marquer des points.",
    noValidLineupDetail: "Aucun XI valide n’a été enregistré à la clôture de cette journée. Confirmez votre composition lors de la prochaine période ouverte pour marquer des points. Vos points précédents de la saison sont conservés.",
    automaticLineupDetail: "Aucun XI valide n’a été enregistré à la clôture de cette journée. Gardez 11 joueurs éligibles sur le terrain avant la prochaine clôture. Vos points précédents de la saison sont conservés.",
  },
  "ar-SA": {
    UNAVAILABLE: "النقاط غير متاحة مؤقتًا", NO_GAMEWEEK: "بانتظار الجولة المقبلة",
    AWAITING_CONFIRMATION: "أكد تشكيلتك قبل البداية", AWAITING_KICKOFF: "بانتظار انطلاق الجولة",
    NO_VALID_LINEUP: "لا توجد تشكيلة صالحة لهذه الجولة", PENDING_SCORE: "بانتظار النقاط",
    PROVISIONAL: "نقاط مؤقتة", FINAL: "نقاط نهائية",
    reconfirm: "تغيرت تشكيلتك بعد التأكيد. أكد التشكيلة مجددًا قبل البداية لاحتساب النقاط.",
    noValidLineupDetail: "لم تُسجل تشكيلة صالحة عند إغلاق هذه الجولة. أكد تشكيلتك خلال الفترة المفتوحة المقبلة لاحتساب النقاط. نقاطك السابقة في الموسم محفوظة.",
    automaticLineupDetail: "لم تُسجل تشكيلة صالحة عند إغلاق هذه الجولة. ضع 11 لاعبًا مؤهلًا في الملعب قبل الإغلاق المقبل. نقاطك السابقة في الموسم محفوظة.",
  },
  "tr-TR": {
    UNAVAILABLE: "Puanlar geçici olarak kullanılamıyor", NO_GAMEWEEK: "Sonraki hafta bekleniyor",
    AWAITING_CONFIRMATION: "Başlangıçtan önce XI’ini onayla", AWAITING_KICKOFF: "Başlangıç bekleniyor",
    NO_VALID_LINEUP: "Bu hafta için geçerli XI yok", PENDING_SCORE: "Puanlar bekleniyor",
    PROVISIONAL: "Geçici puanlar", FINAL: "Kesin puanlar",
    reconfirm: "Kadro onaydan sonra değişti. Puan kazanmak için başlangıçtan önce XI’ini yeniden onayla.",
    noValidLineupDetail: "Bu hafta kapanırken geçerli bir XI kaydedilmedi. Puan kazanmak için sonraki açık dönemde kadronu onayla. Bu sezon daha önce kazandığın puanlar korunur.",
    automaticLineupDetail: "Bu hafta kapanırken geçerli bir XI kaydedilmedi. Sonraki kapanıştan önce sahada 11 uygun oyuncu bulundur. Bu sezon daha önce kazandığın puanlar korunur.",
  },
  "de-DE": {
    UNAVAILABLE: "Punkte vorübergehend nicht verfügbar", NO_GAMEWEEK: "Warten auf den nächsten Spieltag",
    AWAITING_CONFIRMATION: "Bestätige deine XI vor Anpfiff", AWAITING_KICKOFF: "Warten auf den Anpfiff",
    NO_VALID_LINEUP: "Keine gültige XI für diesen Spieltag", PENDING_SCORE: "Warten auf Punkte",
    PROVISIONAL: "Vorläufige Punkte", FINAL: "Endgültige Punkte",
    reconfirm: "Deine Aufstellung wurde nach der Bestätigung geändert. Bestätige deine XI vor Anpfiff erneut, um Punkte zu sammeln.",
    noValidLineupDetail: "Bei Schließung dieses Spieltags wurde keine gültige XI registriert. Bestätige deine Aufstellung im nächsten offenen Zeitfenster, um Punkte zu sammeln. Deine bisherigen Saisonpunkte bleiben erhalten.",
    automaticLineupDetail: "Bei Schließung dieses Spieltags wurde keine gültige XI registriert. Stelle vor dem nächsten Schluss 11 spielberechtigte Spieler auf. Deine bisherigen Saisonpunkte bleiben erhalten.",
  },
};

export function getGameweekScoreStatusCopy(locale?: string | null, draftLocalesEnabled = false): ScoreCopy {
  return catalogues[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
