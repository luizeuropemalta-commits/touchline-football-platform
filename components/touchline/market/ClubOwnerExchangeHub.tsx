"use client";

import { useRef, useState, type RefObject } from "react";
import ClubOwnerPlanOnboarding from "../ClubOwnerPlanOnboarding";
import type { ClubSeasonCheckoutOffers } from "@/lib/stripe/club-season-checkout-client";
import ClubOwnerPublicDirectory from "../social/ClubOwnerPublicDirectory";
import { peopleCopy, peopleLocale } from "@/lib/touchlineArena/clubowner-public-contract";
import ExchangeNegotiations from "./ExchangeNegotiations";
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
    {props.publicDiscoveryEnabled === true ? <details className={styles.peopleSearch}>
      <summary>{peopleCopy(peopleLocale(props.locale)).friends}</summary>
      <ClubOwnerPublicDirectory locale={peopleLocale(props.locale)} enabled searchOnly initialOwn={{ status: 200, profile: null }} />
    </details> : null}
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
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: title, initialFocusRef: close, returnFocusRef, onDismiss: onClose });
  useTouchlineDialogScrollLock(true);
  const copy = getExchangeHubCopy(locale, draftLocalesEnabled);
  const credits = (value: number) => Number.isSafeInteger(value) && value >= 0 ? `${value.toLocaleString(locale)} TC` : "—";
  const byId = new Map(catalogue.map(card => [card.canonicalPlayerId ?? card.id, card.name]));
  const remoteHistory = useExchangeHistory(exchangeHistory === undefined && panel !== "negotiations", {
    ready, accountId: expectedAccountId, seasonId: state?.seasonId, collectionRevision: state?.revision,
  });
  const history = projectExchangeHistory(exchangeHistory === undefined ? remoteHistory : exchangeHistory, { ready, accountId: expectedAccountId,
    seasonId: state?.seasonId, collectionRevision: state?.revision });
  const squadValue = state?.players.reduce((total, player) => total + player.valueEur, 0);
  return createPortal(<div className={styles.overlay} data-exchange-plan={plan}>
    <div {...dialogProps} className={styles.dialog} dir={locale === "ar-SA" ? "rtl" : "ltr"}>
      <header className={styles.heading}><div><small>ClubOwner Exchange{ownerName ? ` · ${ownerName}` : ""}</small><h2>{title}</h2></div><button ref={close} className={controls.link} type="button" onClick={onClose}>{copy.close}</button></header>
      {panel === "negotiations" ? <ExchangeNegotiations key={JSON.stringify([expectedAccountId,state?.seasonId,state?.revision,ready])} locale={locale} state={state} ready={ready} accountId={expectedAccountId} catalogue={catalogue} onCommitted={onCommitted} onExplorePlans={() => setPlansOpen(true)} /> : !ready || !state ? <p role="status">{copy.waiting}</p> : panel === "history" ? <>
        <section className={styles.section}><h3>{copy.signings}</h3><p>{copy.records}</p>
        {state.receipts.length ? <ul className={styles.history}>{[...state.receipts].sort((a,b) => b.revision - a.revision).map(receipt => <li key={receipt.key}><span>{byId.get(receipt.playerId) ?? (copy.identityUnavailable)}</span><strong>{credits(receipt.valueEur)}</strong></li>)}</ul> : <p>{copy.empty}</p>}</section>
        <section className={styles.section}><h3>{copy.confirmedExchanges}</h3>
          {!history ? <p role="status">{copy.historyUnavailable}</p> : <>
            {history.coverage === "partial" ? <p role="status">{copy.partialHistory}</p> : null}
            {history.receipts.length ? <ol className={styles.exchanges}>{history.receipts.map(receipt => <li key={receipt.id}>
              <ExchangeReceipt receipt={receipt} catalogue={catalogue} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
            </li>)}</ol> : history.coverage === "complete" ? <p>{copy.emptyExchanges}</p> : null}
          </>}
        </section>
      </> : <>
        <section className={styles.section}><h3>{copy.financialPosition}</h3><dl className={styles.amounts}>
          <dt>{copy.availableBalance}</dt><dd>{credits(state.balanceEur)}</dd>
          <dt>{copy.squadValue}</dt><dd>{credits(squadValue ?? NaN)}</dd>
          <dt>{copy.coachValue}</dt><dd>{credits(state.coach === null ? 0 : state.coach.valueEur)}</dd>
        </dl><p>{copy.valuationDisclaimer}</p></section>
        <section className={styles.section}><h3>{copy.negotiationIncome}</h3>
          {history?.seasonNegotiationIncomeTc != null ? <>
            <p className={styles.incomeAmount}>{credits(history.seasonNegotiationIncomeTc)}</p><p>{copy.incomeIncluded}</p>
          </> : <p role="status">{copy.statementUnavailable}</p>}
        </section>
      </>}
      {/* Keep Exchange mounted: selection and the invoking focus target survive browsing plans. */}
      <ClubOwnerPlanOnboarding open={plansOpen === true} locale={locale} draftLocalesEnabled={draftLocalesEnabled}
        activePlanKey={state?.plan ?? null} checkoutOffers={checkoutOffers} checkoutEnabled={Object.keys(checkoutOffers ?? {}).length > 0}
        onDismiss={() => setPlansOpen(false)} />
    </div>
  </div>, document.body);
}


function ExchangeReceipt({ receipt, catalogue, locale, draftLocalesEnabled }: {
  receipt: ExchangeHistoryReceipt; catalogue: readonly ClubOwnerSquadCard[]; locale: string; draftLocalesEnabled: boolean;
}) {
  const copy = getExchangeHubCopy(locale, draftLocalesEnabled);
  const credits = (value: number) => `${value.toLocaleString(locale)} TC`;
  const date = `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(receipt.occurredAt))} UTC`;
  const differenceLabel = receipt.difference.direction === "paid" ? copy.differencePaid
    : receipt.difference.direction === "received" ? copy.differenceReceived : copy.noDifference;
  return <article className={styles.exchangeReceipt}>
    <dl className={styles.parties}>
      <div><dt>{copy.counterpart}</dt><dd>{receipt.counterpart.name}</dd></div>
      <div><dt>{copy.proposedBy}</dt><dd>{receipt.proposer.name}</dd></div>
      <div><dt>{copy.completedAt}</dt><dd><time dateTime={receipt.occurredAt}>{date}</time></dd></div>
    </dl>
    <div className={styles.cardPair}>
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
    <p>{copy.receiptValues}</p>
    <dl className={styles.amounts}>
      <dt>{differenceLabel}</dt><dd>{credits(receipt.difference.amountTc)}</dd>
      <dt>{copy.fee}</dt><dd>{credits(receipt.feeTc)}</dd>
      <dt>{copy.bonus}</dt><dd>{credits(receipt.bonusTc)}</dd>
      <dt>{copy.balanceAfter}</dt><dd>{credits(receipt.balanceAfterTc)}</dd>
    </dl>
  </article>;
}
