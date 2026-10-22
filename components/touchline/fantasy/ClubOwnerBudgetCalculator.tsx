"use client";

import { clubBudgetEstimate } from "@/lib/touchlineFantasy/club-budget-calculator";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { useConfirmedClubCollection } from "./ClubCollectionContext";
import styles from "./ClubOwnerFinance.module.css";

export default function ClubOwnerBudgetCalculator({ locale, draftLocalesEnabled = false }: { locale: string; draftLocalesEnabled?: boolean }) {
  const { state, verificationStatus } = useConfirmedClubCollection();
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  // Exact integers, not compact rounded figures presented as spendable funds.
  const copy = {
    "pt-BR": ["Aguardando confirmação do saldo e das vagas.", "Saldo e vagas indisponíveis para calcular a média.", "Contrate o treinador para calcular a média por jogador.", "Elenco completo", "vaga", "vagas", "disponíveis", "Média", "por jogador"],
    "en-GB": ["Waiting for confirmed balance and squad places.", "Balance and squad places unavailable for this estimate.", "Sign your coach to calculate the average per player.", "Squad complete", "place", "places", "available", "Average", "per player"],
    "es-ES": ["Esperando confirmar saldo y plazas.", "Saldo y plazas no disponibles para calcular la media.", "Contrata al entrenador para calcular la media por jugador.", "Plantilla completa", "plaza", "plazas", "disponibles", "Media", "por jugador"],
    "it-IT": ["In attesa di conferma di saldo e posti.", "Saldo e posti non disponibili per la media.", "Ingaggia l’allenatore per calcolare la media per giocatore.", "Rosa completa", "posto", "posti", "disponibili", "Media", "per giocatore"],
    "fr-FR": ["En attente du solde et des places confirmés.", "Solde et places indisponibles pour cette moyenne.", "Recrutez l’entraîneur pour calculer la moyenne par joueur.", "Effectif complet", "place", "places", "disponibles", "Moyenne", "par joueur"],
    "ar-SA": ["بانتظار تأكيد الرصيد والمراكز.", "الرصيد والمراكز غير متاحين لحساب المتوسط.", "تعاقد مع المدرب لحساب المتوسط لكل لاعب.", "الفريق مكتمل", "مركز", "مراكز", "متاحة", "المتوسط", "لكل لاعب"],
    "tr-TR": ["Bakiye ve kontenjan onayı bekleniyor.", "Ortalama için bakiye ve kontenjan bilgisi yok.", "Oyuncu başına ortalama için teknik direktörle anlaşın.", "Kadro tamam", "yer", "yer", "kullanılabilir", "Ortalama", "oyuncu başına"],
    "de-DE": ["Bestätigung von Guthaben und Plätzen ausstehend.", "Guthaben und Plätze für den Durchschnitt nicht verfügbar.", "Verpflichte den Trainer, um den Durchschnitt pro Spieler zu berechnen.", "Kader vollständig", "Platz", "Plätze", "verfügbar", "Durchschnitt", "pro Spieler"],
  }[language];
  const estimate = clubBudgetEstimate(state);
  const credits = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
  let message: string;
  if (verificationStatus !== "confirmed") {
    message = verificationStatus === "pending" ? copy[0] : copy[1];
  } else if (!state) {
    message = copy[2];
  } else if (!estimate) {
    message = copy[1];
  } else {
    message = estimate.vacancies === 0
      ? `${copy[3]} · ${credits(estimate.balance)} TC ${copy[6]}`
      : `${credits(estimate.vacancies)} ${estimate.vacancies === 1 ? copy[4] : copy[5]} · ${credits(estimate.balance)} TC ${copy[6]} · ${copy[7]} ${credits(estimate.average!)} TC ${copy[8]}`;
  }
  const metricCopy = {
    "pt-BR": ["Saldo disponível", "Média por vaga", "Vagas restantes", "Referência aritmética; não garante a contratação do elenco."],
    "en-GB": ["Available balance", "Average per place", "Places remaining", "Arithmetic reference; does not guarantee squad affordability."],
    "es-ES": ["Saldo disponible", "Media por plaza", "Plazas restantes", "Referencia aritmética; no garantiza completar la plantilla."],
    "it-IT": ["Saldo disponibile", "Media per posto", "Posti rimanenti", "Riferimento aritmetico; non garantisce di completare la rosa."],
    "fr-FR": ["Solde disponible", "Moyenne par place", "Places restantes", "Référence arithmétique ; ne garantit pas de compléter l’effectif."],
    "ar-SA": ["الرصيد المتاح", "المتوسط لكل مركز", "المراكز المتبقية", "مرجع حسابي؛ لا يضمن كفاية الرصيد لإكمال الفريق."],
    "tr-TR": ["Kullanılabilir bakiye", "Yer başına ortalama", "Kalan yerler", "Aritmetik referans; kadroyu tamamlamayı garanti etmez."],
    "de-DE": ["Verfügbares Guthaben", "Durchschnitt pro Platz", "Verbleibende Plätze", "Rechnerischer Richtwert; garantiert keine finanzierbare Komplettierung."],
  }[language];
  const confirmed = verificationStatus === "confirmed" && state && estimate;
  // No current catalogue adapter proves completeness and freshness. Never
  // translate the arithmetic average or a filtered catalogue into affordability.
  const guidance = {
    "pt-BR": "Conclusão do elenco: indeterminada. O catálogo completo e verificado ainda não foi confirmado. A média por vaga não é um limite de preço; não é possível confirmar se o saldo cobre todas as posições restantes.",
    "en-GB": "Squad completion: undetermined. A complete, verified catalogue has not been confirmed. The average per place is not a price limit; whether the balance covers every remaining position cannot be confirmed.",
    "es-ES": "Completar la plantilla: indeterminado. No se ha confirmado un catálogo completo y verificado. La media por plaza no es un límite de precio; no se puede confirmar si el saldo cubre todas las posiciones restantes.",
    "it-IT": "Completamento della rosa: indeterminato. Il catalogo completo e verificato non è stato confermato. La media per posto non è un limite di prezzo; non è possibile confermare se il saldo copre tutte le posizioni rimanenti.",
    "fr-FR": "Effectif complet : faisabilité indéterminée. Aucun catalogue complet et vérifié n’est confirmé. La moyenne par place n’est pas un plafond de prix ; la couverture de tous les postes restants par le solde ne peut être confirmée.",
    "ar-SA": "إكمال الفريق: غير محدد. لم يتم تأكيد كتالوج كامل وموثّق. المتوسط لكل مركز ليس حدًا للسعر؛ لا يمكن تأكيد أن الرصيد يغطي جميع المراكز المتبقية.",
    "tr-TR": "Kadroyu tamamlama: belirsiz. Eksiksiz ve doğrulanmış katalog henüz onaylanmadı. Yer başına ortalama bir fiyat sınırı değildir; bakiyenin kalan tüm pozisyonları karşılayacağı doğrulanamıyor.",
    "de-DE": "Kadervervollständigung: unbestimmt. Ein vollständiger, verifizierter Katalog ist nicht bestätigt. Der Durchschnitt pro Platz ist keine Preisgrenze; ob das Guthaben alle verbleibenden Positionen abdeckt, ist nicht bestätigt.",
  }[language];
  return <div className={styles.budget} role="status" aria-live="polite" aria-atomic="true" data-club-budget-calculator="true">
    {confirmed ? <>
      <dl className={styles.metrics}>
        <div className={styles.primary}><dt>{metricCopy[0]}</dt><dd>{credits(estimate.balance)} <small>TC</small></dd></div>
        <div><dt>{metricCopy[1]}</dt><dd>{estimate.average === null ? "—" : <>{credits(estimate.average)} <small>TC</small></>}</dd></div>
        <div><dt>{metricCopy[2]}</dt><dd>{credits(estimate.vacancies)}<small> / 35</small></dd></div>
      </dl>
      <p className={styles.note}>{estimate.vacancies === 0 ? `${copy[3]}. ` : ""}{metricCopy[3]}</p>
      {estimate.vacancies > 0 ? <p className={styles.note} data-budget-affordability="indeterminate">{guidance}</p> : null}
    </> : <p className={styles.status}>{message}</p>}
  </div>;
}
