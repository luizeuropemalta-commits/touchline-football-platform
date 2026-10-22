"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import type { ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { clubReleaseConfirmation } from "@/lib/touchlineFantasy/club-release";
import layout from "./ClubOwnerCollectionSlots.module.css";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import styles from "./ClubOwnerReleaseDialog.module.css";

/** Review never mutates. Freeze the quoted revision until the owner closes/reopens. */
export function ClubOwnerReleaseDialog({ state, playerId, playerName, card, ownerName, locale, enabled, available, busy, pending, error, onClose, onConfirm }: {
  state: ClubAcquisitionState; playerId: string; playerName: string; locale: string;
  card?: ClubOwnerSquadCard;
  ownerName?: string;
  enabled: boolean; available: boolean; busy: boolean; pending: boolean; error: string | null;
  onClose: () => void; onConfirm: (playerId: string, revision: number) => Promise<boolean>;
}) {
  const [quote] = useState(() => clubReleaseConfirmation(state, playerId));
  const heading = useRef<HTMLHeadingElement>(null);
  const pt = locale.startsWith("pt");
  const title = pt ? "Liberar jogador" : "Release player";
  const changed = state.revision !== quote.revision || !state.players.some(player => player.playerId === quote.playerId);
  const mayConfirm = enabled && available && !busy && !pending && !changed;
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: `${title} · ${playerName}`, initialFocusRef: heading,
    onDismiss: () => { if (!busy) onClose(); } });
  useTouchlineDialogScrollLock(true);
  const credits = (value: number) => `${value.toLocaleString(locale)} TC`;
  const projectedBalance = state.balanceEur + quote.refund;
  const showProjection = !changed && Number.isSafeInteger(projectedBalance);
  const matchingCard = card && (card.canonicalPlayerId ?? card.id) === playerId ? card : null;
  const contractedSquadValue = state.players.reduce((total, player) => total + player.valueEur, 0);
  const validSquadValue = state.players.every(player => Number.isSafeInteger(player.valueEur) && player.valueEur > 0)
    && Number.isSafeInteger(contractedSquadValue);
  return createPortal(<div className={layout.overlay}><div {...dialogProps} className={`${layout.dialog} ${styles.dialog}`}>
    <h2 ref={heading} tabIndex={-1}>{title} · {playerName}</h2>
    <div className={styles.review} data-has-card={Boolean(matchingCard)}>
    {matchingCard ? <div className={styles.card} inert aria-label={playerName}>
      <TouchlineEliteExactCard player={squadCardToExactPlayer(matchingCard)} staticRenderScale={200 / 430}
        runtimeLocaleOverride={locale} hideMarketValuePanel={false} subscribeToRanking={false}
        enableInteractiveNeon={false} showCardActions={false} showProfileAction={false}
        showSocialMetrics={false} rankingMode="preview" forceNeonActive />
    </div> : null}
    <div className={styles.details}>
    <section className={styles.section} aria-label={pt ? "Seu clube" : "Your club"}>
    <h3>{pt ? "Seu clube" : "Your club"}</h3>
    {ownerName?.trim() ? <p className={styles.owner}>ClubOwner · {ownerName.trim()}</p> : null}
    <dl className={styles.amounts}>
      <dt>{pt ? "Valor do elenco contratado" : "Contracted squad value"}</dt><dd>{validSquadValue ? credits(contractedSquadValue) : "—"}</dd>
    </dl>
    <p className={styles.note}>{pt ? "Valores originais pagos pelos atletas, sem o treinador. Não é saldo disponível nem avaliação atual de mercado." : "Original amounts paid for players, excluding the coach. Neither available balance nor a current market valuation."}</p>
    </section>
    <section className={styles.section} aria-label={pt ? "Rescisão do contrato" : "Contract termination"}>
    <h3>{pt ? "Rescisão do contrato" : "Contract termination"}</h3>
    <p className={styles.note}>{pt ? "O atleta deixará o elenco e voltará ao mercado. Esta ação não é uma retirada da escalação nem uma troca entre clubes." : "The player will leave your squad and return to the market. This is not a line-up change or an exchange between clubs."}</p>
    <dl className={styles.amounts}>
      <dt>{pt ? "Valor pago na contratação" : "Original signing value"}</dt><dd>{credits(quote.paidCredits)}</dd>
      <dt>{pt ? "Multa rescisória" : "Contract termination fee"} · {quote.rate}%</dt><dd>{credits(quote.fee)}</dd>
      <dt>{pt ? "Crédito devolvido ao clube" : "Credits returned to your club"} · 90%</dt><dd>{credits(quote.refund)}</dd>
    </dl>
    <p className={styles.note}>{pt ? "A taxa de negociação entre ClubOwners é separada e não muda nesta liberação." : "The ClubOwner exchange fee is separate and is not changed by this release."}</p>
    </section>
    <section className={styles.section} aria-label={pt ? "Saldo do clube" : "Club balance"}>
    <h3>{pt ? "Saldo do clube" : "Club balance"}</h3>
    <dl className={styles.amounts}>
      <dt>{pt ? "Saldo atual confirmado" : "Current confirmed balance"}</dt><dd>{credits(state.balanceEur)}</dd>
      <dt>{pt ? "Saldo após a liberação · previsão" : "Balance after release · preview"}</dt><dd>{showProjection ? credits(projectedBalance) : "—"}</dd>
    </dl>
    <p className={styles.note}>{pt ? "A previsão não altera seu saldo. A devolução só será creditada após a confirmação da liberação pelo servidor." : "This preview does not change your balance. Credits are returned only after the server confirms the release."}</p>
    </section>
    </div></div>
    <div className={styles.safety}>
    {!available ? <p role="status">{pt ? "Liberação em validação. Nenhum contrato ou saldo será alterado nesta tela enquanto a operação não estiver disponível." : "Release is being validated. This screen cannot change contracts or balance until the operation is available."}</p> : null}
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
  </div></div>, document.body);
}
