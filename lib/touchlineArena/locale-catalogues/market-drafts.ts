import type { TouchLineMarketCopy } from "../market-i18n.ts";
import { TOUCHLINE_DRAFT_LOCALES, type TouchlineDraftLocale, type TouchlineDraftTranslations } from "./core-drafts.ts";

type StaticKey = { [Key in keyof TouchLineMarketCopy]: TouchLineMarketCopy[Key] extends string ? Key : never }[keyof TouchLineMarketCopy];
type FunctionalCopy = Omit<TouchLineMarketCopy, StaticKey>;
export const TOUCHLINE_MARKET_DRAFT_STATE = "draft" as const;

/** ES/IT/FR/AR/TR/DE. Draft copy only: no prices, contracts or runtime gates change. */
const rows = {
  productName: ["Market Transfer", "Market Transfer", "Market Transfer", "Market Transfer", "Market Transfer", "Market Transfer"],
  fullProductName: ["TouchLine Market Transfer", "TouchLine Market Transfer", "TouchLine Market Transfer", "TouchLine Market Transfer", "TouchLine Market Transfer", "TouchLine Market Transfer"],
  metadataDescription: ["Contratos oficiales de cartas de jugadores de TouchLine y Market Transfer.", "Contratti ufficiali delle carte giocatore TouchLine e Market Transfer.", "Contrats officiels des cartes de joueurs TouchLine et Market Transfer.", "عقود بطاقات اللاعبين الرسمية في TouchLine وMarket Transfer.", "Resmî TouchLine oyuncu kartı sözleşmeleri ve Market Transfer.", "Offizielle TouchLine-Spielerkartenverträge und Market Transfer."],
  searchPlaceholder: ["Buscar jugador, posición o país", "Cerca giocatore, ruolo o paese", "Rechercher un joueur, un poste ou un pays", "ابحث عن لاعب أو مركز أو بلد", "Oyuncu, mevki veya ülke ara", "Spieler, Position oder Land suchen"],
  filterAll: ["Todos", "Tutti", "Tous", "الكل", "Tümü", "Alle"],
  sortRecommended: ["Recomendados", "Consigliati", "Recommandés", "موصى به", "Önerilen", "Empfohlen"],
  sortPriceLow: ["Menor precio de carta", "Prezzo della carta più basso", "Prix de carte le plus bas", "أقل سعر للبطاقة", "En düşük kart fiyatı", "Niedrigster Kartenpreis"],
  sortPriceHigh: ["Mayor precio de carta", "Prezzo della carta più alto", "Prix de carte le plus élevé", "أعلى سعر للبطاقة", "En yüksek kart fiyatı", "Höchster Kartenpreis"],
  sortTierHigh: ["Mayor categoría de carta", "Categoria della carta più alta", "Catégorie de carte la plus élevée", "أعلى فئة للبطاقة", "En yüksek kart seviyesi", "Höchste Kartenstufe"],
  sortAlphabetical: ["Nombre A–Z", "Nome A–Z", "Nom A–Z", "الاسم A–Z", "Ad A–Z", "Name A–Z"],
  liveMarket: ["Mercado en directo", "Mercato in diretta", "Marché en direct", "السوق المباشر", "Canlı pazar", "Live-Markt"],
  launchTestNotice: ["Periodo de pruebas de lanzamiento · los precios de las cartas siguen visibles como referencia. Los contratos de prueba cuestan ahora 0 TC.", "Periodo di prova del lancio · i prezzi delle carte restano visibili come riferimento. I contratti di prova costano attualmente 0 TC.", "Période de test du lancement · les prix des cartes restent visibles à titre indicatif. Les contrats de test coûtent actuellement 0 TC.", "فترة اختبار الإطلاق · تظل أسعار البطاقات ظاهرة كمرجع. تكلفة العقود التجريبية حاليًا 0 TC.", "Lansman test dönemi · kart fiyatları referans olarak görünür kalır. Test sözleşmeleri şu anda 0 TC tutarındadır.", "Testphase zum Start · Kartenpreise bleiben als Referenz sichtbar. Testverträge kosten derzeit 0 TC."],
  launchTestCheckout: ["Contratación de prueba · 0 TC", "Contratto di prova · 0 TC", "Contrat de test · 0 TC", "تعاقد تجريبي · 0 TC", "Test sözleşmesi · 0 TC", "Testvertrag · 0 TC"],
  secureCheckout: ["Confirmación de contrato protegida", "Conferma del contratto protetta", "Confirmation de contrat protégée", "تأكيد عقد محمي", "Korumalı sözleşme onayı", "Geschützte Vertragsbestätigung"],
  viewCard: ["Ver carta", "Visualizza la carta", "Voir la carte", "عرض البطاقة", "Kartı görüntüle", "Karte ansehen"],
  inSquad: ["En la plantilla", "In rosa", "Dans l’effectif", "ضمن القائمة", "Kadroda", "Im Kader"],
  onPitch: ["En el campo", "In campo", "Sur le terrain", "في الملعب", "Sahada", "Auf dem Spielfeld"],
  negotiationRoom: ["Sala de negociación", "Sala trattative", "Salle de négociation", "غرفة المفاوضات", "Görüşme odası", "Verhandlungsraum"],
  officialContracts: ["Contratos oficiales TouchLine", "Contratti ufficiali TouchLine", "Contrats officiels TouchLine", "عقود TouchLine الرسمية", "Resmî TouchLine sözleşmeleri", "Offizielle TouchLine-Verträge"],
  dealSearch: ["Elige al jugador", "Scegli il giocatore", "Choisissez le joueur", "اختر اللاعب", "Oyuncuyu seçin", "Wähle den Spieler"],
  dealCart: ["Añadir a los jugadores seleccionados", "Aggiungi ai giocatori selezionati", "Ajouter aux joueurs sélectionnés", "أضف إلى اللاعبين المحددين", "Seçilen oyunculara ekle", "Zu ausgewählten Spielern hinzufügen"],
  dealConfirm: ["Confirmar contrato", "Conferma il contratto", "Confirmer le contrat", "تأكيد العقد", "Sözleşmeyi onayla", "Vertrag bestätigen"],
  touchlineCredits: ["TouchLine Credits", "TouchLine Credits", "TouchLine Credits", "TouchLine Credits", "TouchLine Credits", "TouchLine Credits"],
  squadValue: ["Valor de las cartas de la plantilla", "Valore delle carte della rosa", "Valeur des cartes de l’effectif", "قيمة بطاقات القائمة", "Kadro kart değeri", "Kaderkartenwert"],
  activeContracts: ["Contratos activos", "Contratti attivi", "Contrats actifs", "العقود النشطة", "Aktif sözleşmeler", "Aktive Verträge"],
  clubsRepresented: ["Clubes representados", "Club rappresentati", "Clubs représentés", "الأندية الممثلة", "Temsil edilen kulüpler", "Vertretene Vereine"],
  myClub: ["Mi club", "Il mio club", "Mon club", "ناديي", "Kulübüm", "Mein Verein"],
  showOnlyNeededPositions: ["Mostrar posiciones necesarias", "Mostra i ruoli necessari", "Afficher les postes nécessaires", "عرض المراكز المطلوبة", "Gerekli mevkileri göster", "Benötigte Positionen anzeigen"],
  showAllPositions: ["Mostrar todas las posiciones", "Mostra tutti i ruoli", "Afficher tous les postes", "عرض جميع المراكز", "Tüm mevkileri göster", "Alle Positionen anzeigen"],
  currentBalance: ["Saldo actual", "Saldo attuale", "Solde actuel", "الرصيد الحالي", "Güncel bakiye", "Aktuelles Guthaben"],
  cardUnavailable: ["Carta no disponible", "Carta non disponibile", "Carte indisponible", "البطاقة غير متاحة", "Kart kullanılamıyor", "Karte nicht verfügbar"],
  touchlinePrice: ["Precio de la carta", "Prezzo della carta", "Prix de la carte", "سعر البطاقة", "Kart fiyatı", "Kartenpreis"],
  cardTier: ["Categoría de la carta", "Categoria della carta", "Catégorie de la carte", "فئة البطاقة", "Kart seviyesi", "Kartenstufe"],
  viewFullProfile: ["Ver perfil completo", "Visualizza il profilo completo", "Voir le profil complet", "عرض الملف الكامل", "Tam profili görüntüle", "Vollständiges Profil ansehen"],
  reviewContract: ["Revisar contrato", "Rivedi il contratto", "Vérifier le contrat", "مراجعة العقد", "Sözleşmeyi incele", "Vertrag prüfen"],
  confirmSigning: ["Confirmar fichaje", "Conferma l’ingaggio", "Confirmer le recrutement", "تأكيد التعاقد", "Transferi onayla", "Verpflichtung bestätigen"],
  cancel: ["Cancelar", "Annulla", "Annuler", "إلغاء", "İptal", "Abbrechen"],
  selectedContracts: ["Contratos seleccionados", "Contratti selezionati", "Contrats sélectionnés", "العقود المحددة", "Seçilen sözleşmeler", "Ausgewählte Verträge"],
  totalContractValue: ["Touch Credits necesarios", "Touch Credits necessari", "Touch Credits nécessaires", "Touch Credits المطلوبة", "Gerekli Touch Credits", "Benötigte Touch Credits"],
  balanceAfterSigning: ["Saldo tras el fichaje", "Saldo dopo l’ingaggio", "Solde après le recrutement", "الرصيد بعد التعاقد", "Transfer sonrası bakiye", "Guthaben nach Verpflichtung"],
  updatingClub: ["Actualizando club", "Aggiornamento del club", "Mise à jour du club", "جارٍ تحديث النادي", "Kulüp güncelleniyor", "Verein wird aktualisiert"],
  marketDataPending: ["Datos del mercado pendientes", "Dati di mercato in attesa", "Données du marché en attente", "بيانات السوق قيد الانتظار", "Pazar verileri bekleniyor", "Marktdaten ausstehend"],
  noContractSelected: ["Ningún contrato seleccionado", "Nessun contratto selezionato", "Aucun contrat sélectionné", "لم يتم تحديد عقد", "Sözleşme seçilmedi", "Kein Vertrag ausgewählt"],
  emptySquadCallToAction: ["Ficha jugadores en Market Transfer para construir la plantilla.", "Ingaggia giocatori in Market Transfer per costruire la rosa.", "Recrutez des joueurs dans Market Transfer pour composer l’effectif.", "تعاقد مع لاعبين في Market Transfer لتكوين القائمة.", "Kadronuzu kurmak için Market Transfer’da oyuncu transfer edin.", "Verpflichte Spieler in Market Transfer, um den Kader aufzubauen."],
  oneSeasonContract: ["Contrato · 1 temporada", "Contratto · 1 stagione", "Contrat · 1 saison", "عقد · 1 موسم", "Sözleşme · 1 sezon", "Vertrag · 1 Saison"],
  officialTier: ["Categoría oficial", "Categoria ufficiale", "Catégorie officielle", "الفئة الرسمية", "Resmî seviye", "Offizielle Stufe"],
  position: ["Posición", "Ruolo", "Poste", "المركز", "Mevki", "Position"],
  positionLimit: ["Límite de posición en plantilla", "Limite del ruolo in rosa", "Limite du poste dans l’effectif", "حد المركز في القائمة", "Kadro mevki sınırı", "Positionslimit im Kader"],
  formationFit: ["Encaje en la formación", "Compatibilità con il modulo", "Compatibilité avec le dispositif", "التوافق مع الخطة", "Dizilişe uygunluk", "Formationspassung"],
  nationality: ["Nacionalidad", "Nazionalità", "Nationalité", "الجنسية", "Uyruk", "Nationalität"],
  choosePremierClub: ["Elige un club de la Premier", "Scegli un club della Premier", "Choisissez un club de Premier League", "اختر ناديًا من Premier League", "Bir Premier kulübü seçin", "Wähle einen Premier-Verein"],
  playerNotFound: ["Jugador no encontrado en este mercado", "Giocatore non trovato in questo mercato", "Joueur introuvable sur ce marché", "لم يُعثر على اللاعب في هذا السوق", "Oyuncu bu pazarda bulunamadı", "Spieler in diesem Markt nicht gefunden"],
  connectionUnavailable: ["Conexión con el mercado no disponible", "Connessione al mercato non disponibile", "Connexion au marché indisponible", "الاتصال بالسوق غير متاح", "Pazar bağlantısı kullanılamıyor", "Marktverbindung nicht verfügbar"],
  checkoutInvalidResponse: ["No se ha podido validar la respuesta del contrato", "Impossibile convalidare la risposta del contratto", "Impossible de valider la réponse du contrat", "تعذر التحقق من استجابة العقد", "Sözleşme yanıtı doğrulanamadı", "Die Vertragsantwort konnte nicht validiert werden"],
  releaseIdentitySyncing: ["La identidad del contrato se está sincronizando; no se ha liberado a ningún jugador", "L’identità del contratto è in sincronizzazione; nessun giocatore è stato rilasciato", "L’identité du contrat se synchronise ; aucun joueur n’a été libéré", "جارٍ مزامنة هوية العقد؛ لم يتم الاستغناء عن أي لاعب", "Sözleşme kimliği eşitleniyor; hiçbir oyuncu serbest bırakılmadı", "Die Vertragsidentität wird synchronisiert; kein Spieler wurde freigegeben"],
  releaseInProgress: ["Liberando contrato de forma segura", "Rilascio sicuro del contratto", "Libération sécurisée du contrat", "جارٍ إنهاء العقد بأمان", "Sözleşme güvenle sonlandırılıyor", "Vertrag wird sicher freigegeben"],
  releaseInvalidResponse: ["No se ha podido validar la respuesta de liberación del contrato", "Impossibile convalidare la risposta del rilascio del contratto", "Impossible de valider la réponse de libération du contrat", "تعذر التحقق من استجابة إنهاء العقد", "Sözleşme sonlandırma yanıtı doğrulanamadı", "Die Antwort zur Vertragsfreigabe konnte nicht validiert werden"],
  releaseConnectionUnavailable: ["Conexión no disponible; ningún contrato local ha cambiado", "Connessione non disponibile; nessun contratto locale è stato modificato", "Connexion indisponible ; aucun contrat local n’a été modifié", "الاتصال غير متاح؛ لم يتغير أي عقد محلي", "Bağlantı kullanılamıyor; hiçbir yerel sözleşme değişmedi", "Verbindung nicht verfügbar; kein lokaler Vertrag wurde geändert"],
  genericError: ["Market Transfer no está disponible temporalmente", "Market Transfer è temporaneamente non disponibile", "Market Transfer est temporairement indisponible", "Market Transfer غير متاح مؤقتًا", "Market Transfer geçici olarak kullanılamıyor", "Market Transfer ist vorübergehend nicht verfügbar"],
  ariaArenaControls: ["Controles de la Arena", "Controlli dell’Arena", "Commandes de l’Arena", "عناصر التحكم في الساحة", "Arena kontrolleri", "Arena-Steuerung"],
  ariaArenaQuickActions: ["Acciones rápidas de la Arena", "Azioni rapide dell’Arena", "Actions rapides de l’Arena", "إجراءات الساحة السريعة", "Arena hızlı işlemleri", "Arena-Schnellaktionen"],
  ariaActionPanel: ["Panel de acciones de la Arena", "Pannello azioni dell’Arena", "Panneau d’actions de l’Arena", "لوحة إجراءات الساحة", "Arena işlem paneli", "Arena-Aktionsbereich"],
  ariaEnglandClubs: ["Clubes de TouchLine England 2026–2027", "Club di TouchLine England 2026–2027", "Clubs de TouchLine England 2026–2027", "أندية TouchLine England ‏2026–2027", "TouchLine England kulüpleri 2026–2027", "TouchLine England-Vereine 2026–2027"],
  ariaClearSearch: ["Borrar búsqueda", "Cancella la ricerca", "Effacer la recherche", "مسح البحث", "Aramayı temizle", "Suche löschen"],
  ariaPositionFilters: ["Filtros por posición", "Filtri per ruolo", "Filtres par poste", "مرشحات المركز", "Mevki filtreleri", "Positionsfilter"],
  ariaSortMarketCards: ["Ordenar cartas del mercado", "Ordina le carte del mercato", "Trier les cartes du marché", "ترتيب بطاقات السوق", "Pazar kartlarını sırala", "Marktkarten sortieren"],
  ariaSelectedPlayerCard: ["Carta del jugador seleccionado", "Carta del giocatore selezionato", "Carte du joueur sélectionné", "بطاقة اللاعب المحدد", "Seçilen oyuncu kartı", "Ausgewählte Spielerkarte"],
  ariaMarketCardAccounting: ["Datos contables de la carta en el mercado", "Dati contabili della carta sul mercato", "Données comptables de la carte du marché", "البيانات المحاسبية لبطاقة السوق", "Pazar kartı hesap bilgileri", "Abrechnungsdaten der Marktkarte"],
  ariaCardDetails: ["Detalles de la carta", "Dettagli della carta", "Détails de la carte", "تفاصيل البطاقة", "Kart ayrıntıları", "Kartendetails"],
  ariaMyClubProgress: ["Progreso de la plantilla de mi club", "Progresso della rosa del mio club", "Progression de l’effectif de mon club", "تقدم قائمة ناديي", "Kulübümün kadro ilerlemesi", "Kaderfortschritt meines Vereins"],
} satisfies Record<StaticKey, TouchlineDraftTranslations>;

function number(locale: TouchlineDraftLocale, value: number) {
  return new Intl.NumberFormat(locale).format(value);
}

function plural(locale: TouchlineDraftLocale, count: number, one: string, other: string) {
  return new Intl.PluralRules(locale).select(count) === "one" ? one : other;
}

// Names remain byte-for-byte within isolation marks; this does not translate,
// normalize, reidentify or interpolate them into markup.
const isolate = (value: string) => `\u2068${value}\u2069`;

function arabicCount(count: number, forms: Record<Intl.LDMLPluralRule, (formatted: string) => string>) {
  return forms[new Intl.PluralRules("ar-SA").select(count)](number("ar-SA", count));
}

const functions = {
  "es-ES": {
    squadProgress: (count, limit) => `${number("es-ES", count)}/${number("es-ES", limit)} jugadores`,
    playersRemaining: (count) => `${plural("es-ES", count, "Falta", "Faltan")} ${number("es-ES", count)} ${plural("es-ES", count, "jugador", "jugadores")} para completar la plantilla`,
    cardsFound: (count) => `${number("es-ES", count)} ${plural("es-ES", count, "carta encontrada", "cartas encontradas")}`,
    copiesAvailable: (count) => `${number("es-ES", count)} ${plural("es-ES", count, "copia disponible", "copias disponibles")}`,
    positionRosterCount: (count, limit) => `${number("es-ES", count)}/${number("es-ES", limit)} en la plantilla`,
    positionLimitReached: (position, limit) => `Límite de ${position} alcanzado (${number("es-ES", limit)})`,
    clubSquadAria: (clubName) => `Plantilla de ${clubName}`,
    playerAlreadyOnPitch: (playerName) => `${playerName} ya está en el campo`,
    playerAlreadyInSquad: (playerName) => `${playerName} ya está en la plantilla`,
    contractReleased: (playerName) => `El contrato de ${playerName} se ha liberado a TouchLine Market Transfer`,
    replacementReleased: (incomingPlayer, outgoingPlayer) => `${incomingPlayer} sustituyó a ${outgoingPlayer}; el contrato de ${outgoingPlayer} se ha liberado a TouchLine Market Transfer`,
  },
  "it-IT": {
    squadProgress: (count, limit) => `${number("it-IT", count)}/${number("it-IT", limit)} giocatori`,
    playersRemaining: (count) => `${plural("it-IT", count, "Manca", "Mancano")} ${number("it-IT", count)} ${plural("it-IT", count, "giocatore", "giocatori")} per completare la rosa`,
    cardsFound: (count) => `${number("it-IT", count)} ${plural("it-IT", count, "carta trovata", "carte trovate")}`,
    copiesAvailable: (count) => `${number("it-IT", count)} ${plural("it-IT", count, "copia disponibile", "copie disponibili")}`,
    positionRosterCount: (count, limit) => `${number("it-IT", count)}/${number("it-IT", limit)} in rosa`,
    positionLimitReached: (position, limit) => `Limite per ${position} raggiunto (${number("it-IT", limit)})`,
    clubSquadAria: (clubName) => `Rosa di ${clubName}`,
    playerAlreadyOnPitch: (playerName) => `${playerName} è già in campo`,
    playerAlreadyInSquad: (playerName) => `${playerName} è già in rosa`,
    contractReleased: (playerName) => `Il contratto di ${playerName} è stato rilasciato su TouchLine Market Transfer`,
    replacementReleased: (incomingPlayer, outgoingPlayer) => `${incomingPlayer} ha sostituito ${outgoingPlayer}; il contratto di ${outgoingPlayer} è stato rilasciato su TouchLine Market Transfer`,
  },
  "fr-FR": {
    squadProgress: (count, limit) => `${number("fr-FR", count)}/${number("fr-FR", limit)} joueurs`,
    playersRemaining: (count) => `Il reste ${number("fr-FR", count)} ${plural("fr-FR", count, "joueur", "joueurs")} pour compléter l’effectif`,
    cardsFound: (count) => `${number("fr-FR", count)} ${plural("fr-FR", count, "carte trouvée", "cartes trouvées")}`,
    copiesAvailable: (count) => `${number("fr-FR", count)} ${plural("fr-FR", count, "copie disponible", "copies disponibles")}`,
    positionRosterCount: (count, limit) => `${number("fr-FR", count)}/${number("fr-FR", limit)} dans l’effectif`,
    positionLimitReached: (position, limit) => `Limite pour ${position} atteinte (${number("fr-FR", limit)})`,
    clubSquadAria: (clubName) => `Effectif de ${clubName}`,
    playerAlreadyOnPitch: (playerName) => `${playerName} est déjà sur le terrain`,
    playerAlreadyInSquad: (playerName) => `${playerName} figure déjà dans l’effectif`,
    contractReleased: (playerName) => `Le contrat de ${playerName} a été libéré vers TouchLine Market Transfer`,
    replacementReleased: (incomingPlayer, outgoingPlayer) => `${incomingPlayer} a remplacé ${outgoingPlayer} ; le contrat de ${outgoingPlayer} a été libéré vers TouchLine Market Transfer`,
  },
  "ar-SA": {
    squadProgress: (count, limit) => `عدد اللاعبين: ${isolate(`${number("ar-SA", count)}/${number("ar-SA", limit)}`)}`,
    playersRemaining: (count) => arabicCount(count, {
      zero: (n) => `لا يلزم لاعب إضافي لإكمال القائمة (${n})`,
      one: (n) => `يتبقى لاعب واحد لإكمال القائمة (${n})`,
      two: (n) => `يتبقى لاعبان لإكمال القائمة (${n})`,
      few: (n) => `يتبقى ${n} لاعبين لإكمال القائمة`,
      many: (n) => `يتبقى ${n} لاعبًا لإكمال القائمة`,
      other: (n) => `يتبقى ${n} لاعب لإكمال القائمة`,
    }),
    cardsFound: (count) => arabicCount(count, {
      zero: (n) => `لم يتم العثور على بطاقات (${n})`,
      one: (n) => `تم العثور على بطاقة واحدة (${n})`,
      two: (n) => `تم العثور على بطاقتين (${n})`,
      few: (n) => `تم العثور على ${n} بطاقات`,
      many: (n) => `تم العثور على ${n} بطاقة`,
      other: (n) => `تم العثور على ${n} بطاقة`,
    }),
    copiesAvailable: (count) => arabicCount(count, {
      zero: (n) => `لا توجد نسخ متاحة (${n})`,
      one: (n) => `نسخة واحدة متاحة (${n})`,
      two: (n) => `نسختان متاحتان (${n})`,
      few: (n) => `${n} نسخ متاحة`,
      many: (n) => `${n} نسخة متاحة`,
      other: (n) => `${n} نسخة متاحة`,
    }),
    positionRosterCount: (count, limit) => `في القائمة: ${isolate(`${number("ar-SA", count)}/${number("ar-SA", limit)}`)}`,
    positionLimitReached: (position, limit) => `تم بلوغ حد ${isolate(position)} (${number("ar-SA", limit)})`,
    clubSquadAria: (clubName) => `قائمة ${isolate(clubName)}`,
    playerAlreadyOnPitch: (playerName) => `${isolate(playerName)} موجود في الملعب بالفعل`,
    playerAlreadyInSquad: (playerName) => `${isolate(playerName)} موجود في القائمة بالفعل`,
    contractReleased: (playerName) => `تم إنهاء عقد ${isolate(playerName)} وإعادته إلى ${isolate("TouchLine Market Transfer")}`,
    replacementReleased: (incomingPlayer, outgoingPlayer) => `حل ${isolate(incomingPlayer)} محل ${isolate(outgoingPlayer)}؛ تم إنهاء عقد ${isolate(outgoingPlayer)} وإعادته إلى ${isolate("TouchLine Market Transfer")}`,
  },
  "tr-TR": {
    squadProgress: (count, limit) => `${number("tr-TR", count)}/${number("tr-TR", limit)} oyuncu`,
    playersRemaining: (count) => `Kadroyu tamamlamak için ${number("tr-TR", count)} oyuncu kaldı`,
    cardsFound: (count) => `${number("tr-TR", count)} kart bulundu`,
    copiesAvailable: (count) => `${number("tr-TR", count)} kopya mevcut`,
    positionRosterCount: (count, limit) => `${number("tr-TR", count)}/${number("tr-TR", limit)} kadroda`,
    positionLimitReached: (position, limit) => `${position} sınırına ulaşıldı (${number("tr-TR", limit)})`,
    clubSquadAria: (clubName) => `${clubName} kadrosu`,
    playerAlreadyOnPitch: (playerName) => `${playerName} zaten sahada`,
    playerAlreadyInSquad: (playerName) => `${playerName} zaten kadroda`,
    contractReleased: (playerName) => `${playerName} için sözleşme sonlandırıldı ve kart TouchLine Market Transfer’a döndü`,
    replacementReleased: (incomingPlayer, outgoingPlayer) => `${incomingPlayer}, ${outgoingPlayer} yerine geçti; ${outgoingPlayer} için sözleşme sonlandırıldı ve kart TouchLine Market Transfer’a döndü`,
  },
  "de-DE": {
    squadProgress: (count, limit) => `${number("de-DE", count)}/${number("de-DE", limit)} Spieler`,
    playersRemaining: (count) => `Es ${plural("de-DE", count, "fehlt", "fehlen")} ${number("de-DE", count)} Spieler bis zum vollständigen Kader`,
    cardsFound: (count) => `${number("de-DE", count)} ${plural("de-DE", count, "Karte", "Karten")} gefunden`,
    copiesAvailable: (count) => `${number("de-DE", count)} ${plural("de-DE", count, "Exemplar", "Exemplare")} verfügbar`,
    positionRosterCount: (count, limit) => `${number("de-DE", count)}/${number("de-DE", limit)} im Kader`,
    positionLimitReached: (position, limit) => `Limit für ${position} erreicht (${number("de-DE", limit)})`,
    clubSquadAria: (clubName) => `Kader von ${clubName}`,
    playerAlreadyOnPitch: (playerName) => `${playerName} ist bereits auf dem Spielfeld`,
    playerAlreadyInSquad: (playerName) => `${playerName} ist bereits im Kader`,
    contractReleased: (playerName) => `Der Vertrag von ${playerName} wurde für TouchLine Market Transfer freigegeben`,
    replacementReleased: (incomingPlayer, outgoingPlayer) => `${incomingPlayer} hat ${outgoingPlayer} ersetzt; der Vertrag von ${outgoingPlayer} wurde für TouchLine Market Transfer freigegeben`,
  },
} satisfies Record<TouchlineDraftLocale, FunctionalCopy>;

export const touchlineMarketDrafts = Object.fromEntries(
  TOUCHLINE_DRAFT_LOCALES.map((locale, index) => [locale, {
    ...Object.fromEntries(Object.entries(rows).map(([key, translations]) => [key, translations[index]])),
    ...functions[locale],
  }]),
) as Record<TouchlineDraftLocale, TouchLineMarketCopy>;
