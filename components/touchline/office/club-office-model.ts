import type { ClubAcquisitionState } from "../../../lib/touchlineFantasy/club-acquisition.ts";
import { resolveTouchlineCatalogueLocale } from "../../../lib/touchlineArena/catalogue-locale.ts";

/** Read-only, account-scoped inputs. Never pass another owner's wallet here. */
export type OfficeCollection =
  | Readonly<{ status: "ready"; state: ClubAcquisitionState | null }>
  | Readonly<{ status: "loading" | "error" | "unavailable" }>;

export type OfficeMovement = Readonly<{
  id: string;
  kind: "acquisition" | "exchange" | "refund" | "bonus";
  occurredAt: string;
  playerName: string;
  counterpartPlayerName?: string;
  /** Actual signed change in the owner's TC balance, not a card valuation. */
  creditsDelta: number;
}>;
export type OfficePoints = Readonly<{
  id: string;
  playerId: string;
  fixtureLabel: string;
  roundLabel: string;
  /** Points actually credited to this ClubOwner; never the athlete's season total. */
  creditedPoints: number;
  lineupLockedAt: string;
}>;
export type OfficeHistory =
  | Readonly<{ status: "ready"; movements: readonly OfficeMovement[]; points: readonly OfficePoints[] }>
  | Readonly<{ status: "loading" | "error" | "unavailable" }>;

export function summarizeOffice(collection: OfficeCollection) {
  if (collection.status !== "ready") return null;
  const state = collection.state;
  if (!state) return { playerCount: 0, starters: 0, reserves: 0, outside: 0, balance: null, playersCost: null, coachCost: null };
  return {
    playerCount: state.players.length,
    starters: state.players.filter(player => player.area === "starters").length,
    reserves: state.players.filter(player => player.area === "reserves").length,
    outside: state.players.filter(player => player.area === "outside").length,
    balance: state.balanceEur,
    playersCost: state.players.reduce((sum, player) => sum + player.valueEur, 0),
    coachCost: state.coach.valueEur,
  };
}

export function officeCopy(locale: string, draftLocalesEnabled = false) {
  const resolvedLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  if (draftLocalesEnabled && resolvedLocale !== "en-GB" && resolvedLocale !== "pt-BR") return officeDraftCopy[resolvedLocale];
  return locale.toLowerCase().startsWith("pt") ? {
    title: "Escritório do clube", subtitle: "ClubOwner / Gestão", back: "Voltar", close: "Fechar escritório",
    roster: "Elenco e pontos", movements: "Contratações e trocas", balance: "Balanço de créditos",
    rosterHint: "Seus atletas e pontos no clube", movementsHint: "Registros das movimentações", balanceHint: "Saldo confirmado e elenco atual",
    view: "Abrir", details: "Ver detalhes", players: "Jogadores", starters: "Titulares", reserves: "Reservas", outside: "Fora da partida",
    loading: "Consultando os dados do clube…", error: "Não foi possível confirmar os dados.", unavailable: "Dados ainda não disponíveis.",
    emptyRoster: "Seu elenco ainda está vazio.", emptyHistory: "Nenhuma movimentação registrada.", emptyPoints: "Nenhum ponto registrado para este atleta no seu clube.",
    historyUnavailable: "O histórico ainda não está conectado.", pointsHint: "Pontos recebidos pelo seu clube — não o total do atleta no campeonato.",
    noName: "Atleta", noBalance: "Saldo ainda não confirmado", confirmedBalance: "Saldo confirmado", playerCost: "Contratações do elenco atual", coachCost: "Contratação do treinador",
    paid: "Valor contratado", position: "Posição", club: "Clube", area: "Área", points: "Pontos no seu clube", lock: "Escalação confirmada em",
    acquisition: "Contratação", exchange: "Troca", refund: "Devolução", bonus: "Bônus", date: "Data", change: "Movimentação de créditos",
    balanceHintDetail: "Valores em créditos TouchLine. Não representam dinheiro disponível para saque.", readOnly: "Consulta do seu clube",
  } : {
    title: "Club office", subtitle: "ClubOwner / Management", back: "Back", close: "Close office",
    roster: "Squad & points", movements: "Signings & exchanges", balance: "Credit balance",
    rosterHint: "Your players and club points", movementsHint: "Your transaction records", balanceHint: "Confirmed balance and current squad",
    view: "Open", details: "View details", players: "Players", starters: "Starting XI", reserves: "Substitutes", outside: "Outside match squad",
    loading: "Loading club data…", error: "Club data could not be confirmed.", unavailable: "Data is not available yet.",
    emptyRoster: "Your squad is still empty.", emptyHistory: "No transactions recorded.", emptyPoints: "No points recorded for this player at your club.",
    historyUnavailable: "History is not connected yet.", pointsHint: "Points credited to your club — not the player's season total.",
    noName: "Player", noBalance: "Balance not confirmed yet", confirmedBalance: "Confirmed balance", playerCost: "Current squad acquisition costs", coachCost: "Coach acquisition cost",
    paid: "Acquisition value", position: "Position", club: "Club", area: "Area", points: "Points for your club", lock: "Lineup confirmed on",
    acquisition: "Signing", exchange: "Exchange", refund: "Return", bonus: "Bonus", date: "Date", change: "Credit movement",
    balanceHintDetail: "Amounts in TouchLine credits. These are not funds available for withdrawal.", readOnly: "Your club records",
  };
}

// Presentation drafts only; enabling them does not change account data or actions.
const officeDraftCopy = {
  "es-ES": {
    title: "Oficina del club", subtitle: "ClubOwner / Gestión", back: "Volver", close: "Cerrar oficina",
    roster: "Plantilla y puntos", movements: "Fichajes e intercambios", balance: "Balance de créditos",
    rosterHint: "Tus jugadores y puntos en el club", movementsHint: "Registros de tus movimientos", balanceHint: "Saldo confirmado y plantilla actual",
    view: "Abrir", details: "Ver detalles", players: "Jugadores", starters: "Titulares", reserves: "Suplentes", outside: "Fuera de la convocatoria",
    loading: "Cargando datos del club…", error: "No se han podido confirmar los datos del club.", unavailable: "Los datos aún no están disponibles.",
    emptyRoster: "Tu plantilla aún está vacía.", emptyHistory: "No hay movimientos registrados.", emptyPoints: "No hay puntos registrados para este jugador en tu club.",
    historyUnavailable: "El historial aún no está conectado.", pointsHint: "Puntos recibidos por tu club, no el total del jugador en la temporada.",
    noName: "Jugador", noBalance: "Saldo aún no confirmado", confirmedBalance: "Saldo confirmado", playerCost: "Coste de los fichajes de la plantilla actual", coachCost: "Coste del fichaje del entrenador",
    paid: "Valor del fichaje", position: "Posición", club: "Club", area: "Área", points: "Puntos en tu club", lock: "Alineación confirmada el",
    acquisition: "Fichaje", exchange: "Intercambio", refund: "Devolución", bonus: "Bonificación", date: "Fecha", change: "Movimiento de créditos",
    balanceHintDetail: "Importes en créditos TouchLine. No representan dinero disponible para retirar.", readOnly: "Registros de tu club",
  },
  "it-IT": {
    title: "Ufficio del club", subtitle: "ClubOwner / Gestione", back: "Indietro", close: "Chiudi ufficio",
    roster: "Rosa e punti", movements: "Ingaggi e scambi", balance: "Bilancio dei crediti",
    rosterHint: "I tuoi giocatori e i punti nel club", movementsHint: "Registri dei tuoi movimenti", balanceHint: "Saldo confermato e rosa attuale",
    view: "Apri", details: "Vedi dettagli", players: "Giocatori", starters: "Titolari", reserves: "Riserve", outside: "Fuori dai convocati",
    loading: "Caricamento dei dati del club…", error: "Impossibile confermare i dati del club.", unavailable: "Dati non ancora disponibili.",
    emptyRoster: "La tua rosa è ancora vuota.", emptyHistory: "Nessun movimento registrato.", emptyPoints: "Nessun punto registrato per questo giocatore nel tuo club.",
    historyUnavailable: "Lo storico non è ancora collegato.", pointsHint: "Punti accreditati al tuo club, non il totale stagionale del giocatore.",
    noName: "Giocatore", noBalance: "Saldo non ancora confermato", confirmedBalance: "Saldo confermato", playerCost: "Costi di ingaggio della rosa attuale", coachCost: "Costo di ingaggio dell'allenatore",
    paid: "Valore dell'ingaggio", position: "Posizione", club: "Club", area: "Area", points: "Punti nel tuo club", lock: "Formazione confermata il",
    acquisition: "Ingaggio", exchange: "Scambio", refund: "Rimborso", bonus: "Bonus", date: "Data", change: "Movimento di crediti",
    balanceHintDetail: "Importi in crediti TouchLine. Non sono fondi disponibili per il prelievo.", readOnly: "Registri del tuo club",
  },
  "fr-FR": {
    title: "Bureau du club", subtitle: "ClubOwner / Gestion", back: "Retour", close: "Fermer le bureau",
    roster: "Effectif et points", movements: "Recrutements et échanges", balance: "Bilan des crédits",
    rosterHint: "Vos joueurs et les points du club", movementsHint: "Registres de vos mouvements", balanceHint: "Solde confirmé et effectif actuel",
    view: "Ouvrir", details: "Voir les détails", players: "Joueurs", starters: "Titulaires", reserves: "Remplaçants", outside: "Hors du groupe de match",
    loading: "Chargement des données du club…", error: "Les données du club n'ont pas pu être confirmées.", unavailable: "Les données ne sont pas encore disponibles.",
    emptyRoster: "Votre effectif est encore vide.", emptyHistory: "Aucun mouvement enregistré.", emptyPoints: "Aucun point enregistré pour ce joueur dans votre club.",
    historyUnavailable: "L'historique n'est pas encore connecté.", pointsHint: "Points crédités à votre club, pas le total du joueur sur la saison.",
    noName: "Joueur", noBalance: "Solde pas encore confirmé", confirmedBalance: "Solde confirmé", playerCost: "Coûts de recrutement de l'effectif actuel", coachCost: "Coût de recrutement de l'entraîneur",
    paid: "Valeur du recrutement", position: "Poste", club: "Club", area: "Zone", points: "Points pour votre club", lock: "Composition confirmée le",
    acquisition: "Recrutement", exchange: "Échange", refund: "Remboursement", bonus: "Bonus", date: "Date", change: "Mouvement de crédits",
    balanceHintDetail: "Montants en crédits TouchLine. Il ne s'agit pas de fonds disponibles au retrait.", readOnly: "Registres de votre club",
  },
  "ar-SA": {
    title: "مكتب النادي", subtitle: "ClubOwner / الإدارة", back: "رجوع", close: "إغلاق المكتب",
    roster: "القائمة والنقاط", movements: "التعاقدات والتبادلات", balance: "حساب الرصيد",
    rosterHint: "لاعبوك ونقاط النادي", movementsHint: "سجلات معاملاتك", balanceHint: "الرصيد المؤكد والقائمة الحالية",
    view: "فتح", details: "عرض التفاصيل", players: "اللاعبون", starters: "الأساسيون", reserves: "البدلاء", outside: "خارج قائمة المباراة",
    loading: "جارٍ تحميل بيانات النادي…", error: "تعذر تأكيد بيانات النادي.", unavailable: "البيانات غير متاحة بعد.",
    emptyRoster: "قائمة فريقك لا تزال فارغة.", emptyHistory: "لا توجد معاملات مسجلة.", emptyPoints: "لا توجد نقاط مسجلة لهذا اللاعب في ناديك.",
    historyUnavailable: "السجل غير متصل بعد.", pointsHint: "النقاط المضافة إلى ناديك، وليست مجموع نقاط اللاعب في الموسم.",
    noName: "لاعب", noBalance: "الرصيد غير مؤكد بعد", confirmedBalance: "الرصيد المؤكد", playerCost: "تكاليف التعاقد مع لاعبي القائمة الحالية", coachCost: "تكلفة التعاقد مع المدرب",
    paid: "قيمة التعاقد", position: "المركز", club: "النادي", area: "القسم", points: "النقاط لناديك", lock: "تاريخ تأكيد التشكيلة",
    acquisition: "تعاقد", exchange: "تبادل", refund: "استرداد", bonus: "مكافأة", date: "التاريخ", change: "حركة الرصيد",
    balanceHintDetail: "المبالغ بوحدات رصيد TouchLine. وهي ليست أموالاً متاحة للسحب.", readOnly: "سجلات ناديك",
  },
  "tr-TR": {
    title: "Kulüp ofisi", subtitle: "ClubOwner / Yönetim", back: "Geri", close: "Ofisi kapat",
    roster: "Kadro ve puanlar", movements: "Transferler ve takaslar", balance: "Kredi bilançosu",
    rosterHint: "Oyuncularınız ve kulüp puanlarınız", movementsHint: "İşlem kayıtlarınız", balanceHint: "Doğrulanmış bakiye ve mevcut kadro",
    view: "Aç", details: "Ayrıntıları gör", players: "Oyuncular", starters: "İlk 11", reserves: "Yedekler", outside: "Maç kadrosu dışında",
    loading: "Kulüp verileri yükleniyor…", error: "Kulüp verileri doğrulanamadı.", unavailable: "Veriler henüz mevcut değil.",
    emptyRoster: "Kadronuz hâlâ boş.", emptyHistory: "Kayıtlı işlem yok.", emptyPoints: "Bu oyuncu için kulübünüzde kayıtlı puan yok.",
    historyUnavailable: "Geçmiş henüz bağlı değil.", pointsHint: "Kulübünüze yazılan puanlar; oyuncunun sezon toplamı değil.",
    noName: "Oyuncu", noBalance: "Bakiye henüz doğrulanmadı", confirmedBalance: "Doğrulanmış bakiye", playerCost: "Mevcut kadronun transfer maliyetleri", coachCost: "Teknik direktör transfer maliyeti",
    paid: "Transfer bedeli", position: "Pozisyon", club: "Kulüp", area: "Bölüm", points: "Kulübünüz için puanlar", lock: "Kadro onay tarihi",
    acquisition: "Transfer", exchange: "Takas", refund: "İade", bonus: "Bonus", date: "Tarih", change: "Kredi hareketi",
    balanceHintDetail: "Tutarlar TouchLine kredisi cinsindendir. Çekilebilir para değildir.", readOnly: "Kulüp kayıtlarınız",
  },
  "de-DE": {
    title: "Vereinsbüro", subtitle: "ClubOwner / Verwaltung", back: "Zurück", close: "Büro schließen",
    roster: "Kader und Punkte", movements: "Verpflichtungen und Tauschgeschäfte", balance: "Guthabenübersicht",
    rosterHint: "Deine Spieler und Vereinspunkte", movementsHint: "Deine Transaktionsaufzeichnungen", balanceHint: "Bestätigtes Guthaben und aktueller Kader",
    view: "Öffnen", details: "Details anzeigen", players: "Spieler", starters: "Startelf", reserves: "Ersatzspieler", outside: "Außerhalb des Spieltagskaders",
    loading: "Vereinsdaten werden geladen…", error: "Vereinsdaten konnten nicht bestätigt werden.", unavailable: "Daten sind noch nicht verfügbar.",
    emptyRoster: "Dein Kader ist noch leer.", emptyHistory: "Keine Transaktionen erfasst.", emptyPoints: "Für diesen Spieler sind in deinem Verein keine Punkte erfasst.",
    historyUnavailable: "Der Verlauf ist noch nicht angebunden.", pointsHint: "Deinem Verein gutgeschriebene Punkte, nicht die Saisonpunkte des Spielers.",
    noName: "Spieler", noBalance: "Guthaben noch nicht bestätigt", confirmedBalance: "Bestätigtes Guthaben", playerCost: "Verpflichtungskosten des aktuellen Kaders", coachCost: "Verpflichtungskosten des Trainers",
    paid: "Verpflichtungswert", position: "Position", club: "Verein", area: "Bereich", points: "Punkte für deinen Verein", lock: "Aufstellung bestätigt am",
    acquisition: "Verpflichtung", exchange: "Tausch", refund: "Rückerstattung", bonus: "Bonus", date: "Datum", change: "Guthabenbewegung",
    balanceHintDetail: "Beträge in TouchLine-Credits. Es handelt sich nicht um auszahlbares Geld.", readOnly: "Deine Vereinsaufzeichnungen",
  },
};
