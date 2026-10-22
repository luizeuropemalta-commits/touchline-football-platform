import { resolveTouchlineCatalogueLocale } from '../touchlineArena/catalogue-locale.ts';
import type { TouchLineLocale } from '../touchlineArena/i18n.ts';

export const EXCHANGE_HUB_KEYS = ['unconfirmed', 'invalid', 'planUnavailable', 'incomplete', 'complete', 'negotiations', 'history', 'finances', 'centre', 'unavailable', 'close', 'interests', 'disconnected', 'organisation', 'waiting', 'signings', 'records', 'identityUnavailable', 'empty', 'historyUnavailable', 'financialPosition', 'availableBalance', 'squadValue', 'coachValue', 'valuationDisclaimer', 'income', 'statementUnavailable'] as const;
type Copy = Readonly<Record<typeof EXCHANGE_HUB_KEYS[number], string>>;
// Ordered presentation drafts. Exact key/row parity and placeholders are tested.
type StringTuple<T extends readonly unknown[]> = { readonly [K in keyof T]: string };
export const EXCHANGE_HUB_ROWS: Readonly<Record<TouchLineLocale, StringTuple<typeof EXCHANGE_HUB_KEYS>>> = {
  'en-GB': [
    'Wait for confirmed squad data before checking negotiation requirements.', 'Squad contracts must be verified before negotiating.', 'ClubOwner negotiations require an eligible paid plan.',
    'Squad: {owned}/{required}. Complete all {required} contracts in the original TouchLine Market to negotiate. After releasing a player, sign a replacement to restore your squad.',
    'Squad complete: {required} contracts. The proposal service remains unavailable; negotiations are not enabled.',
    'Negotiations', 'Transfer history', 'Club finances', 'Negotiation centre', 'Interests and proposals are currently unavailable. New negotiations cannot be verified.', 'Close', 'Interests and proposals',
    'Interests and proposals are not connected yet. Pending negotiations cannot currently be confirmed.', 'Negotiations will be organised by player, with the interested ClubOwner and terms before acceptance.', 'Waiting for confirmed club data. Estimated amounts will not be shown.',
    'TouchLine Market · Signings', 'Confirmed signing records for this season. Original amounts paid, not current market valuations.', 'Player · identity unavailable', 'No signing recorded in this collection.', 'Exchange and release history is not available in this view yet. This does not mean there are no transactions.',
    'Confirmed financial position', 'Available balance', 'Contracted squad value', 'Coach signing value', 'Squad value totals current players’ original contracts, excluding the coach. It is not available cash or a market valuation.', 'Income, expenditure and fees', 'The complete statement requires the financial history of signings, exchanges and releases. Unconfirmed totals are not displayed.',
  ],
  'pt-BR': [
    'Aguarde a confirmação do elenco antes de verificar os requisitos de negociação.', 'Os contratos do elenco precisam ser verificados antes de negociar.', 'A negociação entre ClubOwners exige um plano pago elegível.',
    'Elenco: {owned}/{required}. Complete os {required} contratos no mercado original TouchLine para negociar. Após rescindir, contrate um substituto para recompor o elenco.',
    'Elenco completo: {required} contratos. O serviço de propostas continua indisponível; isso não habilita negociações.',
    'Negociações', 'Histórico de transferências', 'Finanças do clube', 'Central de negociações', 'A consulta de interesses e propostas ainda está indisponível. Não é possível verificar novas negociações.', 'Fechar', 'Interesses e propostas',
    'A consulta de interesses e propostas ainda não está conectada. Não é possível confirmar se há negociações pendentes.', 'As negociações serão apresentadas por atleta, com o ClubOwner interessado e as condições antes do aceite.', 'Aguarde a confirmação dos dados do seu clube. Nenhum valor estimado será mostrado.',
    'Mercado TouchLine · Contratações', 'Registros de contratação confirmados nesta temporada. Valores originais pagos; não representam avaliação atual de mercado.', 'Atleta · identificação indisponível', 'Nenhuma contratação registrada nesta coleção.', 'Histórico de trocas e liberações ainda indisponível nesta consulta. Não será tratado como histórico vazio.',
    'Posição financeira confirmada', 'Saldo disponível', 'Valor do elenco contratado', 'Contratação do treinador', 'O valor do elenco soma os contratos dos atletas atuais, sem o treinador. Não é saldo disponível nem avaliação de mercado.', 'Receitas, despesas e taxas', 'O demonstrativo completo depende do histórico financeiro de contratações, trocas e liberações. Totais ainda não confirmados não são exibidos.',
  ],
  'es-ES': [
    'Espera a que se confirme la plantilla antes de comprobar los requisitos de negociación.', 'Los contratos de la plantilla deben verificarse antes de negociar.', 'Las negociaciones entre ClubOwners requieren un plan de pago elegible.',
    'Plantilla: {owned}/{required}. Completa los {required} contratos en el mercado original TouchLine para negociar. Tras rescindir un contrato, ficha un sustituto para completar la plantilla.',
    'Plantilla completa: {required} contratos. El servicio de propuestas sigue sin estar disponible; las negociaciones no están habilitadas.',
    'Negociaciones', 'Historial de transferencias', 'Finanzas del club', 'Centro de negociaciones', 'La consulta de intereses y propuestas no está disponible. No se pueden verificar nuevas negociaciones.', 'Cerrar', 'Intereses y propuestas',
    'La consulta de intereses y propuestas aún no está conectada. No se puede confirmar si hay negociaciones pendientes.', 'Las negociaciones se presentarán por jugador, con el ClubOwner interesado y las condiciones antes de aceptar.', 'Esperando la confirmación de los datos del club. No se mostrarán importes estimados.',
    'Mercado TouchLine · Fichajes', 'Registros de fichajes confirmados esta temporada. Importes originales pagados, no valoraciones actuales de mercado.', 'Jugador · identidad no disponible', 'No hay fichajes registrados en esta colección.', 'El historial de intercambios y rescisiones aún no está disponible en esta vista. Esto no significa que no haya transacciones.',
    'Situación financiera confirmada', 'Saldo disponible', 'Valor de la plantilla contratada', 'Valor del fichaje del entrenador', 'El valor de la plantilla suma los contratos originales de los jugadores actuales, sin el entrenador. No es saldo disponible ni una valoración de mercado.', 'Ingresos, gastos y tasas', 'El estado completo requiere el historial financiero de fichajes, intercambios y rescisiones. No se muestran totales sin confirmar.',
  ],
  'it-IT': [
    'Attendi la conferma della rosa prima di verificare i requisiti di negoziazione.', 'I contratti della rosa devono essere verificati prima di negoziare.', 'Le negoziazioni tra ClubOwner richiedono un piano a pagamento idoneo.',
    'Rosa: {owned}/{required}. Completa tutti i {required} contratti nel mercato originale TouchLine per negoziare. Dopo uno svincolo, ingaggia un sostituto per completare la rosa.',
    'Rosa completa: {required} contratti. Il servizio di proposte resta non disponibile; le negoziazioni non sono abilitate.',
    'Negoziazioni', 'Storico trasferimenti', 'Finanze del club', 'Centro negoziazioni', 'La consultazione di interessi e proposte non è disponibile. Non è possibile verificare nuove negoziazioni.', 'Chiudi', 'Interessi e proposte',
    'Interessi e proposte non sono ancora collegati. Non è possibile confermare eventuali negoziazioni in sospeso.', 'Le negoziazioni saranno presentate per giocatore, con il ClubOwner interessato e le condizioni prima di accettare.', 'In attesa di dati del club confermati. Non saranno mostrati importi stimati.',
    'Mercato TouchLine · Ingaggi', 'Registri degli ingaggi confermati in questa stagione. Importi originali pagati, non valutazioni di mercato attuali.', 'Giocatore · identità non disponibile', 'Nessun ingaggio registrato in questa collezione.', 'Lo storico di scambi e svincoli non è ancora disponibile in questa vista. Questo non significa che non vi siano transazioni.',
    'Situazione finanziaria confermata', 'Saldo disponibile', 'Valore della rosa ingaggiata', "Valore dell'ingaggio dell'allenatore", "Il valore della rosa somma i contratti originali dei giocatori attuali, escluso l'allenatore. Non è saldo disponibile né una valutazione di mercato.", 'Entrate, uscite e commissioni', 'Il rendiconto completo richiede lo storico finanziario di ingaggi, scambi e svincoli. I totali non confermati non vengono mostrati.',
  ],
  'fr-FR': [
    "Attendez la confirmation de l'effectif avant de vérifier les conditions de négociation.", "Les contrats de l'effectif doivent être vérifiés avant de négocier.", 'Les négociations entre ClubOwners nécessitent une offre payante éligible.',
    "Effectif : {owned}/{required}. Complétez les {required} contrats sur le marché original TouchLine pour négocier. Après une résiliation, recrutez un remplaçant pour compléter l'effectif.",
    'Effectif complet : {required} contrats. Le service de propositions reste indisponible ; les négociations ne sont pas activées.',
    'Négociations', 'Historique des transferts', 'Finances du club', 'Centre de négociations', 'La consultation des intérêts et propositions est indisponible. Les nouvelles négociations ne peuvent pas être vérifiées.', 'Fermer', 'Intérêts et propositions',
    "Les intérêts et propositions ne sont pas encore connectés. Les négociations en attente ne peuvent pas être confirmées.", "Les négociations seront présentées par joueur, avec le ClubOwner intéressé et les conditions avant l'acceptation.", 'En attente de données du club confirmées. Aucun montant estimé ne sera affiché.',
    'Marché TouchLine · Recrutements', 'Registres des recrutements confirmés cette saison. Montants originaux payés, pas des évaluations actuelles du marché.', 'Joueur · identité indisponible', 'Aucun recrutement enregistré dans cette collection.', "L'historique des échanges et résiliations n'est pas encore disponible dans cette vue. Cela ne signifie pas qu'il n'y a eu aucune transaction.",
    'Situation financière confirmée', 'Solde disponible', "Valeur de l'effectif recruté", "Valeur du recrutement de l'entraîneur", "La valeur de l'effectif additionne les contrats originaux des joueurs actuels, hors entraîneur. Ce n'est ni un solde disponible ni une évaluation du marché.", 'Recettes, dépenses et frais', "Le relevé complet nécessite l'historique financier des recrutements, échanges et résiliations. Les totaux non confirmés ne sont pas affichés.",
  ],
  'ar-SA': [
    'انتظر تأكيد قائمة الفريق قبل التحقق من متطلبات التفاوض.', 'يجب التحقق من عقود قائمة الفريق قبل التفاوض.', 'تتطلب المفاوضات بين ClubOwners باقة مدفوعة مؤهلة.',
    'قائمة الفريق: {owned}/{required}. أكمل العقود البالغ عددها {required} في سوق TouchLine الأصلي للتفاوض. بعد فسخ عقد لاعب، تعاقد مع بديل لاستكمال القائمة.',
    'القائمة مكتملة: {required} عقدًا. لا تزال خدمة العروض غير متاحة؛ المفاوضات غير مفعلة.',
    'المفاوضات', 'سجل الانتقالات', 'مالية النادي', 'مركز المفاوضات', 'عرض الاهتمامات والعروض غير متاح حاليًا. لا يمكن التحقق من مفاوضات جديدة.', 'إغلاق', 'الاهتمامات والعروض',
    'الاهتمامات والعروض غير متصلة بعد. لا يمكن تأكيد وجود مفاوضات معلقة حاليًا.', 'ستُعرض المفاوضات حسب اللاعب، مع ClubOwner المهتم والشروط قبل القبول.', 'بانتظار بيانات النادي المؤكدة. لن تُعرض مبالغ تقديرية.',
    'سوق TouchLine · التعاقدات', 'سجلات التعاقدات المؤكدة لهذا الموسم. المبالغ الأصلية المدفوعة، وليست التقييمات السوقية الحالية.', 'لاعب · الهوية غير متاحة', 'لا يوجد تعاقد مسجل في هذه المجموعة.', 'سجل التبادلات وفسخ العقود غير متاح في هذا العرض بعد. هذا لا يعني عدم وجود معاملات.',
    'المركز المالي المؤكد', 'الرصيد المتاح', 'قيمة عقود قائمة الفريق', 'قيمة التعاقد مع المدرب', 'قيمة القائمة هي مجموع العقود الأصلية للاعبين الحاليين دون المدرب. ليست رصيدًا متاحًا ولا تقييمًا سوقيًا.', 'الإيرادات والمصروفات والرسوم', 'يتطلب الكشف الكامل السجل المالي للتعاقدات والتبادلات وفسخ العقود. لا تُعرض الإجماليات غير المؤكدة.',
  ],
  'tr-TR': [
    'Müzakere şartlarını kontrol etmeden önce kadro verilerinin doğrulanmasını bekleyin.', 'Müzakereden önce kadro sözleşmeleri doğrulanmalıdır.', 'ClubOwner müzakereleri uygun bir ücretli plan gerektirir.',
    'Kadro: {owned}/{required}. Müzakere için orijinal TouchLine pazarında {required} sözleşmenin tamamını doldurun. Bir oyuncuyu serbest bıraktıktan sonra kadroyu tamamlamak için yerine birini transfer edin.',
    'Kadro tamamlandı: {required} sözleşme. Teklif hizmeti hâlâ kullanılamıyor; müzakereler etkin değil.',
    'Müzakereler', 'Transfer geçmişi', 'Kulüp mali durumu', 'Müzakere merkezi', 'İlgi ve teklifler şu anda görüntülenemiyor. Yeni müzakereler doğrulanamıyor.', 'Kapat', 'İlgi ve teklifler',
    'İlgi ve teklifler henüz bağlı değil. Bekleyen müzakereler şu anda doğrulanamıyor.', 'Müzakereler oyuncu bazında, ilgilenen ClubOwner ve kabul öncesi koşullarla sunulacaktır.', 'Doğrulanmış kulüp verileri bekleniyor. Tahmini tutarlar gösterilmeyecek.',
    'TouchLine Pazarı · Transferler', 'Bu sezonun doğrulanmış transfer kayıtları. Ödenen ilk tutarlardır, güncel piyasa değerleri değildir.', 'Oyuncu · kimlik mevcut değil', 'Bu koleksiyonda kayıtlı transfer yok.', 'Takas ve serbest bırakma geçmişi bu görünümde henüz mevcut değil. Bu, hiç işlem olmadığı anlamına gelmez.',
    'Doğrulanmış mali durum', 'Kullanılabilir bakiye', 'Sözleşmeli kadro değeri', 'Teknik direktör transfer bedeli', 'Kadro değeri, teknik direktör hariç mevcut oyuncuların ilk sözleşme bedellerinin toplamıdır. Kullanılabilir bakiye veya piyasa değeri değildir.', 'Gelirler, giderler ve ücretler', 'Tam döküm için transfer, takas ve serbest bırakmaların mali geçmişi gerekir. Doğrulanmamış toplamlar gösterilmez.',
  ],
  'de-DE': [
    'Warte auf bestätigte Kaderdaten, bevor du die Verhandlungsvoraussetzungen prüfst.', 'Die Kaderverträge müssen vor Verhandlungen überprüft werden.', 'Verhandlungen zwischen ClubOwners erfordern einen geeigneten kostenpflichtigen Plan.',
    'Kader: {owned}/{required}. Vervollständige alle {required} Verträge im ursprünglichen TouchLine-Markt, um zu verhandeln. Verpflichte nach einer Freigabe einen Ersatz, um den Kader wieder zu vervollständigen.',
    'Kader vollständig: {required} Verträge. Der Angebotsdienst bleibt nicht verfügbar; Verhandlungen sind nicht freigeschaltet.',
    'Verhandlungen', 'Transferverlauf', 'Vereinsfinanzen', 'Verhandlungszentrum', 'Interessen und Angebote sind derzeit nicht abrufbar. Neue Verhandlungen können nicht überprüft werden.', 'Schließen', 'Interessen und Angebote',
    'Interessen und Angebote sind noch nicht angebunden. Ausstehende Verhandlungen können derzeit nicht bestätigt werden.', 'Verhandlungen werden nach Spielern geordnet angezeigt, mit dem interessierten ClubOwner und den Bedingungen vor der Annahme.', 'Warte auf bestätigte Vereinsdaten. Geschätzte Beträge werden nicht angezeigt.',
    'TouchLine-Markt · Verpflichtungen', 'Bestätigte Verpflichtungen dieser Saison. Ursprünglich gezahlte Beträge, keine aktuellen Marktwerte.', 'Spieler · Identität nicht verfügbar', 'Keine Verpflichtung in dieser Sammlung erfasst.', 'Der Verlauf von Tauschgeschäften und Freigaben ist in dieser Ansicht noch nicht verfügbar. Dies bedeutet nicht, dass es keine Transaktionen gibt.',
    'Bestätigte Finanzlage', 'Verfügbares Guthaben', 'Wert des verpflichteten Kaders', 'Verpflichtungswert des Trainers', 'Der Kaderwert summiert die ursprünglichen Verträge der aktuellen Spieler ohne Trainer. Er ist weder verfügbares Guthaben noch eine Marktbewertung.', 'Einnahmen, Ausgaben und Gebühren', 'Die vollständige Übersicht erfordert den Finanzverlauf von Verpflichtungen, Tauschgeschäften und Freigaben. Unbestätigte Summen werden nicht angezeigt.',
  ],
};
const catalogues = Object.fromEntries(Object.entries(EXCHANGE_HUB_ROWS).map(([locale, values]) => [locale, Object.fromEntries(EXCHANGE_HUB_KEYS.map((key, index) => [key, values[index]]))])) as Record<TouchLineLocale, Copy>;
export function getExchangeHubCopy(locale: string, draftLocalesEnabled = false): Copy {
  return catalogues[locale.startsWith('pt') ? 'pt-BR' : resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}
export function formatExchangeReadinessCopy(template: string, owned: number, required: number) {
  return template.replaceAll('{owned}', String(owned)).replaceAll('{required}', String(required));
}
