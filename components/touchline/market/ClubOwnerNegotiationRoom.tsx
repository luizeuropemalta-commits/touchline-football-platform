import type { ReactNode } from "react";
import type { ExchangePlan } from "./exchange-showcase";
import { CLUBOWNER_EXCHANGE_NAME } from "./exchange-showcase";
import { getExchangeRoomCopy } from "@/lib/touchlineFantasy/exchange-room-i18n";
import styles from "./ClubOwnerNegotiationRoom.module.css";

/** Decorative mark only: the adjacent heading/button supplies its accessible name. */
export function ClubOwnerAgentMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="16" cy="8" r="4.5" />
    <path d="M5 29v-5c0-5 4-8 8-9l3 3 3-3c4 1 8 4 8 9v5M10 17l1 8 5 4 5-4 1-8M14 18l2 3 2-3M16 21l-2 5 2 3 2-3-2-5" />
  </svg>;
}

const PLAN_LABELS: Record<ExchangePlan, string> = {
  beta: "Beta", standard: "Standard", master: "Master", vip: "VIP",
};

/** The club's representative, not a counterpart or an assertion of an active proposal. */
export function ClubOwnerRepresentative({ plan, ownerName, locale = "pt-BR", draftLocalesEnabled = false }: {
  plan?: ExchangePlan; ownerName?: string; locale?: string; draftLocalesEnabled?: boolean;
}) {
  return <figure className={`${styles.art} ${styles.soloArt}`}>
    <svg className={`${styles.scene} ${styles.soloScene}`} viewBox="0 0 188 188" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <g className={styles.representative} data-plan={plan}>
        <circle cx="94" cy="42" r="20" />
        <path d="M78 72c-26 6-40 29-40 59v42h112v-42c0-30-14-53-40-59L94 86 78 72Z" />
        <path d="m78 72-9 24 12 10-7 14 20 46 20-46-7-14 12-10-9-24M90 87l4-2 4 2-2 9 5 26-7 9-7-9 5-26-2-9M54 125l1 26 34 6m45-32-1 26-34 6M83 61v14m22-14V61" />
        <path className={styles.glint} pathLength="272" d="M94 22a20 20 0 1 1 0 40 20 20 0 1 1 0-40M78 72c-26 6-40 29-40 59v42h112v-42c0-30-14-53-40-59L94 86 78 72Z" />
      </g>
    </svg>
    <figcaption className={`${styles.planIdentity} ${styles.soloIdentity}`} data-plan={plan}>
      <span>ClubOwner</span>{ownerName?.trim() ? <span className={styles.ownerName}>{ownerName.trim()}</span> : null}
      <strong>{plan ? PLAN_LABELS[plan] : getExchangeRoomCopy(locale, draftLocalesEnabled).unknownPlan}</strong>
    </figcaption>
  </figure>;
}

/** Original vector artwork. A missing counterpart plan remains neutral, never inferred. */
export function ClubOwnerNegotiationScene({ plan, counterpartyPlan, ownerName, counterpartyName, locale = "pt-BR", draftLocalesEnabled = false }: {
  plan?: ExchangePlan; counterpartyPlan?: ExchangePlan; ownerName?: string; counterpartyName?: string; locale?: string; draftLocalesEnabled?: boolean;
}) {
  const unknownPlan = getExchangeRoomCopy(locale, draftLocalesEnabled).unknownPlan;
  return <figure className={styles.art}>
    <svg className={styles.scene} viewBox="0 0 560 236" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {/* Retain the original architectural line-work, now framing one shared negotiation table. */}
      <path className={styles.architecture} d="M24 212h512M44 152V26h472v126M44 48h472M280 26v89M111 48v51M449 48v51M44 88h472" />
      <path className={styles.chair} d="M107 162v-49c0-7 6-12 13-12h56c7 0 13 5 13 12v49m182 0v-49c0-7 6-12 13-12h56c7 0 13 5 13 12v49" />
      <g className={styles.representative} data-plan={plan}>
        <path className={styles.face} d="M155 43c12 0 20 9 20 21v9c0 12-9 23-20 23s-20-11-20-23v-9c0-12 8-21 20-21Z" />
        <path className={styles.hair} d="M135 65c-2-15 6-25 20-25 13 0 22 11 20 25l-7-10c-9 6-20 8-33 10Z" />
        <path className={styles.suit} d="M137 95l18 13 18-13 22 9c11 5 17 16 21 27l21 13-8 17-27-13-17-20 8 37h-80l4-40c1-16 7-24 20-30Z" />
        <path className={styles.shirt} d="m138 97 17 11 17-11-8 48h-18l-8-48Z" />
        <path className={styles.tie} d="m151 109 4-3 4 3-2 8 5 23-7 8-7-8 5-23-2-8Z" />
        <path d="m137 96-9 19 11 10-6 11 12 28m28-68 9 19-11 10 6 11-12 28M126 129l-1 21 36 4" />
        <path className={styles.cuff} d="m230 141 12 6-7 16-12-6 7-16Z" />
        <path className={styles.planPin} d="m122 116 5-4 5 4v7l-5 4-5-4v-7Z" />
        <path className={styles.glint} pathLength="272" d="M137 95l18 13 18-13 22 9c11 5 17 16 21 27l21 13-8 17-27-13-17-20" />
      </g>
      <g className={styles.representative} data-plan={counterpartyPlan}>
        <path className={styles.face} d="M405 43c12 0 20 9 20 21v9c0 12-9 23-20 23s-20-11-20-23v-9c0-12 8-21 20-21Z" />
        <path className={styles.hair} d="M385 65c-2-15 6-25 20-25 13 0 22 11 20 25l-7-10c-9 6-20 8-33 10Z" />
        <path className={styles.suit} d="m423 95-18 13-18-13-22 9c-11 5-17 16-21 27l-21 13 8 17 27-13 17-20-8 37h80l-4-40c-1-16-7-24-20-30Z" />
        <path className={styles.shirt} d="m388 97 17 11 17-11-8 48h-18l-8-48Z" />
        <path className={styles.tie} d="m401 109 4-3 4 3-2 8 5 23-7 8-7-8 5-23-2-8Z" />
        <path d="m387 96-9 19 11 10-6 11 12 28m28-68 9 19-11 10 6 11-12 28M434 129l1 21-36 4" />
        <path className={styles.cuff} d="m330 141-12 6 7 16 12-6-7-16Z" />
        <path className={styles.planPin} d="m436 116 5-4 5 4v7l-5 4-5-4v-7Z" />
        <path className={styles.glint} pathLength="272" d="m423 95-18 13-18-13-22 9c-11 5-17 16-21 27l-21 13 8 17 27-13 17-20" />
      </g>
      {/* Sleeves meet above the tabletop; the joined hands are not an acceptance status. */}
      <path className={styles.handshake} d="m240 148 20-8 17 2 11-4 16 4 16 8 5 10-17 8-12 9-12 4-9-3-9-1-12-7-19-9 5-13Z" />
      <path className={styles.handDetail} d="m277 142-13 10c-5 5 1 10 6 7l12-7 20 14m-33-1 18 12m-12-20 20 14m-34-1 14 8m13-40 6 5" />
      <path className={styles.tableTop} d="M106 174h348l48 25H58l48-25Z" />
      <path className={styles.tableFront} d="M58 199h444v9H58zM94 208v16m372-16v16" />
      <path className={styles.tableDetail} d="M78 203h404m-243-20h82m-64 6h46" />
    </svg>
    <figcaption className={styles.planLabels}>
      <span className={styles.planIdentity} data-plan={plan}><span>ClubOwner</span>{ownerName ? <span className={styles.ownerName}>{ownerName}</span> : null}<strong>{plan ? PLAN_LABELS[plan] : unknownPlan}</strong></span>
      <span className={styles.planIdentity} data-plan={counterpartyPlan}><span>ClubOwner</span>{counterpartyName ? <span className={styles.ownerName}>{counterpartyName}</span> : null}<strong>{counterpartyPlan ? PLAN_LABELS[counterpartyPlan] : unknownPlan}</strong></span>
    </figcaption>
  </figure>;
}

/** Presentation only; no card, ownership, credit, proposal or scoring transformations. */
export default function ClubOwnerNegotiationRoom({ plan, ownerName, agentNotice, compact = false, locale = "pt-BR", draftLocalesEnabled = false, children }: {
  plan?: ExchangePlan; ownerName?: string; agentNotice?: ReactNode; compact?: boolean; locale?: string; draftLocalesEnabled?: boolean; children?: ReactNode;
}) {
  return <div className={styles.room} data-exchange-plan={plan} data-compact={compact || undefined}>
    <div className={styles.header}>
      <div className={styles.identity}>
        <div><h2>{CLUBOWNER_EXCHANGE_NAME}</h2><p>{getExchangeRoomCopy(locale, draftLocalesEnabled).instruction}</p></div>
      </div>
      <div className={styles.agentDesk}>
        <ClubOwnerRepresentative plan={plan} ownerName={ownerName} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
        {agentNotice ? <div className={styles.agentNotice}>{agentNotice}</div> : null}
      </div>
    </div>
    {children ? <div className={styles.roster}>{children}</div> : null}
  </div>;
}
