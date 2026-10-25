import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";
import type { TouchLineLocale } from "../touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const rows = {
  releaseLabel: ["Release coach", "Liberar treinador", "Liberar entrenador", "Rilascia allenatore", "Libérer l’entraîneur", "إنهاء عقد المدرب", "Antrenörü serbest bırak", "Trainer freigeben"],
  contract: ["Contract termination", "Rescisão do contrato", "Rescisión del contrato", "Risoluzione del contratto", "Résiliation du contrat", "إنهاء العقد", "Sözleşme feshi", "Vertragsauflösung"],
  paid: ["Original signing value", "Valor pago na contratação", "Valor pagado al contratar", "Importo pagato all’ingaggio", "Montant payé au recrutement", "القيمة المدفوعة عند التعاقد", "Sözleşmede ödenen tutar", "Ursprünglich gezahlter Betrag"],
  fee: ["Contract termination fee", "Multa rescisória", "Penalización por rescisión", "Penale di risoluzione", "Indemnité de résiliation", "رسوم إنهاء العقد", "Sözleşme fesih bedeli", "Vertragsauflösungsgebühr"],
  refund: ["Credits returned to your club", "Crédito devolvido ao clube", "Créditos devueltos al club", "Crediti restituiti al club", "Crédits rendus au club", "الأرصدة المعادة إلى النادي", "Kulübe iade edilecek kredi", "An den Verein zurückerstattetes Guthaben"],
  balance: ["Club balance", "Saldo do clube", "Saldo del club", "Saldo del club", "Solde du club", "رصيد النادي", "Kulüp bakiyesi", "Vereinsguthaben"],
  confirmedBalance: ["Current confirmed balance", "Saldo atual confirmado", "Saldo actual confirmado", "Saldo attuale confermato", "Solde actuel confirmé", "الرصيد الحالي المؤكد", "Onaylanmış mevcut bakiye", "Aktuell bestätigtes Guthaben"],
  projectedBalance: ["Balance after release · projection", "Saldo após a liberação · previsão", "Saldo tras la liberación · previsión", "Saldo dopo il rilascio · previsione", "Solde après libération · estimation", "الرصيد بعد إنهاء العقد · تقدير", "Serbest bırakma sonrası bakiye · tahmin", "Guthaben nach Freigabe · Vorschau"],
  projectionNote: [
    "This projection does not change your balance. A refund requires a confirmed release.",
    "Esta previsão não altera seu saldo. A devolução depende de uma liberação confirmada.",
    "Esta previsión no cambia tu saldo. La devolución requiere una liberación confirmada.",
    "Questa previsione non modifica il saldo. Il rimborso richiede un rilascio confermato.",
    "Cette estimation ne modifie pas votre solde. Le remboursement nécessite une libération confirmée.",
    "هذا التقدير لا يغيّر رصيدك. تتطلب إعادة الأرصدة تأكيد إنهاء العقد.",
    "Bu tahmin bakiyenizi değiştirmez. İade için serbest bırakmanın onaylanması gerekir.",
    "Diese Vorschau ändert dein Guthaben nicht. Eine Erstattung erfordert eine bestätigte Freigabe.",
  ],
  squadNote: [
    "Releasing a coach would preserve your players and starting XI. A new coach would be required before confirming a competitive line-up.",
    "A liberação do treinador preservaria os jogadores e o XI titular. Seria necessário contratar outro treinador antes de confirmar uma escalação competitiva.",
    "Liberar al entrenador conservaría los jugadores y el once titular. Sería necesario contratar a otro entrenador antes de confirmar una alineación competitiva.",
    "Il rilascio dell’allenatore conserverebbe i giocatori e gli undici titolari. Servirebbe un nuovo allenatore prima di confermare una formazione competitiva.",
    "La libération de l’entraîneur préserverait les joueurs et le onze titulaire. Un nouvel entraîneur serait nécessaire avant de confirmer une composition compétitive.",
    "إنهاء عقد المدرب سيُبقي اللاعبين والتشكيلة الأساسية كما هم. سيلزم التعاقد مع مدرب آخر قبل تأكيد تشكيلة تنافسية.",
    "Antrenörün serbest bırakılması oyuncuları ve ilk 11’i korur. Rekabetçi bir kadroyu onaylamadan önce yeni bir antrenör gerekir.",
    "Eine Trainerfreigabe würde die Spieler und die Startelf erhalten. Vor der Bestätigung einer Wettbewerbsaufstellung wäre ein neuer Trainer erforderlich.",
  ],
  unavailable: [
    "Coach release is not yet available. No contract or balance has changed.",
    "A liberação do treinador ainda não está disponível. Nenhum contrato ou saldo foi alterado.",
    "La liberación del entrenador aún no está disponible. No se ha modificado ningún contrato ni saldo.",
    "Il rilascio dell’allenatore non è ancora disponibile. Nessun contratto o saldo è stato modificato.",
    "La libération de l’entraîneur n’est pas encore disponible. Aucun contrat ni solde n’a été modifié.",
    "إنهاء عقد المدرب غير متاح بعد. لم يتغير أي عقد أو رصيد.",
    "Antrenörü serbest bırakma henüz kullanılamıyor. Hiçbir sözleşme veya bakiye değişmedi.",
    "Die Trainerfreigabe ist noch nicht verfügbar. Kein Vertrag und kein Guthaben wurde geändert.",
  ],
  changed: [
    "Your squad changed. Close this review and reopen it to see the confirmed values.",
    "O elenco mudou. Feche esta revisão e abra novamente para consultar os valores confirmados.",
    "La plantilla cambió. Cierra esta revisión y vuelve a abrirla para ver los valores confirmados.",
    "La rosa è cambiata. Chiudi questa verifica e riaprila per vedere i valori confermati.",
    "L’effectif a changé. Fermez cette vérification et rouvrez-la pour voir les valeurs confirmées.",
    "تغيّرت قائمة الفريق. أغلق هذه المراجعة وافتحها مجددًا للاطلاع على القيم المؤكدة.",
    "Kadro değişti. Onaylanmış tutarları görmek için bu incelemeyi kapatıp yeniden açın.",
    "Der Kader hat sich geändert. Schließe diese Ansicht und öffne sie erneut, um die bestätigten Werte zu sehen.",
  ],
  keep: ["Keep coach", "Manter treinador", "Mantener entrenador", "Mantieni allenatore", "Garder l’entraîneur", "الإبقاء على المدرب", "Antrenörü tut", "Trainer behalten"],
  confirm: ["Confirm release", "Confirmar liberação", "Confirmar liberación", "Conferma rilascio", "Confirmer la libération", "تأكيد إنهاء العقد", "Serbest bırakmayı onayla", "Freigabe bestätigen"],
} as const satisfies Record<string, readonly [string, string, string, string, string, string, string, string]>;

export type CoachReleaseReviewCopy = Readonly<Record<keyof typeof rows, string>>;
const catalogues = Object.fromEntries(locales.map((locale, index) => [locale,
  Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]])),
])) as Record<TouchLineLocale, CoachReleaseReviewCopy>;

/** The caller supplies the page's resolved locale; this does not enable a site locale. */
export function getCoachReleaseReviewCopy(locale: string): CoachReleaseReviewCopy {
  return catalogues[resolveTouchlineCatalogueLocale(locale, true)];
}
