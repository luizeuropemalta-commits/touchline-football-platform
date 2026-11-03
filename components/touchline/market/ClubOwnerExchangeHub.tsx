"use client";

import { useId, useRef, useState, type RefObject } from "react";
import ClubOwnerPlanOnboarding from "../ClubOwnerPlanOnboarding";
import type { ClubSeasonCheckoutOffers } from "@/lib/stripe/club-season-checkout-client";
import ClubOwnerSearchTrigger from "../social/ClubOwnerSearchDialog";
import { peopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import ExchangeNegotiations from "./ExchangeNegotiations";
import TouchlineCreditAmount from "./TouchlineCreditAmount";
import { useExchangeHistory } from "./useExchangeHistory";
import { createPortal } from "react-dom";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import { projectExchangeHistory, type ExchangeHistorySnapshot, type ExchangeHistoryReceipt } from "@/lib/touchlineFantasy/exchange-history-presentation";
import type { ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { getExchangeHubCopy, formatExchangeReadinessCopy } from "@/lib/touchlineFantasy/exchange-hub-i18n";
import { projectExchangeReadiness } from "@/lib/touchlineFantasy/exchange-eligibility";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import type { ExchangePlan } from "./exchange-showcase";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerExchangeHub.module.css";

type Panel = "negotiations" | "history" | "finances";
type Props = { locale: string; draftLocalesEnabled?: boolean; plan?: ExchangePlan; ownerName?: string; state: ClubAcquisitionState | null; ready: boolean; catalogue: readonly ClubOwnerSquadCard[];
  /** Optional preloaded authenticated receipt projection. Otherwise read on panel opening. */
  exchangeHistory?: ExchangeHistorySnapshot | null;
  expectedAccountId?: string;
  /** Same server feature gate used by the canonical public directory. */
  publicDiscoveryEnabled?: boolean;
  checkoutOffers?: ClubSeasonCheckoutOffers;
  onCommitted?: () => void;
};

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
    <div style={{ visibility: panel ? "hidden" : "visible" }}>
    <div className={styles.notice}>
      <h3>{copy.centre}</h3>
      <ExchangeReadinessNotice {...props} />

    </div>
    {props.publicDiscoveryEnabled === true ? <ClubOwnerSearchTrigger locale={peopleLocale(props.locale)} /> : null}
    <nav className={styles.actions} aria-label="ClubOwner Exchange">
      {(["negotiations", "history", "finances"] as const).map(key => <button key={key} type="button" className={controls.link} aria-haspopup="dialog" onClick={event => { trigger.current = event.currentTarget; setPanel(key); }}>{titles[key]}</button>)}
    </nav>
    </div>
    {panel ? <ExchangePanel {...props} panel={panel} title={titles[panel]} returnFocusRef={trigger} onClose={() => setPanel(null)} /> : null}
  </>;
}

function ExchangePanel({ panel, title, locale, draftLocalesEnabled = false, plan, ownerName, state, ready, catalogue, exchangeHistory, expectedAccountId, checkoutOffers, onCommitted, returnFocusRef, onClose }: Props & { panel: Panel; title: string; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"exchanges" | "signings">("exchanges");
  const [signingsLimit, setSigningsLimit] = useState(12);
  const historyId = useId();
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: title, initialFocusRef: close, returnFocusRef, onDismiss: onClose });
  useTouchlineDialogScrollLock(true);
  const copy = getExchangeHubCopy(locale, draftLocalesEnabled);
  const credits = (value: number) => <TouchlineCreditAmount value={value} locale={locale} />;
  const byId = new Map(catalogue.map(card => [card.canonicalPlayerId ?? card.id, card.name]));
  const remoteHistory = useExchangeHistory(exchangeHistory === undefined && panel !== "negotiations", {
    ready, accountId: expectedAccountId, seasonId: state?.seasonId, collectionRevision: state?.revision,
  });
  const historyLoading = exchangeHistory === undefined && remoteHistory.status === "loading";
  const history = projectExchangeHistory(exchangeHistory === undefined ? remoteHistory.history : exchangeHistory, { ready, accountId: expectedAccountId,
    seasonId: state?.seasonId, collectionRevision: state?.revision });
  const squadValue = state?.players.reduce((total, player) => total + player.valueEur, 0);
  return createPortal(<div className={styles.overlay} data-exchange-plan={plan}>
    <div {...dialogProps} className={styles.dialog} dir={locale === "ar-SA" ? "rtl" : "ltr"}>
      <header className={styles.heading}><div><small>ClubOwner Exchange{ownerName ? ` · ${ownerName}` : ""}</small><h2>{title}</h2></div><button ref={close} className={controls.link} type="button" onClick={onClose}>{copy.close}</button></header>
      {panel === "negotiations" ? <ExchangeNegotiations key={JSON.stringify([expectedAccountId,state?.seasonId,state?.revision,ready])} locale={locale} draftLocalesEnabled={draftLocalesEnabled} state={state} ready={ready} accountId={expectedAccountId} catalogue={catalogue} onCommitted={onCommitted} onExplorePlans={() => setPlansOpen(true)} /> : !ready || !state ? <p role="status">{copy.waiting}</p> : panel === "history" ? <>
        <div className={styles.historyNavigation} aria-label={copy.history}>
          {([['exchanges',copy.tradesTab],['signings',copy.signingsTab]] as const).map(([key,label]) => <button key={key} type="button" className={controls.link} aria-pressed={historyTab===key} aria-controls={`${historyId}-${key}`} onClick={()=>setHistoryTab(key)}>{label}<span className={styles.historyCount} title={key==='exchanges'&&history?.coverage==='partial'?copy.partialHistory:undefined}>{key==='signings'?state.receipts.length:history?.receipts.length??'—'}</span></button>)}
        </div>
        <section id={`${historyId}-signings`} hidden={historyTab!=="signings"} className={styles.section} aria-label={copy.signingsTab}><h3>{copy.signings}</h3><p className={styles.historyCaption}>{copy.records}</p>
        {state.receipts.length ? <><ul className={styles.signingGrid}>{[...state.receipts].sort((a,b) => b.revision - a.revision).slice(0,signingsLimit).map(receipt => <li key={receipt.key}><span className={styles.signingMark} aria-hidden="true">↘</span><div><strong>{byId.get(receipt.playerId) ?? copy.identityUnavailable}</strong><span>{credits(receipt.valueEur)}</span></div></li>)}</ul>{state.receipts.length>signingsLimit?<button type="button" className={controls.link} onClick={()=>setSigningsLimit(limit=>limit+12)}>{copy.showMore}</button>:null}</> : <p>{copy.empty}</p>}</section>
        <section id={`${historyId}-exchanges`} hidden={historyTab!=="exchanges"} className={styles.section} aria-label={copy.tradesTab}><h3>{copy.confirmedExchanges}</h3>
          {!history ? <p role="status">{historyLoading?copy.historyLoading:copy.historyUnavailable}</p> : <>
            {history.coverage === "partial" ? <p role="status">{copy.partialHistory}</p> : null}
            {history.receipts.length ? <ol className={styles.exchanges}>{history.receipts.map((receipt,index) => <li key={receipt.id}>
              <ExchangeReceipt receipt={receipt} catalogue={catalogue} locale={locale} draftLocalesEnabled={draftLocalesEnabled} initiallyOpen={index===0} />
            </li>)}</ol> : history.coverage === "complete" ? <p>{copy.emptyExchanges}</p> : null}
          </>}
        </section>
      </> : <>
        <section className={styles.section}><h3>{copy.financialPosition}</h3><dl className={styles.amounts}>
          <div><dt>{copy.availableBalance}</dt><dd>{credits(state.balanceEur)}</dd></div>
          <div><dt>{copy.squadValue}</dt><dd>{credits(squadValue ?? NaN)}</dd></div>
          <div><dt>{copy.coachValue}</dt><dd>{credits(state.coach === null ? 0 : state.coach.valueEur)}</dd></div>
        </dl><p>{copy.valuationDisclaimer}</p></section>
        <section className={styles.section}><h3>{copy.negotiationIncome}</h3>
          {history?.seasonNegotiationIncomeTc != null ? <>
            <p className={styles.incomeAmount}>{credits(history.seasonNegotiationIncomeTc)}</p><p>{copy.incomeIncluded}</p>
          </> : <p role="status">{historyLoading?copy.statementLoading:copy.statementUnavailable}</p>}
        </section>
      </>}
      {/* Keep Exchange mounted: selection and the invoking focus target survive browsing plans. */}
      <ClubOwnerPlanOnboarding open={plansOpen === true} locale={locale} draftLocalesEnabled={draftLocalesEnabled}
        activePlanKey={state?.plan ?? null} checkoutOffers={checkoutOffers} checkoutEnabled={Object.keys(checkoutOffers ?? {}).length > 0}
        onDismiss={() => setPlansOpen(false)} />
    </div>
  </div>, document.body);
}


function ExchangeReceipt({ receipt, catalogue, locale, draftLocalesEnabled, initiallyOpen }: {
  receipt: ExchangeHistoryReceipt; catalogue: readonly ClubOwnerSquadCard[]; locale: string; draftLocalesEnabled: boolean; initiallyOpen: boolean;
}) {
  const [expanded,setExpanded] = useState(initiallyOpen);
  const copy = getExchangeHubCopy(locale, draftLocalesEnabled);
  const credits = (value: number) => <TouchlineCreditAmount value={value} locale={locale} />;
  const date = `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(receipt.occurredAt))} UTC`;
  const differenceLabel = receipt.difference.direction === "paid" ? copy.differencePaid
    : receipt.difference.direction === "received" ? copy.differenceReceived : copy.noDifference;
  return <details className={styles.exchangeReceipt} open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary className={styles.receiptSummary} tabIndex={0}>
      <span className={styles.receiptDirection} aria-hidden="true">⇄</span>
      <span className={styles.receiptIdentity}><strong>{receipt.received.name} <span aria-hidden="true">↔</span> {receipt.given.name}</strong><span>{receipt.counterpart.name} · <time dateTime={receipt.occurredAt}>{date}</time></span></span>
      <span className={styles.receiptChevron} aria-hidden="true">⌄</span>
    </summary>
    {expanded?<div className={styles.receiptContent}>
    <dl className={styles.receiptProposer}><dt>{copy.proposedBy}</dt><dd>{receipt.proposer.name}</dd></dl>
    <div className={styles.receiptLayout}><div className={styles.cardPair}>
      {([['received', copy.receivedCard], ['given', copy.givenCard]] as const).map(([side, label]) => {
        const player = receipt[side];
        // Catalogue artwork is current, not an invented historical rendering.
        // Receipt names and amounts stay pinned even if today's card changes.
        const matches = catalogue.filter(card => card.canonicalPlayerId === player.playerId && card.editorialCard);
        const card = matches.length === 1 ? matches[0] : null;
        return <section key={side} className={styles.receiptCard} aria-label={label}>
          <h4>{label}</h4><div className={styles.cardArtwork}>
            {card ? <TouchlineGameweekCard card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled}
              compact fitContainer imageLoading="lazy" /> : <p className={styles.cardMissing}>{copy.cardUnavailable}</p>}
          </div>
          {card ? <small>{copy.currentCard}</small> : null}
          <h5>{player.name}</h5><strong>{credits(player.valueTc)}</strong>
        </section>;
      })}
    </div>
    <section className={styles.settlement} aria-label={copy.financialPosition}><h3>{copy.financialPosition}</h3>
    <dl className={styles.amounts}>
      <div><dt>{differenceLabel}</dt><dd>{credits(receipt.difference.amountTc)}</dd></div>
      <div><dt>{copy.fee}</dt><dd>{credits(receipt.feeTc)}</dd></div>
      <div><dt>{copy.bonus}</dt><dd>{credits(receipt.bonusTc)}</dd></div>
      <div className={styles.balanceTotal}><dt>{copy.balanceAfter}</dt><dd>{credits(receipt.balanceAfterTc)}</dd></div>
    </dl>
    <p className={styles.historyCaption}>{copy.receiptValues}</p></section></div>
    </div>:null}
  </details>;
}
