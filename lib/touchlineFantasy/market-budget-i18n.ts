import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";
import type { TouchLineLocale } from "../touchlineArena/i18n.ts";

export const TOUCHLINE_FANTASY_MARKET_BUDGET_COPY = {
  "en-GB": {
    insufficient: "Insufficient budget",
    exhausted: "Your XI budget is used up", exceeded: "This player would exceed your XI budget",
    advice: "Choose cheaper players or compare plans with a larger budget. You can remove a player or replace one with a cheaper option to free up budget; coaches remain free.",
    compare: "Explore and compare plans", upgrade: "Change plan", reviewXI: "Review and replace players", previewOnly: "Plan information only. Opening this comparison does not change your plan or make a payment.",
    rule: "Your current plan's XI budget is {budget} TC. Coaches are free.",
  },
  "pt-BR": {
    insufficient: "Saldo insuficiente",
    exhausted: "O orçamento do seu XI acabou", exceeded: "Este jogador ultrapassaria o orçamento do seu XI",
    advice: "Escolha jogadores mais baratos ou conheça planos com mais orçamento. Você pode remover um jogador ou trocá-lo por outro mais barato para liberar saldo; treinadores continuam gratuitos.",
    compare: "Conhecer e comparar planos", upgrade: "Mudar de plano", reviewXI: "Revisar e trocar jogadores", previewOnly: "Apenas informações sobre os planos. Abrir esta comparação não muda seu plano nem faz uma cobrança.",
    rule: "O orçamento do XI no seu plano atual é de {budget} TC. Treinadores são gratuitos.",
  },
  "es-ES": {
    insufficient: "Saldo insuficiente",
    exhausted: "Has agotado el presupuesto de tu XI", exceeded: "Este jugador superaría el presupuesto de tu XI",
    advice: "Elige jugadores más baratos o compara planes con más presupuesto. Puedes quitar un jugador o sustituirlo por uno más barato para liberar saldo; los entrenadores siguen siendo gratis.",
    compare: "Conocer y comparar planes", upgrade: "Cambiar de plan", reviewXI: "Revisar y sustituir jugadores", previewOnly: "Solo información sobre los planes. Abrir esta comparación no cambia tu plan ni realiza ningún cobro.",
    rule: "El presupuesto del XI de tu plan actual es de {budget} TC. Los entrenadores son gratis.",
  },
  "it-IT": {
    insufficient: "Budget insufficiente",
    exhausted: "Il budget del tuo XI è esaurito", exceeded: "Questo giocatore supererebbe il budget del tuo XI",
    advice: "Scegli giocatori meno costosi o confronta piani con più budget. Puoi rimuovere un giocatore o sostituirlo con uno meno costoso per liberare budget; gli allenatori restano gratuiti.",
    compare: "Scopri e confronta i piani", upgrade: "Cambia piano", reviewXI: "Rivedi e sostituisci i giocatori", previewOnly: "Solo informazioni sui piani. Aprire questo confronto non cambia il tuo piano né effettua un pagamento.",
    rule: "Il budget del XI del tuo piano attuale è di {budget} TC. Gli allenatori sono gratuiti.",
  },
  "fr-FR": {
    insufficient: "Budget insuffisant",
    exhausted: "Le budget de votre XI est épuisé", exceeded: "Ce joueur dépasserait le budget de votre XI",
    advice: "Choisissez des joueurs moins chers ou comparez les offres avec un budget supérieur. Vous pouvez retirer un joueur ou le remplacer par un joueur moins cher pour libérer du budget ; les entraîneurs restent gratuits.",
    compare: "Découvrir et comparer les offres", upgrade: "Changer d’offre", reviewXI: "Revoir et remplacer des joueurs", previewOnly: "Informations uniquement. Ouvrir ce comparatif ne modifie pas votre offre et ne déclenche aucun paiement.",
    rule: "Le budget du XI de votre offre actuelle est de {budget} TC. Les entraîneurs sont gratuits.",
  },
  "ar-SA": {
    insufficient: "الرصيد غير كافٍ",
    exhausted: "نفدت ميزانية تشكيلتك الأساسية", exceeded: "سيؤدي اختيار هذا اللاعب إلى تجاوز ميزانية تشكيلتك",
    advice: "اختر لاعبين أقل تكلفة أو قارن الخطط ذات الميزانية الأكبر. يمكنك إزالة لاعب أو استبداله بآخر أقل تكلفة لتوفير رصيد؛ يبقى المدربون مجانيين.",
    compare: "استكشف الخطط وقارن بينها", upgrade: "تغيير الخطة", reviewXI: "راجع اللاعبين واستبدلهم", previewOnly: "معلومات عن الخطط فقط. فتح المقارنة لا يغيّر خطتك ولا ينفّذ أي عملية دفع.",
    rule: "ميزانية التشكيلة في خطتك الحالية هي {budget} TC. المدربون مجانيون.",
  },
  "tr-TR": {
    insufficient: "Yetersiz bütçe",
    exhausted: "İlk 11 bütçeniz tükendi", exceeded: "Bu oyuncu ilk 11 bütçenizi aşar",
    advice: "Daha ucuz oyuncular seçin veya daha yüksek bütçeli planları karşılaştırın. Bütçe açmak için bir oyuncuyu çıkarabilir ya da daha ucuz biriyle değiştirebilirsiniz; antrenörler ücretsiz kalır.",
    compare: "Planları keşfet ve karşılaştır", upgrade: "Planı değiştir", reviewXI: "Oyuncuları gözden geçir ve değiştir", previewOnly: "Yalnızca plan bilgileri. Bu karşılaştırmayı açmak planınızı değiştirmez veya ödeme yapmaz.",
    rule: "Mevcut planınızın ilk 11 bütçesi {budget} TC. Antrenörler ücretsizdir.",
  },
  "de-DE": {
    insufficient: "Unzureichendes Budget",
    exhausted: "Dein Startelf-Budget ist aufgebraucht", exceeded: "Dieser Spieler würde dein Startelf-Budget überschreiten",
    advice: "Wähle günstigere Spieler oder vergleiche Pläne mit höherem Budget. Du kannst einen Spieler entfernen oder durch einen günstigeren ersetzen, um Budget freizugeben; Trainer bleiben kostenlos.",
    compare: "Pläne entdecken und vergleichen", upgrade: "Plan ändern", reviewXI: "Spieler prüfen und ersetzen", previewOnly: "Nur Planinformationen. Das Öffnen dieses Vergleichs ändert deinen Plan nicht und löst keine Zahlung aus.",
    rule: "Das Startelf-Budget deines aktuellen Plans beträgt {budget} TC. Trainer sind kostenlos.",
  },
} as const;

type CollectionBudgetCopy = Readonly<{
  pendingRecoveryUnavailable: string;
  savedFormationUnverified: string;
  incompatibleSquadAllocation: string;
  confirmCoachToUnlockFormation: string;
  fullSquadRecruitmentUnavailable: string;
  outsideSlotsExchangeNotice: string;
  coachSelectedConfirmBesidePitch: string;
  sign: string;
  awaitingSigningConfirmation: string;
  qaMarketOpen: string; qaRulesNotice: string; signingDestination: string; waitForSquadConfirmation: string; squadChangedChooseSlot: string;
  confirmCoach: string; coachPendingConfirmation: string; confirmingSigning: string; confirmSigning: string; cancelCoachSelection: string;
  refreshSquad: string; confirmPendingOperation: string; squadBalance: string; lowBalance: string;
  signingBudget: string; lastConfirmedBalance: string; pending: string; unavailable: string;
  exhausted: string; exceeded: string; advice: string; reviewXI: string; rule: string; virtualBudgetSeparate: string;
}>;

/** Collection copy describes the club's signing funds, not the legacy XI valuation. */
export const TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY: Readonly<Record<TouchLineLocale, CollectionBudgetCopy>> = {
  "en-GB": {
    pendingRecoveryUnavailable: "Unable to verify pending operations. Refresh the squad to try again.",
    signingBudget: "Signing budget", lastConfirmedBalance: "Last confirmed balance",
    savedFormationUnverified: "Unable to verify the saved formation.",
    incompatibleSquadAllocation: "This change would not preserve your bench and squad positions. Choose a compatible position.",
    confirmCoachToUnlockFormation: "Confirm coach signing to unlock formation selection.",
    fullSquadRecruitmentUnavailable: "Full squad recruitment is not available yet.",
    outsideSlotsExchangeNotice: "15 outside-match slots · Same-position exchanges only. Proposal integration pending.",
    coachSelectedConfirmBesidePitch: "Coach selected. Confirm signing beside the pitch.",
    sign: "Sign",
    awaitingSigningConfirmation: "Awaiting signing confirmation.",
    qaMarketOpen: "Market open", qaRulesNotice: "Sign players within your budget and squad limits.", signingDestination: "Signing destination", waitForSquadConfirmation: "Wait for confirmation. Refresh only reads the squad.", squadChangedChooseSlot: "The squad changed. Choose the slot again.",
    confirmCoach: "Confirm coach", coachPendingConfirmation: "Coach selected, not yet signed. Confirm to deduct the cost and unlock formation selection.", confirmingSigning: "Confirming…", confirmSigning: "Confirm signing", cancelCoachSelection: "Cancel selection",
    refreshSquad: "Refresh squad", confirmPendingOperation: "Confirm pending operation", squadBalance: "Squad balance", lowBalance: "Low balance",
    pending: "Updating your club balance.", unavailable: "Your balance could not be updated. Refresh your squad before making a signing.",
    exhausted: "Your signing budget is used up", exceeded: "Insufficient balance for this signing",
    advice: "Review your squad or compare plans. Removing a player from the line-up does not return credits. Releasing a player requires confirmation of the contract termination fee.",
    reviewXI: "Review squad", rule: "Your plan provides {budget} TC for signings. Players and coaches use the club's available balance.",
    virtualBudgetSeparate: "Your club's signing budget is separate from the subscription price.",
  },
  "pt-BR": {
    pendingRecoveryUnavailable: "Não foi possível verificar as operações pendentes. Atualize o elenco para tentar novamente.",
    signingBudget: "Saldo para contratações", lastConfirmedBalance: "Último saldo confirmado",
    savedFormationUnverified: "Não foi possível confirmar a formação salva.",
    incompatibleSquadAllocation: "Esta alteração não mantém as posições do banco e do elenco. Escolha uma posição compatível.",
    confirmCoachToUnlockFormation: "Confirme a contratação do treinador para liberar a formação.",
    fullSquadRecruitmentUnavailable: "Elenco completo ainda indisponível para contratação.",
    outsideSlotsExchangeNotice: "15 vagas fora da partida · Trocas somente pela mesma posição. Integração de propostas pendente.",
    coachSelectedConfirmBesidePitch: "Treinador selecionado. Confirme a contratação junto ao campo.",
    sign: "Contratar",
    awaitingSigningConfirmation: "Aguardando confirmação da contratação.",
    qaMarketOpen: "Mercado aberto", qaRulesNotice: "Contrate dentro do seu orçamento e dos limites do elenco.", signingDestination: "Destino da contratação", waitForSquadConfirmation: "Aguarde a confirmação. Atualizar apenas consulta o elenco.", squadChangedChooseSlot: "O elenco mudou. Escolha a vaga novamente.",
    confirmCoach: "Confirmar treinador", coachPendingConfirmation: "Treinador selecionado, ainda não contratado. Confirme para descontar o valor e liberar a formação.", confirmingSigning: "Confirmando…", confirmSigning: "Confirmar contratação", cancelCoachSelection: "Cancelar seleção",
    refreshSquad: "Atualizar elenco", confirmPendingOperation: "Confirmar operação pendente", squadBalance: "Saldo do elenco", lowBalance: "Saldo baixo",
    pending: "Atualizando o saldo do clube.", unavailable: "Não foi possível atualizar o saldo. Atualize o elenco antes de contratar.",
    exhausted: "Seu saldo para contratações acabou", exceeded: "Saldo insuficiente para esta contratação",
    advice: "Revise o elenco ou compare os planos. Retirar um atleta da escalação não devolve créditos. Liberar um atleta exige a confirmação da multa rescisória.",
    reviewXI: "Revisar elenco", rule: "Seu plano prevê {budget} TC para contratações. Atletas e treinadores utilizam o saldo disponível do clube.",
    virtualBudgetSeparate: "O saldo do clube para contratações é separado do preço da assinatura.",
  },
  "es-ES": {
    pendingRecoveryUnavailable: "No se pudieron verificar las operaciones pendientes. Actualiza la plantilla para volver a intentarlo.",
    signingBudget: "Saldo para fichajes", lastConfirmedBalance: "Último saldo confirmado",
    savedFormationUnverified: "No se ha podido verificar la formación guardada.",
    incompatibleSquadAllocation: "Este cambio no conservaría las posiciones del banquillo y de la plantilla. Elige una posición compatible.",
    confirmCoachToUnlockFormation: "Confirma el fichaje del entrenador para desbloquear la selección de formación.",
    fullSquadRecruitmentUnavailable: "La contratación de la plantilla completa aún no está disponible.",
    outsideSlotsExchangeNotice: "15 plazas fuera de la convocatoria · Intercambios solo en la misma posición. Integración de propuestas pendiente.",
    coachSelectedConfirmBesidePitch: "Entrenador seleccionado. Confirma el fichaje junto al campo.",
    sign: "Fichar",
    awaitingSigningConfirmation: "Esperando la confirmación del fichaje.",
    qaMarketOpen: "Mercado abierto", qaRulesNotice: "Ficha dentro de tu presupuesto y los límites de la plantilla.", signingDestination: "Destino del fichaje", waitForSquadConfirmation: "Espera la confirmación. Actualizar solo consulta la plantilla.", squadChangedChooseSlot: "La plantilla ha cambiado. Elige la plaza de nuevo.",
    confirmCoach: "Confirmar entrenador", coachPendingConfirmation: "Entrenador seleccionado, aún no contratado. Confirma para descontar el coste y desbloquear la selección de formación.", confirmingSigning: "Confirmando…", confirmSigning: "Confirmar contratación", cancelCoachSelection: "Cancelar selección",
    refreshSquad: "Actualizar plantilla", confirmPendingOperation: "Confirmar operación pendiente", squadBalance: "Saldo de la plantilla", lowBalance: "Saldo bajo",
    pending: "Actualizando el saldo del club.", unavailable: "No se ha podido actualizar el saldo. Actualiza la plantilla antes de fichar.",
    exhausted: "Tu saldo para fichajes se ha agotado", exceeded: "Saldo insuficiente para este fichaje",
    advice: "Revisa la plantilla o compara planes. Quitar un jugador de la alineación no devuelve créditos. Liberar a un jugador requiere confirmar la penalización por rescisión.",
    reviewXI: "Revisar plantilla", rule: "Tu plan ofrece {budget} TC para fichajes. Jugadores y entrenadores utilizan el saldo disponible del club.",
    virtualBudgetSeparate: "El saldo del club para fichajes es independiente del precio de la suscripción.",
  },
  "it-IT": {
    pendingRecoveryUnavailable: "Impossibile verificare le operazioni in sospeso. Aggiorna la rosa per riprovare.",
    signingBudget: "Saldo per gli ingaggi", lastConfirmedBalance: "Ultimo saldo confermato",
    savedFormationUnverified: "Impossibile verificare la formazione salvata.",
    incompatibleSquadAllocation: "Questa modifica non manterrebbe le posizioni della panchina e della rosa. Scegli una posizione compatibile.",
    confirmCoachToUnlockFormation: "Conferma l'ingaggio dell'allenatore per sbloccare la scelta della formazione.",
    fullSquadRecruitmentUnavailable: "Gli ingaggi per la rosa completa non sono ancora disponibili.",
    outsideSlotsExchangeNotice: "15 posti fuori dai convocati · Scambi solo nella stessa posizione. Integrazione delle proposte in attesa.",
    coachSelectedConfirmBesidePitch: "Allenatore selezionato. Conferma l'ingaggio accanto al campo.",
    sign: "Ingaggia",
    awaitingSigningConfirmation: "In attesa della conferma dell'ingaggio.",
    qaMarketOpen: "Mercato aperto", qaRulesNotice: "Ingaggia rispettando il budget e i limiti della rosa.", signingDestination: "Destinazione dell'ingaggio", waitForSquadConfirmation: "Attendi la conferma. L'aggiornamento si limita a consultare i dati della rosa.", squadChangedChooseSlot: "La rosa è cambiata. Scegli di nuovo il posto.",
    confirmCoach: "Conferma allenatore", coachPendingConfirmation: "Allenatore selezionato, non ancora ingaggiato. Conferma per detrarre il costo e sbloccare la scelta della formazione.", confirmingSigning: "Conferma in corso…", confirmSigning: "Conferma ingaggio", cancelCoachSelection: "Annulla selezione",
    refreshSquad: "Aggiorna rosa", confirmPendingOperation: "Conferma operazione in sospeso", squadBalance: "Saldo della rosa", lowBalance: "Saldo basso",
    pending: "Aggiornamento del saldo del club.", unavailable: "Impossibile aggiornare il saldo. Aggiorna la rosa prima di un ingaggio.",
    exhausted: "Il saldo per gli ingaggi è esaurito", exceeded: "Saldo insufficiente per questo ingaggio",
    advice: "Rivedi la rosa o confronta i piani. Togliere un giocatore dalla formazione non restituisce crediti. Svincolare un giocatore richiede la conferma della penale di rescissione.",
    reviewXI: "Rivedi la rosa", rule: "Il tuo piano prevede {budget} TC per gli ingaggi. Giocatori e allenatori utilizzano il saldo disponibile del club.",
    virtualBudgetSeparate: "Il saldo del club per gli ingaggi è distinto dal prezzo dell'abbonamento.",
  },
  "fr-FR": {
    pendingRecoveryUnavailable: "Impossible de vérifier les opérations en attente. Actualisez l’effectif pour réessayer.",
    signingBudget: "Solde pour les recrutements", lastConfirmedBalance: "Dernier solde confirmé",
    savedFormationUnverified: "Impossible de vérifier la formation enregistrée.",
    incompatibleSquadAllocation: "Ce changement ne préserverait pas les postes du banc et de l'effectif. Choisissez un poste compatible.",
    confirmCoachToUnlockFormation: "Confirmez le recrutement de l'entraîneur pour débloquer le choix de la formation.",
    fullSquadRecruitmentUnavailable: "Le recrutement de l'effectif complet n'est pas encore disponible.",
    outsideSlotsExchangeNotice: "15 places hors du groupe de match · Échanges uniquement au même poste. Intégration des propositions en attente.",
    coachSelectedConfirmBesidePitch: "Entraîneur sélectionné. Confirmez le recrutement à côté du terrain.",
    sign: "Recruter",
    awaitingSigningConfirmation: "En attente de la confirmation du recrutement.",
    qaMarketOpen: "Marché ouvert", qaRulesNotice: "Recrutez dans les limites de votre budget et de votre effectif.", signingDestination: "Destination du recrutement", waitForSquadConfirmation: "Attendez la confirmation. L'actualisation consulte uniquement les données de l'effectif.", squadChangedChooseSlot: "L'effectif a changé. Choisissez à nouveau l'emplacement.",
    confirmCoach: "Confirmer l'entraîneur", coachPendingConfirmation: "Entraîneur sélectionné, pas encore recruté. Confirmez pour déduire le coût et débloquer le choix de la formation.", confirmingSigning: "Confirmation…", confirmSigning: "Confirmer le recrutement", cancelCoachSelection: "Annuler la sélection",
    refreshSquad: "Actualiser l'effectif", confirmPendingOperation: "Confirmer l'opération en attente", squadBalance: "Solde de l'effectif", lowBalance: "Solde faible",
    pending: "Mise à jour du solde du club.", unavailable: "Le solde n'a pas pu être actualisé. Actualisez l'effectif avant de recruter.",
    exhausted: "Votre solde pour les recrutements est épuisé", exceeded: "Solde insuffisant pour ce recrutement",
    advice: "Revoyez l'effectif ou comparez les offres. Retirer un joueur de la composition ne restitue pas de crédits. Libérer un joueur nécessite de confirmer l'indemnité de résiliation.",
    reviewXI: "Revoir l'effectif", rule: "Votre offre prévoit {budget} TC pour les recrutements. Joueurs et entraîneurs utilisent le solde disponible du club.",
    virtualBudgetSeparate: "Le solde du club pour les recrutements est distinct du prix de l'abonnement.",
  },
  "ar-SA": {
    pendingRecoveryUnavailable: "تعذر التحقق من العمليات المعلقة. حدّث قائمة الفريق للمحاولة مجددًا.",
    signingBudget: "رصيد التعاقدات", lastConfirmedBalance: "آخر رصيد مؤكد",
    savedFormationUnverified: "تعذّر التحقق من الخطة المحفوظة.",
    incompatibleSquadAllocation: "لن يحافظ هذا التغيير على مراكز البدلاء وقائمة الفريق. اختر مركزًا متوافقًا.",
    confirmCoachToUnlockFormation: "أكّد التعاقد مع المدرب لإتاحة اختيار الخطة.",
    fullSquadRecruitmentUnavailable: "التعاقدات لقائمة الفريق الكاملة غير متاحة بعد.",
    outsideSlotsExchangeNotice: "15 مكانًا خارج قائمة المباراة · التبادلات في المركز نفسه فقط. تكامل العروض قيد الانتظار.",
    coachSelectedConfirmBesidePitch: "تم اختيار المدرب. أكّد التعاقد بجانب الملعب.",
    sign: "تعاقد",
    awaitingSigningConfirmation: "بانتظار تأكيد التعاقد.",
    qaMarketOpen: "السوق مفتوح", qaRulesNotice: "تعاقد ضمن ميزانيتك وحدود قائمة الفريق.", signingDestination: "موضع التعاقد", waitForSquadConfirmation: "انتظر التأكيد. التحديث يستعلم عن قائمة الفريق فقط.", squadChangedChooseSlot: "تغيّرت قائمة الفريق. اختر الموضع مجددًا.",
    confirmCoach: "تأكيد المدرب", coachPendingConfirmation: "تم اختيار المدرب، ولم يتم التعاقد معه بعد. أكّد لخصم التكلفة وإتاحة اختيار الخطة.", confirmingSigning: "جارٍ التأكيد…", confirmSigning: "تأكيد التعاقد", cancelCoachSelection: "إلغاء الاختيار",
    refreshSquad: "تحديث قائمة الفريق", confirmPendingOperation: "تأكيد العملية المعلقة", squadBalance: "رصيد قائمة الفريق", lowBalance: "رصيد منخفض",
    pending: "جارٍ تحديث رصيد النادي.", unavailable: "تعذر تحديث الرصيد. حدّث قائمة الفريق قبل التعاقد.",
    exhausted: "نفد رصيد التعاقدات", exceeded: "الرصيد غير كافٍ لهذا التعاقد",
    advice: "راجع قائمة الفريق أو قارن الخطط. إخراج اللاعب من التشكيلة لا يعيد الرصيد. تسريح اللاعب يتطلب تأكيد غرامة فسخ العقد.",
    reviewXI: "مراجعة قائمة الفريق", rule: "تمنح خطتك {budget} TC للتعاقدات. تستخدم تعاقدات اللاعبين والمدربين رصيد النادي المتاح.",
    virtualBudgetSeparate: "رصيد تعاقدات النادي منفصل عن سعر الاشتراك.",
  },
  "tr-TR": {
    pendingRecoveryUnavailable: "Bekleyen işlemler doğrulanamadı. Tekrar denemek için kadroyu yenileyin.",
    signingBudget: "Transfer bakiyesi", lastConfirmedBalance: "Son doğrulanan bakiye",
    savedFormationUnverified: "Kaydedilen diziliş doğrulanamadı.",
    incompatibleSquadAllocation: "Bu değişiklik yedek kulübesi ve kadro pozisyonlarınızı korumaz. Uyumlu bir pozisyon seçin.",
    confirmCoachToUnlockFormation: "Diziliş seçimini açmak için teknik direktörle sözleşmeyi onaylayın.",
    fullSquadRecruitmentUnavailable: "Tam kadro için transferler henüz kullanılamıyor.",
    outsideSlotsExchangeNotice: "Maç kadrosu dışında 15 yer · Yalnızca aynı pozisyonda takas. Teklif entegrasyonu bekleniyor.",
    coachSelectedConfirmBesidePitch: "Teknik direktör seçildi. Sahanın yanında sözleşmeyi onaylayın.",
    sign: "Sözleşme imzala",
    awaitingSigningConfirmation: "Sözleşme onayı bekleniyor.",
    qaMarketOpen: "Transfer pazarı açık", qaRulesNotice: "Bütçeniz ve kadro sınırlarınız dahilinde transfer yapın.", signingDestination: "Transferin kadrodaki yeri", waitForSquadConfirmation: "Onayı bekleyin. Yenileme yalnızca kadroyu sorgular.", squadChangedChooseSlot: "Kadro değişti. Yeri yeniden seçin.",
    confirmCoach: "Teknik direktörü onayla", coachPendingConfirmation: "Teknik direktör seçildi, henüz sözleşme imzalanmadı. Bedelin düşülmesi ve diziliş seçiminin açılması için onaylayın.", confirmingSigning: "Onaylanıyor…", confirmSigning: "Transferi onayla", cancelCoachSelection: "Seçimi iptal et",
    refreshSquad: "Kadroyu yenile", confirmPendingOperation: "Bekleyen işlemi onayla", squadBalance: "Kadro bakiyesi", lowBalance: "Düşük bakiye",
    pending: "Kulüp bakiyesi güncelleniyor.", unavailable: "Bakiye güncellenemedi. Transfer yapmadan önce kadroyu yenileyin.",
    exhausted: "Transfer bakiyeniz tükendi", exceeded: "Bu transfer için bakiye yetersiz",
    advice: "Kadroyu gözden geçirin veya planları karşılaştırın. Oyuncuyu ilk 11'den çıkarmak kredi iadesi sağlamaz. Oyuncuyu serbest bırakmak için sözleşme fesih bedelini onaylamak gerekir.",
    reviewXI: "Kadroyu gözden geçir", rule: "Planınız transferler için {budget} TC sağlar. Oyuncular ve teknik direktörler kulübün kullanılabilir bakiyesini kullanır.",
    virtualBudgetSeparate: "Kulübün transfer bakiyesi abonelik ücretinden ayrıdır.",
  },
  "de-DE": {
    pendingRecoveryUnavailable: "Ausstehende Vorgänge konnten nicht geprüft werden. Aktualisiere den Kader, um es erneut zu versuchen.",
    signingBudget: "Guthaben für Verpflichtungen", lastConfirmedBalance: "Zuletzt bestätigtes Guthaben",
    savedFormationUnverified: "Die gespeicherte Formation konnte nicht überprüft werden.",
    incompatibleSquadAllocation: "Diese Änderung würde die Positionen auf der Bank und im Kader nicht beibehalten. Wähle eine passende Position.",
    confirmCoachToUnlockFormation: "Bestätige die Trainerverpflichtung, um die Formationsauswahl freizuschalten.",
    fullSquadRecruitmentUnavailable: "Verpflichtungen für den vollständigen Kader sind noch nicht verfügbar.",
    outsideSlotsExchangeNotice: "15 Plätze außerhalb des Spieltagskaders · Tausch nur auf derselben Position. Angebotsintegration ausstehend.",
    coachSelectedConfirmBesidePitch: "Trainer ausgewählt. Bestätige die Verpflichtung neben dem Spielfeld.",
    sign: "Verpflichten",
    awaitingSigningConfirmation: "Bestätigung der Verpflichtung ausstehend.",
    qaMarketOpen: "Transfermarkt geöffnet", qaRulesNotice: "Verpflichte Spieler innerhalb deines Budgets und der Kadergrenzen.", signingDestination: "Zielplatz der Verpflichtung", waitForSquadConfirmation: "Warte auf die Bestätigung. Aktualisieren liest nur die Kaderdaten.", squadChangedChooseSlot: "Der Kader hat sich geändert. Wähle den Platz erneut.",
    confirmCoach: "Trainer bestätigen", coachPendingConfirmation: "Trainer ausgewählt, aber noch nicht verpflichtet. Bestätige, um die Kosten abzuziehen und die Formationsauswahl freizuschalten.", confirmingSigning: "Wird bestätigt…", confirmSigning: "Verpflichtung bestätigen", cancelCoachSelection: "Auswahl abbrechen",
    refreshSquad: "Kader aktualisieren", confirmPendingOperation: "Ausstehenden Vorgang bestätigen", squadBalance: "Kaderguthaben", lowBalance: "Niedriges Guthaben",
    pending: "Das Vereinsguthaben wird aktualisiert.", unavailable: "Das Guthaben konnte nicht aktualisiert werden. Aktualisiere den Kader vor einer Verpflichtung.",
    exhausted: "Dein Guthaben für Verpflichtungen ist aufgebraucht", exceeded: "Unzureichendes Guthaben für diese Verpflichtung",
    advice: "Prüfe den Kader oder vergleiche die Pläne. Einen Spieler aus der Aufstellung zu nehmen erstattet keine Credits. Die Freigabe eines Spielers erfordert die Bestätigung der Vertragsauflösungsgebühr.",
    reviewXI: "Kader prüfen", rule: "Dein Plan bietet {budget} TC für Verpflichtungen. Spieler und Trainer nutzen das verfügbare Vereinsguthaben.",
    virtualBudgetSeparate: "Das Vereinsguthaben für Verpflichtungen ist vom Abonnementpreis getrennt.",
  },
};

export function getClubCollectionBudgetCopy(locale?: string | null, draftLocalesEnabled = false) {
  return TOUCHLINE_CLUB_COLLECTION_BUDGET_COPY[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function getTouchlineFantasyMarketBudgetCopy(locale?: string | null, draftLocalesEnabled = false, collectionEnabled = false) {
  const copy = TOUCHLINE_FANTASY_MARKET_BUDGET_COPY[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  if (!collectionEnabled) return copy;
  const { exhausted, exceeded, advice, reviewXI, rule } = getClubCollectionBudgetCopy(locale, draftLocalesEnabled);
  return { ...copy, exhausted, exceeded, advice, reviewXI, rule };
}

export function formatTouchlineFantasyBudgetAmount(value: number, locale: string, draftLocalesEnabled = false) {
  return Number.isFinite(value) && value >= 0
    ? new Intl.NumberFormat(resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled), { notation: "compact", maximumFractionDigits: 1 }).format(value).replace(/m$/, "M")
    : "—";
}
