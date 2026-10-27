"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
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

/** First-entry presentation only. No account, entitlement, wallet or payment mutations. */
export default function ClubOwnerPlanOnboarding(props: ClubOwnerPlanOnboardingProps) {
  // Unmounting the session resets navigation. Reopening never selects Beta or
  // resumes an earlier tier without a fresh deliberate choice.
  return props.open ? <PlanOnboardingSession {...props} /> : null;
}

function PlanOnboardingSession({ open, locale, draftLocalesEnabled = false, onDismiss, activePlanKey = null }: ClubOwnerPlanOnboardingProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef<Partial<Record<ClubOwnerOnboardingPlan, HTMLButtonElement | null>>>({});
  const previousPlan = useRef<ClubOwnerOnboardingPlan | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [plan, setPlan] = useState<ClubOwnerOnboardingPlan | null>(null);
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const local = copy[language];
  const hiring = hiringCopy[language];
  const labels = getClubOwnerPlanShowcaseCopy(locale, draftLocalesEnabled);
  const disclosure = getClubOwnerPlanDisclosure(locale, draftLocalesEnabled);
  const market = getTouchlineClubOwnerMarketCopy(locale, draftLocalesEnabled);
  const name = (key: ClubOwnerOnboardingPlan) => key === "beta" ? "Beta" : key === "standard" ? market.planStandard : key === "master" ? "Master" : "VIP";
  const price = (key: ClubOwnerOnboardingPlan) => key === "beta" ? labels.betaPrice : key === "standard" ? market.planStandardPrice : key === "master" ? labels.masterPrice : labels.vipPrice;
  const hiringAction = (key: ClubOwnerOnboardingPlan) => activePlanKey === key
    ? <p className={styles.note} data-current-plan-badge={key}>{hiring[1]}</p>
    : <div className={styles.selection}>
      <button type="button" className={controls.arena} disabled aria-describedby={`${id}-hiring-${key}`}>{hiring[0]}</button>
      <p id={`${id}-hiring-${key}`} className={styles.note}>{hiring[2]}</p>
    </div>;

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

  const dismiss = () => { setPlan(null); onDismiss(); };
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
