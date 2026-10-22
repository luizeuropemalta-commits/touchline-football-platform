"use client";

import { useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import type { ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { getExchangeHubCopy, formatExchangeReadinessCopy } from "@/lib/touchlineFantasy/exchange-hub-i18n";
import { projectExchangeReadiness } from "@/lib/touchlineFantasy/exchange-eligibility";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import type { ExchangePlan } from "./exchange-showcase";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerExchangeHub.module.css";

type Panel = "negotiations" | "history" | "finances";
type Props = { locale: string; draftLocalesEnabled?: boolean; plan?: ExchangePlan; ownerName?: string; state: ClubAcquisitionState | null; ready: boolean; catalogue: readonly ClubOwnerSquadCard[] };

function ExchangeReadinessNotice({ state, ready, locale, draftLocalesEnabled = false }: Pick<Props, "state" | "ready" | "locale" | "draftLocalesEnabled">) {
  const readiness = projectExchangeReadiness(state, ready);
  const copy = getExchangeHubCopy(locale, draftLocalesEnabled);
  const message = readiness.status === "unconfirmed"
    ? (copy.unconfirmed)
    : readiness.status === "invalid"
      ? (copy.invalid)
      : readiness.status === "plan-unavailable"
        ? (copy.planUnavailable)
        : readiness.status === "incomplete"
          ? (formatExchangeReadinessCopy(copy.incomplete, readiness.ownedCount, readiness.requiredCount))
          : (formatExchangeReadinessCopy(copy.complete, readiness.ownedCount, readiness.requiredCount));
  return <p role="status" data-exchange-readiness={readiness.status}>{message}</p>;
}

/** Read-only account presentation. A missing ledger is unavailable, never zero. */
export default function ClubOwnerExchangeHub(props: Props) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const copy = getExchangeHubCopy(props.locale, props.draftLocalesEnabled);
  const titles: Record<Panel, string> = { negotiations: copy.negotiations, history: copy.history, finances: copy.finances };
  return <>
    <div className={styles.notice}>
      <h3>{copy.centre}</h3>
      <ExchangeReadinessNotice {...props} />
      <p role="status">{copy.unavailable}</p>
    </div>
    <nav className={styles.actions} aria-label="ClubOwner Exchange">
      {(["negotiations", "history", "finances"] as const).map(key => <button key={key} type="button" className={controls.link} aria-haspopup="dialog" onClick={event => { trigger.current = event.currentTarget; setPanel(key); }}>{titles[key]}</button>)}
    </nav>
    {panel ? <ExchangePanel {...props} panel={panel} title={titles[panel]} returnFocusRef={trigger} onClose={() => setPanel(null)} /> : null}
  </>;
}

function ExchangePanel({ panel, title, locale, draftLocalesEnabled = false, plan, ownerName, state, ready, catalogue, returnFocusRef, onClose }: Props & { panel: Panel; title: string; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: title, initialFocusRef: close, returnFocusRef, onDismiss: onClose });
  useTouchlineDialogScrollLock(true);
  const copy = getExchangeHubCopy(locale, draftLocalesEnabled);
  const credits = (value: number) => Number.isSafeInteger(value) && value >= 0 ? `${value.toLocaleString(locale)} TC` : "—";
  const byId = new Map(catalogue.map(card => [card.canonicalPlayerId ?? card.id, card.name]));
  const squadValue = state?.players.reduce((total, player) => total + player.valueEur, 0);
  return createPortal(<div className={styles.overlay} data-exchange-plan={plan}>
    <div {...dialogProps} className={styles.dialog}>
      <header className={styles.heading}><div><small>ClubOwner Exchange{ownerName ? ` · ${ownerName}` : ""}</small><h2>{title}</h2></div><button ref={close} className={controls.link} type="button" onClick={onClose}>{copy.close}</button></header>
      {panel === "negotiations" ? <ExchangeReadinessNotice state={state} ready={ready} locale={locale} draftLocalesEnabled={draftLocalesEnabled} /> : null}
      {panel === "negotiations" ? <section className={styles.section}><h3>{copy.interests}</h3><p role="status">{copy.disconnected}</p><p>{copy.organisation}</p></section> : !ready || !state ? <p role="status">{copy.waiting}</p> : panel === "history" ? <>
        <section className={styles.section}><h3>{copy.signings}</h3><p>{copy.records}</p>
        {state.receipts.length ? <ul className={styles.history}>{[...state.receipts].sort((a,b) => b.revision - a.revision).map(receipt => <li key={receipt.key}><span>{byId.get(receipt.playerId) ?? (copy.identityUnavailable)}</span><strong>{credits(receipt.valueEur)}</strong></li>)}</ul> : <p>{copy.empty}</p>}</section>
        <section className={styles.section}><h3>ClubOwner Exchange</h3><p role="status">{copy.historyUnavailable}</p></section>
      </> : <>
        <section className={styles.section}><h3>{copy.financialPosition}</h3><dl className={styles.amounts}>
          <dt>{copy.availableBalance}</dt><dd>{credits(state.balanceEur)}</dd>
          <dt>{copy.squadValue}</dt><dd>{credits(squadValue ?? NaN)}</dd>
          <dt>{copy.coachValue}</dt><dd>{credits(state.coach.valueEur)}</dd>
        </dl><p>{copy.valuationDisclaimer}</p></section>
        <section className={styles.section}><h3>{copy.income}</h3><p role="status">{copy.statementUnavailable}</p></section>
      </>}
    </div>
  </div>, document.body);
}
