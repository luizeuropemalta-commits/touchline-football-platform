"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileSignature, LogOut } from "lucide-react";
import { TouchlineCoinMark } from "@/components/touchline/market/TouchlineMarketMarks";
import planStyles from "@/components/touchline/ClubOwnerPlanShowcase.module.css";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import type { ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { clubReleaseConfirmation } from "@/lib/touchlineFantasy/club-release";
import layout from "./ClubOwnerCollectionSlots.module.css";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import styles from "./ClubOwnerReleaseDialog.module.css";

/** Review never mutates. Freeze the quoted revision until the owner closes/reopens. */
export function ClubOwnerReleaseDialog({ state, playerId, playerName, card, locale, enabled, available, busy, pending, error, onClose, onConfirm }: {
  state: ClubAcquisitionState; playerId: string; playerName: string; locale: string;
  card?: ClubOwnerSquadCard;
  ownerName?: string;
  enabled: boolean; available: boolean; busy: boolean; pending: boolean; error: string | null;
  onClose: () => void; onConfirm: (playerId: string, revision: number) => Promise<boolean>;
}) {
  const [quote] = useState(() => clubReleaseConfirmation(state, playerId));
  const heading = useRef<HTMLHeadingElement>(null);
  const pt = locale.startsWith("pt");
  const title = pt ? "Rescisão de contrato" : "Contract termination";
  const changed = state.revision !== quote.revision || !state.players.some(player => player.playerId === quote.playerId);
  const mayConfirm = enabled && available && !busy && !pending && !changed;
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: `${title} · ${playerName}`, initialFocusRef: heading,
    onDismiss: () => { if (!busy) onClose(); } });
  useTouchlineDialogScrollLock(true);
  const credits = (value: number) => <span className={`${planStyles.marketPowerValue} ${styles.money}`} aria-label={`${value.toLocaleString(locale)} TC`}>
    <span aria-hidden="true" className={planStyles.coin}><TouchlineCoinMark size={18} /></span>
    <strong>{value.toLocaleString(locale)}</strong>{" "}<small>TC</small>
  </span>;
  const projectedBalance = state.balanceEur + quote.refund;
  const showProjection = !changed && Number.isSafeInteger(projectedBalance);
  const matchingCard = card && (card.canonicalPlayerId ?? card.id) === playerId ? card : null;
  return createPortal(<div className={`${layout.overlay} ${styles.fullscreenOverlay}`}><div {...dialogProps} className={styles.fullscreen}>
    <header className={styles.releaseHeader}>
      <LogOut size={26} aria-hidden="true" />
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
    </header>
    <div className={`${styles.review} ${styles.fullscreenReview}`} data-has-card={Boolean(matchingCard)}>
    {matchingCard ? <aside className={styles.athlete} aria-label={pt ? "Registro do atleta" : "Player record"}>
    <div className={styles.athleteCard} inert aria-label={playerName}>
      <TouchlineEliteExactCard player={squadCardToExactPlayer(matchingCard)} staticRenderScale={240 / 430}
        runtimeLocaleOverride={locale} hideMarketValuePanel={false} subscribeToRanking={false}
        enableInteractiveNeon={false} showCardActions={false} showProfileAction={false}
        showSocialMetrics={false} rankingMode="preview" forceNeonActive />
    </div>
    <div className={styles.contractRecord}>
      <FileSignature size={22} aria-hidden="true" />
      <h3>{playerName}</h3>

    </div>
    </aside> : null}
    <div className={styles.details}>
    <p className={styles.introduction}>{pt ? "Ao confirmar, o atleta deixa seu elenco e retorna ao mercado." : "On confirmation, the player leaves your squad and returns to the market."}</p>
    <section className={styles.financialSection} aria-label={title}>
    <dl className={`${styles.amounts} ${styles.financialAmounts}`}>
      <dt>{pt ? "Valor da contratação" : "Signing value"}</dt><dd>{credits(quote.paidCredits)}</dd>
      <dt>{pt ? "Multa rescisória" : "Termination fee"}<small>{quote.rate}%</small></dt><dd>{credits(quote.fee)}</dd>
      <dt data-refund>{pt ? "Retorno ao clube" : "Return to your club"}<small>90%</small></dt><dd data-refund>{credits(quote.refund)}</dd>
      <dt>{pt ? "Saldo atual confirmado" : "Current confirmed balance"}</dt><dd>{credits(state.balanceEur)}</dd>
      <dt>{pt ? "Saldo após a liberação · previsão" : "Balance after release · preview"}</dt><dd>{showProjection ? credits(projectedBalance) : "—"}</dd>
    </dl>
    <p className={styles.settlementNote}>{pt ? "Crédito disponível somente após a rescisão confirmada." : "Credits become available only after the release is confirmed."}</p>
    </section>
    </div></div>
    <footer className={styles.releaseFooter}>
    <div className={styles.safety}>
    {!available ? <p role="status">{pt ? "Prévia de rescisão. Confirmação indisponível; contrato e saldo preservados." : "Release preview. Confirmation unavailable; contract and balance remain unchanged."}</p> : null}
    {changed ? <p role="alert">{pt ? "O elenco mudou. Volte ao elenco e revise os valores antes de confirmar." : "Your squad changed. Return to your squad and review the values before confirming."}</p> : null}
    {pending ? <p role="status">{pt ? "A confirmação está pendente. Não inicie outra liberação; use Confirmar operação pendente no elenco." : "Confirmation is pending. Do not start another release; use Confirm pending operation in your squad."}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    </div>
    <div className={layout.pickerModes}>
      <button type="button" className={controls.link} disabled={busy} onClick={onClose}>{pending ? (pt ? "Voltar ao elenco" : "Back to squad") : (pt ? "Manter no elenco" : "Keep in squad")}</button>
      <button type="button" className={controls.link} disabled={!mayConfirm} onClick={async () => {
        if (mayConfirm && await onConfirm(quote.playerId, quote.revision)) onClose();
      }}>{busy ? (pt ? "Confirmando…" : "Confirming…") : (pt ? "Confirmar liberação" : "Confirm release")}</button>
    </div>
    </footer>
  </div></div>, document.body);
}
