"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validClubSeasonSession, type ClubSeasonPaymentMode } from "@/lib/stripe/club-season-payment-contract";
import controls from "./TouchlineGlobalNavigation.module.css";

type CheckoutStatus = "pending" | "paid" | "review" | "expired";
type Phase = CheckoutStatus | "delayed" | "unavailable" | "cancelled";
export type ClubSeasonCheckoutReturnProps = Readonly<{
  checkout: "processing" | "cancelled";
  sessionId?: string | null;
  locale: string;
  /** Trusted server presentation mode; URL parameters never select this value. */
  paymentMode?: ClubSeasonPaymentMode | null;
}>;

const MAX_CHECKS = 8;
const CHECK_INTERVAL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 8_000;
const copy = {
  pt: {
    label: "Confirmação do pagamento de teste", retry: "Verificar novamente", refresh: "Atualizar meu plano",
    pending: ["Confirmando pagamento de teste", "A confirmação pode levar alguns instantes. Não é necessário pagar novamente."],
    paid: ["Pagamento de teste confirmado", "Recebemos a confirmação da simulação. Consulte os dados atualizados do seu plano nesta página."],
    review: ["Pagamento de teste em análise", "Precisamos conferir esta operação antes de alterar seu acesso. Não faça outro pagamento enquanto isso."],
    expired: ["Sessão de pagamento de teste encerrada", "Esta sessão expirou. Confira seu plano antes de iniciar outra contratação."],
    delayed: ["A confirmação ainda não chegou", "Você pode verificar novamente. Evite iniciar outro pagamento enquanto esta operação estiver pendente."],
    unavailable: ["Não foi possível consultar o pagamento de teste", "Ainda não confirmamos o resultado desta simulação. Verifique novamente antes de fazer outro pagamento."],
    cancelled: ["Retorno do pagamento de teste", "Você voltou à TouchLine. Confira seu plano antes de tentar novamente; voltar a esta página não confirma nem cancela o pagamento de teste."],
  },
  en: {
    label: "Test payment confirmation", retry: "Check again", refresh: "Refresh my plan",
    pending: ["Confirming test payment", "Confirmation may take a few moments. You do not need to pay again."],
    paid: ["Test payment confirmed", "We received confirmation of the simulation. Check your updated plan details on this page."],
    review: ["Test payment under review", "We need to review this transaction before changing your access. Please do not make another payment meanwhile."],
    expired: ["Test payment session ended", "This session expired. Check your plan before starting another purchase."],
    delayed: ["Confirmation is still pending", "You can check again. Avoid starting another payment while this transaction is pending."],
    unavailable: ["Unable to check test payment", "We have not confirmed the outcome of this simulation. Check again before making another payment."],
    cancelled: ["Back from test payment", "You returned to TouchLine. Check your plan before trying again; returning to this page neither confirms nor cancels the test payment."],
  },
} as const;

const liveCopy = {
  pt: {
    ...copy.pt,
    label: "Confirmação do pagamento",
    pending: ["Confirmando pagamento", "A confirmação pode levar alguns instantes. Não é necessário pagar novamente."],
    paid: ["Pagamento confirmado", "Recebemos a confirmação do pagamento. Consulte os dados atualizados do seu plano nesta página."],
    review: ["Pagamento em análise", "Precisamos conferir esta operação antes de alterar seu acesso. Não faça outro pagamento enquanto isso."],
    expired: ["Sessão de pagamento encerrada", "Esta sessão expirou. Confira seu plano antes de iniciar outra contratação."],
    unavailable: ["Não foi possível consultar o pagamento", "Ainda não confirmamos o resultado desta operação. Verifique novamente antes de fazer outro pagamento."],
    cancelled: ["Retorno do pagamento", "Você voltou à TouchLine. Confira seu plano antes de tentar novamente; voltar a esta página não confirma nem cancela o pagamento."],
  },
  en: {
    ...copy.en,
    label: "Payment confirmation",
    pending: ["Confirming payment", "Confirmation may take a few moments. You do not need to pay again."],
    paid: ["Payment confirmed", "We received confirmation of the payment. Check your updated plan details on this page."],
    review: ["Payment under review", "We need to review this transaction before changing your access. Please do not make another payment meanwhile."],
    expired: ["Payment session ended", "This session expired. Check your plan before starting another purchase."],
    unavailable: ["Unable to check payment", "We have not confirmed the outcome of this transaction. Check again before making another payment."],
    cancelled: ["Back from payment", "You returned to TouchLine. Check your plan before trying again; returning to this page neither confirms nor cancels the payment."],
  },
} as const;

function validSession(value: string | null | undefined, mode: ClubSeasonPaymentMode | null): value is string {
  return mode !== null && validClubSeasonSession(value, mode);
}

function readStatus(value: unknown, mode: ClubSeasonPaymentMode | null): CheckoutStatus {
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== true || !("status" in value)
    || typeof value.status !== "string" || !["pending", "paid", "review", "expired"].includes(value.status)) throw new Error("PAYMENT_STATUS_UNAVAILABLE");
  if (mode === null || (mode === "live" && (!("paymentMode" in value) || value.paymentMode !== "live"))
    || (mode === "test" && "paymentMode" in value && value.paymentMode !== "test")) throw new Error("PAYMENT_STATUS_UNAVAILABLE");
  return value.status as CheckoutStatus;
}

/** A return URL is only a request to check the authenticated server ledger.
 * It never grants access or changes the wallet in the browser. */
export default function ClubSeasonCheckoutReturn({ checkout, sessionId, locale, paymentMode = "test" }: ClubSeasonCheckoutReturnProps) {
  const router = useRouter();
  const refreshedSessions = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${paymentMode ?? "unavailable"}:${checkout}:${sessionId ?? ""}`;
  const initialPhase = paymentMode === null ? "unavailable" : checkout === "cancelled" ? "cancelled" : "pending";
  const [state, setState] = useState<{ key: string; phase: Phase }>({ key: requestKey, phase: initialPhase });
  const phase = state.key === requestKey ? state.phase : initialPhase;
  const local = (paymentMode === "test" ? copy : liveCopy)[locale.startsWith("pt") ? "pt" : "en"];

  useEffect(() => {
    const setPhase = (value: Phase) => setState({ key: requestKey, phase: value });
    if (paymentMode === null) { setPhase("unavailable"); return; }
    if (checkout === "cancelled") { setPhase("cancelled"); return; }
    if (!validSession(sessionId, paymentMode)) { setPhase("unavailable"); return; }
    let active = true;
    let request: AbortController | null = null;
    let nextCheck: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    setPhase("pending");
    const check = async (number: number) => {
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      requestTimeout = timeout;
      try {
        const response = await fetch(`/api/touchline-fantasy/season-checkout/status?session_id=${encodeURIComponent(sessionId)}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("PAYMENT_STATUS_UNAVAILABLE");
        const status = readStatus(await response.json(), paymentMode);
        if (!active) return;
        if (controller.signal.aborted) { setPhase("unavailable"); return; }
        if (status === "pending") {
          if (number >= MAX_CHECKS) setPhase("delayed");
          else nextCheck = setTimeout(() => { void check(number + 1); }, CHECK_INTERVAL_MS);
          return;
        }
        setPhase(status);
        if (status === "paid" && !refreshedSessions.current.has(sessionId)) {
          refreshedSessions.current.add(sessionId);
          router.refresh();
        }
      } catch {
        if (active) setPhase("unavailable");
      } finally {
        clearTimeout(timeout);
        if (request === controller) request = null;
      }
    };
    void check(1);
    return () => { active = false; request?.abort(); clearTimeout(nextCheck); clearTimeout(requestTimeout); };
  }, [checkout, sessionId, paymentMode, requestKey, attempt, router]);

  const canRetry = checkout === "processing" && validSession(sessionId, paymentMode) && (phase === "delayed" || phase === "unavailable");
  return <section aria-label={local.label} data-season-checkout-return={phase} data-season-payment-mode={paymentMode ?? "unavailable"}
    style={{ display: "grid", gap: "0.75rem", padding: "1rem", maxWidth: "60rem", marginInline: "auto" }}>
    <div role="status" aria-live="polite" aria-atomic="true">
      <strong>{local[phase][0]}</strong>
      <p>{local[phase][1]}</p>
    </div>
    {canRetry ? <button type="button" className={controls.arena} onClick={() => { setState({ key: requestKey, phase: "pending" }); setAttempt(value => value + 1); }}>
      {local.retry}
    </button> : null}
    {phase === "expired" || phase === "cancelled" ? <button type="button" className={controls.arena} onClick={() => router.refresh()}>
      {local.refresh}
    </button> : null}
  </section>;
}
