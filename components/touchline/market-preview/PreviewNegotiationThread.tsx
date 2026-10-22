"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import ClubOwnerNegotiationRoom from "../market/ClubOwnerNegotiationRoom";
import { formatCredits } from "./preview-model";
import { reservations, type LocalProposal, type PreviewAction, type PreviewLedger } from "./preview-ledger";
import styles from "./MarketExperiencePreview.module.css";

export default function PreviewNegotiationThread({ proposal: p, ledger, onAction, onCounter, renderCard }: {
  proposal: LocalProposal; ledger: PreviewLedger; onAction: (action: PreviewAction) => boolean;
  onCounter: () => void; renderCard: (id: string) => ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const terms = p.terms;
  const reserved = reservations(ledger, p.id);
  const final = ledger.balance + terms.compensation - terms.fee + terms.bonus;
  const otherFinal = ledger.otherBalance - terms.compensation - terms.otherFee + terms.otherBonus;
  const pending = p.state === "pending";
  const affordable = final >= reserved.credits && otherFinal >= reserved.otherCredits;
  const statuses = { pending: "Aguardando resposta", accepted: "Concluída", rejected: "Recusada", cancelled: "Cancelada", countered: "Contraproposta enviada" };
  return <>
    <ClubOwnerNegotiationRoom plan={ledger.plan} compact />
    <div className={styles.dealCards}><section><span className={styles.eyebrow}>VOCÊ ENTREGA</span>{renderCard(p.outgoingId)}</section><span aria-hidden="true">⇄</span><section><span className={styles.eyebrow}>VOCÊ RECEBE</span>{renderCard(p.incomingId)}</section></div>
    <p role="status">{statuses[p.state]} · {p.direction === "incoming" ? "Recebida" : "Enviada"}</p>
    <div className={styles.dealSummary}><h3>Condições registradas</h3><dl>
      <div><dt>Sua taxa · {terms.rate}%</dt><dd>{formatCredits(terms.fee)}</dd></div>
      <div><dt>Taxa do outro clube · {terms.otherRate}%</dt><dd>{formatCredits(terms.otherFee)}</dd></div>
      <div><dt>Bônus de quem aceita</dt><dd>{formatCredits(terms.bonus + terms.otherBonus)}</dd></div>
      <div><dt>Compensação {terms.compensation >= 0 ? "a receber" : "a pagar"}</dt><dd>{formatCredits(Math.abs(terms.compensation))}</dd></div>
      {pending ? <><div><dt>Seu saldo atual</dt><dd>{formatCredits(ledger.balance)}</dd></div><div><dt>Seu saldo após aceite</dt><dd>{formatCredits(final)}</dd></div><div><dt>Outras propostas reservam</dt><dd>{formatCredits(reserved.credits)}</dd></div></> : null}
    </dl><p className={styles.feeHint}>Quem aceita não paga taxa e recebe metade da taxa de quem propõe.</p></div>
    {ledger.error ? <p role="alert" className={styles.insufficient}>{ledger.error}</p> : null}
    {pending && !affordable ? <p role="alert" className={styles.insufficient}>Saldo insuficiente em um dos clubes. A proposta não pode ser aceita.</p> : null}
    {pending ? <div className={styles.actions}>
      {p.direction === "incoming" ? <Button disabled={ledger.locked || !affordable} onClick={() => setConfirming(true)}>Revisar aceite</Button> : null}
      <Button variant="secondary" disabled={ledger.locked} onClick={onCounter}>Preparar contraproposta</Button>
      <Button variant="ghost" onClick={() => onAction({ type: "resolve", id: p.id, result: p.direction === "incoming" ? "rejected" : "cancelled" })}>{p.direction === "incoming" ? "Recusar" : "Cancelar proposta"}</Button>
    </div> : null}
    {pending && p.direction === "incoming" && confirming ? <section className={styles.warning} aria-label="Confirmar aceite"><div><b>Confirmar troca?</b><p>Seu saldo final: {formatCredits(final)}.</p><div className={styles.actions}><Button disabled={ledger.locked || !affordable} onClick={() => { if (onAction({ type: "resolve", id: p.id, result: "accepted" })) setConfirming(false); }}>Confirmar troca</Button><Button variant="ghost" onClick={() => setConfirming(false)}>Voltar</Button></div></div></section> : null}
  </>;
}
