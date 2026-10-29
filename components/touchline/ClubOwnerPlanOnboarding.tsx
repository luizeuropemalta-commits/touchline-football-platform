"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { checkoutDisplayAmount, requestClubSeasonCheckout, type ClubSeasonCheckoutOffers, type ClubSeasonCheckoutPlan } from "@/lib/stripe/club-season-checkout-client";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineClubOwnerMarketCopy } from "@/lib/touchlineArena/club-owner-market-i18n";
import { CLUB_OWNER_PLAN_PREVIEWS, getClubOwnerPlanBenefits, getClubOwnerPlanBenefitTerms, getClubOwnerPlanShowcaseCopy, getClubOwnerPlanDisclosure } from "@/lib/touchlineArena/club-owner-plan-showcase";
import { ClubOwnerPlanCard } from "./ClubOwnerPlanShowcase";
import cardStyles from "./ClubOwnerPlanShowcase.module.css";
import controls from "./TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerPlanOnboarding.module.css";

export type ClubOwnerOnboardingPlan = typeof CLUB_OWNER_PLAN_PREVIEWS[number]["id"];
export type ClubOwnerPlanOnboardingProps = Readonly<{
  open: boolean;
  locale: string;
  draftLocalesEnabled?: boolean;
  onDismiss: () => void;
  /** Validated active entitlement; exploration never changes this value. */
  activePlanKey?: ClubOwnerOnboardingPlan | "pro" | null;
  /** Legacy intent callback; deliberately not invoked without a connected checkout. */
  onSelect?: (plan: ClubOwnerOnboardingPlan) => void;
  /** Server-confirmed QA checkout capability; never a NEXT_PUBLIC feature flag. */
  checkoutEnabled?: boolean;
  /** Current same-season amounts computed from confirmed paid orders by server. */
  checkoutOffers?: ClubSeasonCheckoutOffers;
  selecting?: boolean;
  selectionError?: boolean;
}>;

const copy = {
  "en-GB": { back: "All plans", payment: "Payment unavailable", selection: "Selection is not payment or activation.", error: "Your selection could not be confirmed. Please try again.", pending: "Confirming selection…" },
  "pt-BR": { back: "Todos os planos", payment: "Pagamento indisponível", selection: "Escolher não significa pagar ou ativar o plano.", error: "Não foi possível confirmar sua escolha. Tente novamente.", pending: "Confirmando escolha…" },
  "es-ES": { back: "Todos los planes", payment: "Pago no disponible", selection: "Elegir no significa pagar ni activar el plan.", error: "No se pudo confirmar tu elección. Inténtalo de nuevo.", pending: "Confirmando elección…" },
  "it-IT": { back: "Tutti i piani", payment: "Pagamento non disponibile", selection: "La scelta non equivale al pagamento o all’attivazione.", error: "Impossibile confermare la scelta. Riprova.", pending: "Conferma della scelta…" },
  "fr-FR": { back: "Toutes les offres", payment: "Paiement indisponible", selection: "Choisir ne signifie ni payer ni activer l’offre.", error: "Votre choix n’a pas pu être confirmé. Réessayez.", pending: "Confirmation du choix…" },
  "ar-SA": { back: "كل الخطط", payment: "الدفع غير متاح", selection: "اختيار الخطة لا يعني الدفع أو التفعيل.", error: "تعذر تأكيد اختيارك. حاول مرة أخرى.", pending: "جارٍ تأكيد الاختيار…" },
  "tr-TR": { back: "Tüm planlar", payment: "Ödeme kullanılamıyor", selection: "Seçim, ödeme veya etkinleştirme anlamına gelmez.", error: "Seçiminiz onaylanamadı. Tekrar deneyin.", pending: "Seçim onaylanıyor…" },
  "de-DE": { back: "Alle Pläne", payment: "Zahlung nicht verfügbar", selection: "Die Auswahl ist keine Zahlung oder Aktivierung.", error: "Deine Auswahl konnte nicht bestätigt werden. Versuche es erneut.", pending: "Auswahl wird bestätigt…" },
} as const;

const hiringCopy = {
  "en-GB": ["Subscribe", "Your current plan", "Subscription unavailable: checkout is not connected."],
  "pt-BR": ["Contratar plano", "Seu plano atual", "Contratação indisponível: pagamento ainda não conectado."],
  "es-ES": ["Contratar plan", "Tu plan actual", "Contratación no disponible: pago aún no conectado."],
  "it-IT": ["Abbonati", "Il tuo piano attuale", "Abbonamento non disponibile: pagamento non ancora collegato."],
  "fr-FR": ["Souscrire", "Votre offre actuelle", "Souscription indisponible : paiement non connecté."],
  "ar-SA": ["الاشتراك", "خطتك الحالية", "الاشتراك غير متاح: الدفع غير متصل بعد."],
  "tr-TR": ["Abone ol", "Mevcut planınız", "Abonelik kullanılamıyor: ödeme henüz bağlı değil."],
  "de-DE": ["Abonnieren", "Dein aktueller Plan", "Abschluss nicht verfügbar: Zahlung noch nicht verbunden."],
} as const;

const checkoutCopy = {
  "en-GB": { action: "Continue to test checkout", pending: "Preparing test checkout…", due: "Due now · test", note: "Activation follows payment confirmation. Your club balance is not changed here.", error: "Checkout could not be opened. Check your plan before trying again." },
  "pt-BR": { action: "Continuar para pagamento de teste", pending: "Preparando pagamento de teste…", due: "A pagar agora · teste", note: "A ativação depende da confirmação do pagamento. O saldo do clube não é alterado aqui.", error: "Não foi possível abrir o pagamento. Confira seu plano antes de tentar novamente." },
  "es-ES": { action: "Continuar al pago de prueba", pending: "Preparando el pago de prueba…", due: "A pagar ahora · prueba", note: "La activación depende de confirmar el pago. El saldo del club no cambia aquí.", error: "No se pudo abrir el pago. Revisa tu plan antes de intentarlo de nuevo." },
  "it-IT": { action: "Continua al pagamento di prova", pending: "Preparazione del pagamento di prova…", due: "Da pagare ora · prova", note: "L’attivazione richiede la conferma del pagamento. Il saldo del club non cambia qui.", error: "Impossibile aprire il pagamento. Controlla il tuo piano prima di riprovare." },
  "fr-FR": { action: "Continuer au paiement de test", pending: "Préparation du paiement de test…", due: "À payer maintenant · test", note: "L’activation dépend de la confirmation du paiement. Le solde du club ne change pas ici.", error: "Impossible d’ouvrir le paiement. Vérifiez votre offre avant de réessayer." },
  "ar-SA": { action: "المتابعة إلى الدفع التجريبي", pending: "جارٍ تجهيز الدفع التجريبي…", due: "المبلغ المستحق الآن · تجريبي", note: "يتوقف التفعيل على تأكيد الدفع. لا يتغير رصيد النادي هنا.", error: "تعذر فتح الدفع. تحقق من خطتك قبل المحاولة مرة أخرى." },
  "tr-TR": { action: "Test ödemesine devam et", pending: "Test ödemesi hazırlanıyor…", due: "Şimdi ödenecek · test", note: "Etkinleştirme ödeme onayına bağlıdır. Kulüp bakiyesi burada değişmez.", error: "Ödeme açılamadı. Tekrar denemeden önce planınızı kontrol edin." },
  "de-DE": { action: "Weiter zur Testzahlung", pending: "Testzahlung wird vorbereitet…", due: "Jetzt fällig · Test", note: "Die Aktivierung erfolgt nach Zahlungsbestätigung. Das Vereinsguthaben wird hier nicht geändert.", error: "Die Zahlung konnte nicht geöffnet werden. Prüfe deinen Plan, bevor du es erneut versuchst." },
} as const;

/** Checkout navigation only. Payment confirmation and activation belong to the server. */
export default function ClubOwnerPlanOnboarding(props: ClubOwnerPlanOnboardingProps) {
  // Unmounting the session resets navigation. Reopening never selects Beta or
  // resumes an earlier tier without a fresh deliberate choice.
  return props.open ? <PlanOnboardingSession {...props} /> : null;
}

function PlanOnboardingSession({ open, locale, draftLocalesEnabled = false, onDismiss, activePlanKey = null, checkoutEnabled = false, checkoutOffers }: ClubOwnerPlanOnboardingProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef<Partial<Record<ClubOwnerOnboardingPlan, HTMLButtonElement | null>>>({});
  const previousPlan = useRef<ClubOwnerOnboardingPlan | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const [pendingPlan, setPendingPlan] = useState<ClubSeasonCheckoutPlan | null>(null);
  const [checkoutError, setCheckoutError] = useState<ClubSeasonCheckoutPlan | null>(null);
  const [plan, setPlan] = useState<ClubOwnerOnboardingPlan | null>(null);
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const local = copy[language];
  const hiring = hiringCopy[language];
  const payment = checkoutCopy[language];
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const disclosure = getClubOwnerPlanDisclosure(locale, draftLocalesEnabled);
  const market = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const name = (key: ClubOwnerOnboardingPlan) => key === "beta" ? "Beta" : key === "standard" ? market.planStandard : key === "master" ? "Master" : "VIP";
  const price = (key: ClubOwnerOnboardingPlan) => key === "beta" ? labels.betaPrice : key === "standard" ? market.planStandardPrice : key === "master" ? labels.masterPrice : labels.vipPrice;
  const startCheckout = async (key: ClubSeasonCheckoutPlan) => {
    const expectedAmountMinor = checkoutDisplayAmount(checkoutOffers, key);
    if (!checkoutEnabled || expectedAmountMinor === null || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setCheckoutError(null);
    setPendingPlan(key);
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const url = await requestClubSeasonCheckout(key, expectedAmountMinor, controller.signal);
      if (request.current === controller && !controller.signal.aborted) window.location.assign(url);
    } catch {
      if (request.current === controller) setCheckoutError(key);
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setPendingPlan(null); }
    }
  };
  const hiringAction = (key: ClubOwnerOnboardingPlan) => {
    if (activePlanKey === key) return <p className={styles.note} data-current-plan-badge={key}>{hiring[1]}</p>;
    const amount = checkoutDisplayAmount(checkoutOffers, key);
    const available = checkoutEnabled && key !== "beta" && amount !== null;
    return <div className={styles.selection}>
      {available ? <p className={styles.note} data-checkout-quote={key}>{payment.due}: <strong>{new Intl.NumberFormat(language, { style: "currency", currency: "EUR" }).format(amount / 100)}</strong></p> : null}
      <button type="button" className={controls.arena} disabled={!available || pendingPlan !== null}
        aria-busy={pendingPlan === key} aria-describedby={`${id}-hiring-${key}`}
        onClick={available ? () => { void startCheckout(key as ClubSeasonCheckoutPlan); } : undefined}>
        {pendingPlan === key ? payment.pending : available ? payment.action : hiring[0]}
      </button>
      <p id={`${id}-hiring-${key}`} className={styles.note} role="status">{pendingPlan === key ? payment.pending : available ? payment.note : hiring[2]}</p>
      {checkoutError === key ? <p className={styles.note} role="alert">{payment.error}</p> : null}
    </div>;
  };

  useLayoutEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The server already renders a full-viewport open dialog. Upgrade it to the
    // native top layer before paint; no compact modal or uncovered loading frame.
    if (!node.matches(":modal")) { if (node.open) node.close(); node.showModal(); }
    heading.current?.focus();
    return () => { if (node.open) node.close(); previousFocus.current?.focus(); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    if (plan === null && previousPlan.current) cards.current[previousPlan.current]?.focus();
    else heading.current?.focus();
    previousPlan.current = plan;
    dialog.current?.scrollTo({ top: 0 });
  }, [open, plan]);

  const dismiss = () => { request.current?.abort(); request.current = null; setPlan(null); onDismiss(); };
  if (!open) return null;
  return <dialog open ref={dialog} className={styles.dialog} aria-modal="true" aria-labelledby={`${id}-heading`} onCancel={event => { event.preventDefault(); dismiss(); }} data-plan-onboarding="true" data-plan-preview={plan ?? "all"} dir={language === "ar-SA" ? "rtl" : "ltr"}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>TouchLine / ClubOwner</span><h2 id={`${id}-heading`} ref={heading} tabIndex={-1}>{plan ? name(plan) : labels.browse}</h2></div>
        <div className={styles.actions}>
          {plan ? <button type="button" className={controls.link} onClick={() => setPlan(null)}><ArrowLeft size={16} aria-hidden="true" />{local.back}</button> : null}
          <button type="button" className={`${controls.link} ${styles.close}`} aria-label={labels.close} onClick={dismiss}><X size={18} aria-hidden="true" /></button>
        </div>
      </header>
      {plan === null ? <div className={styles.gallery} data-plan-gallery="true">
        {CLUB_OWNER_PLAN_PREVIEWS.map(item => <article key={item.id} className={`${cardStyles.planShowcase} ${styles.offer}`} data-plan-preview={item.id}>
          <button type="button" className={`${controls.link} ${cardStyles.panelCardButton}`} aria-label={`${labels.details}: ${name(item.id)}`} onClick={() => setPlan(item.id)}><ClubOwnerPlanCard tier={item.id} locale={locale} draftLocalesEnabled={draftLocalesEnabled} /></button>
          <div className={styles.offerPrice}><span>{labels.seasonalPrice}</span><strong>{price(item.id)}</strong></div>
          <button ref={node => { cards.current[item.id] = node; }} type="button" className={controls.link} aria-label={`${disclosure.viewBenefits}: ${name(item.id)}`} onClick={() => setPlan(item.id)}>{disclosure.viewBenefits}<ChevronRight size={14} aria-hidden="true" /></button>
          {hiringAction(item.id)}
        </article>)}
      </div> : <div className={styles.details} data-plan-detail={plan}>
        <div className={styles.cardColumn}><ClubOwnerPlanCard tier={plan} locale={locale} draftLocalesEnabled={draftLocalesEnabled} /><span className={styles.eyebrow}>{labels.seasonalPrice}</span><strong className={styles.price}>{price(plan)}</strong></div>
        <div className={styles.benefitsColumn}>
          <h3>{disclosure.viewBenefits}</h3>
          <p className={styles.note}>{plan === "beta" ? disclosure.betaSquad : disclosure.squad}</p>
          <p className={styles.note}>{disclosure.status}</p>
          <dl className={styles.benefits}>{getClubOwnerPlanBenefits(plan, locale, draftLocalesEnabled).map(benefit => <div key={benefit.label}><dt>{benefit.label}</dt><dd>{benefit.value}</dd></div>)}</dl>
          {plan !== "beta" ? <p className={styles.note}>{getClubOwnerPlanBenefitTerms(locale, draftLocalesEnabled)}</p> : null}
          {hiringAction(plan)}
        </div>
      </div>}
    </div>
  </dialog>;
}
