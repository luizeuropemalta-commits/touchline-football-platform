"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, BriefcaseBusiness, ChevronRight, Shield, Users, Wallet, X } from "lucide-react";
import type { ClubOwnedPlayer } from "@/lib/touchlineFantasy/club-acquisition";
import { officeCopy, summarizeOffice, type OfficeCollection, type OfficeHistory } from "./club-office-model";
import controls from "../TouchlineGlobalNavigation.module.css";
import styles from "./ClubOwnerOffice.module.css";

export type ClubOwnerOfficeProps = Readonly<{
  locale: string;
  draftLocalesEnabled?: boolean;
  collection: OfficeCollection;
  history?: OfficeHistory;
  playerLabels?: ReadonlyMap<string, Readonly<{ name: string; clubName?: string }>>;
  /** Supply the original card without its zoom/interactive wrapper: this dialog owns navigation. */
  renderPlayerCard?: (player: ClubOwnedPlayer) => ReactNode;
}>;
type View = "overview" | "roster" | "movements" | "balance" | "player" | "movement";
const missingHistory: OfficeHistory = { status: "unavailable" };

/** One native modal, with internal drilldowns; no requests, purchases or synthetic records. */
export default function ClubOwnerOffice({ locale, draftLocalesEnabled = false, collection, history = missingHistory, playerLabels, renderPlayerCard }: ClubOwnerOfficeProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const copy = officeCopy(locale, draftLocalesEnabled);
  const summary = summarizeOffice(collection);
  const state = collection.status === "ready" ? collection.state : null;
  const player = state?.players.find(item => item.playerId === selected);
  const movement = history.status === "ready" ? history.movements.find(item => item.id === selected) : undefined;
  const playerName = (playerId: string) => playerLabels?.get(playerId)?.name || copy.noName;
  const money = (value: number | null | undefined) => value == null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} TC`;
  const date = (value: string) => Number.isNaN(Date.parse(value)) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const areaName = (area: ClubOwnedPlayer["area"]) => area === "starters" ? copy.starters : area === "reserves" ? copy.reserves : copy.outside;
  useEffect(() => {
    if (opened) { heading.current?.focus(); dialog.current?.scrollTo?.({ top: 0 }); }
  }, [view, selected, opened]);
  const navigate = (next: View, selection: string | null = null) => {
    setView(next); setSelected(selection);
  };
  const close = () => dialog.current?.close();
  const afterClose = () => { setOpened(false); setView("overview"); setSelected(null); trigger.current?.focus(); };
  const open = () => { setView("overview"); setSelected(null); setOpened(true); dialog.current?.showModal(); };
  const status = (source: OfficeCollection | OfficeHistory, historyOnly = false) => source.status === "ready" ? null
    : <p className={styles.notice} role={source.status === "error" ? "alert" : "status"}>{source.status === "loading" ? copy.loading : source.status === "error" ? copy.error : historyOnly ? copy.historyUnavailable : copy.unavailable}</p>;
  const title = view === "overview" ? copy.title : view === "roster" ? copy.roster : view === "balance" ? copy.balance : view === "player" ? player ? playerName(player.playerId) : copy.noName : copy.movements;
  const points = history.status === "ready" && player ? history.points.filter(item => item.playerId === player.playerId) : [];

  return <div className={styles.office} data-club-office="true">
    <button ref={trigger} type="button" className={controls.link} aria-haspopup="dialog" aria-controls={`${id}-dialog`} onClick={open}>
      <BriefcaseBusiness size={16} aria-hidden="true" />{copy.title}
    </button>
    <dialog ref={dialog} id={`${id}-dialog`} className={styles.dialog} aria-labelledby={`${id}-title`} onClose={afterClose} onCancel={event => { event.preventDefault(); close(); }}>
      <div className={styles.room} aria-hidden="true">
        <svg viewBox="0 0 1200 720" fill="none" focusable="false">
          <path d="M70 570V130h330v440M70 260h330M70 420h330M115 260v-95h24v95m20 0v-80h28v80m25 0v-96h30v96M835 130h295v440H835zM835 250h295M835 410h295M470 390h260l45 50H425zM455 440v180m290-180v180M520 550h160" />
          <path d="M935 290h95l-10 56-28 19-27-19zM935 300h-24v25l32 18m87-43h24v25l-32 18M992 365v25m-29 0h58M525 175h150v105H525zM565 200h70v55h-70zM70 620h1060" />
        </svg>
      </div>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>{copy.subtitle}</span><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2></div>
        <div className={styles.actions}>
          {view !== "overview" ? <button type="button" className={controls.link} onClick={() => navigate(view === "player" ? "roster" : view === "movement" ? "movements" : "overview")}><ArrowLeft size={16} aria-hidden="true" />{copy.back}</button> : null}
          <button type="button" className={`${controls.link} ${styles.close}`} aria-label={copy.close} onClick={close}><X size={18} aria-hidden="true" /></button>
        </div>
      </header>
      {opened ? <main className={styles.content} data-office-view={view}>
        {view === "overview" ? <>
          <div className={styles.hero}><BriefcaseBusiness size={36} aria-hidden="true" /><span>{copy.readOnly}</span></div>
          {status(collection)}
          <div className={styles.blocks}>
            {([{ key: "roster", icon: Users, label: copy.roster, hint: copy.rosterHint, value: summary ? String(summary.playerCount) : "—" },
              { key: "movements", icon: ArrowLeftRight, label: copy.movements, hint: copy.movementsHint, value: history.status === "ready" ? String(history.movements.length) : "—" },
              { key: "balance", icon: Wallet, label: copy.balance, hint: copy.balanceHint, value: money(summary?.balance) }] as const).map(({ key, icon: Icon, label, hint, value }) => <section className={styles.block} key={key}>
                <Icon size={25} aria-hidden="true" /><h3>{label}</h3><strong>{value}</strong><p>{hint}</p>
                <button type="button" className={controls.link} aria-label={`${copy.view}: ${label}`} onClick={() => navigate(key)}>{copy.view}<ChevronRight size={14} aria-hidden="true" /></button>
              </section>)}
          </div>
        </> : null}
        {view === "roster" ? <>
          {status(collection)}
          {summary ? <dl className={styles.metrics}>{[[copy.starters, summary.starters], [copy.reserves, summary.reserves], [copy.outside, summary.outside]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
          {collection.status === "ready" && !state?.players.length ? <p className={styles.notice}>{copy.emptyRoster}</p> : null}
          <div className={styles.players}>{state?.players.map(item => <article key={item.playerId} className={styles.player}>
            <div className={styles.card}>{renderPlayerCard ? renderPlayerCard(item) : <Shield size={40} aria-hidden="true" />}</div>
            <h3>{playerName(item.playerId)}</h3><p>{item.position} · {areaName(item.area)}</p>
            <button type="button" className={controls.link} aria-label={`${copy.details}: ${playerName(item.playerId)}`} onClick={() => navigate("player", item.playerId)}>{copy.details}</button>
          </article>)}</div>
        </> : null}
        {view === "player" ? player ? <>
          <div className={styles.playerDetail}>
            <div className={styles.card}>{renderPlayerCard ? renderPlayerCard(player) : <Shield size={60} aria-hidden="true" />}</div>
            <dl className={styles.metrics}>{[[copy.position, player.position], [copy.club, playerLabels?.get(player.playerId)?.clubName ?? "—"], [copy.area, areaName(player.area)], [copy.paid, money(player.valueEur)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </div>
          <h3>{copy.points}</h3><p className={styles.hint}>{copy.pointsHint}</p>{status(history, true)}
          {history.status === "ready" && !points.length ? <p className={styles.notice}>{copy.emptyPoints}</p> : null}
          <div className={styles.records}>{points.map(item => <article key={item.id} className={styles.record}><span>{item.roundLabel}</span><h4>{item.fixtureLabel}</h4><strong>{item.creditedPoints} {copy.points}</strong><small>{copy.lock}: {date(item.lineupLockedAt)}</small></article>)}</div>
        </> : <>{status(collection)}{collection.status === "ready" ? <p className={styles.notice}>{copy.unavailable}</p> : null}</> : null}
        {view === "movements" ? <>
          {status(history, true)}
          {history.status === "ready" && !history.movements.length ? <p className={styles.notice}>{copy.emptyHistory}</p> : null}
          <div className={styles.records}>{history.status === "ready" ? history.movements.map(item => <article className={styles.record} key={item.id}>
            <span>{copy[item.kind]}</span><h3>{item.playerName}{item.counterpartPlayerName ? ` ↔ ${item.counterpartPlayerName}` : ""}</h3><small>{date(item.occurredAt)}</small>
            <button type="button" className={controls.link} aria-label={`${copy.details}: ${copy[item.kind]} · ${item.playerName}`} onClick={() => navigate("movement", item.id)}>{copy.details}</button>
          </article>) : null}</div>
        </> : null}
        {view === "movement" ? movement ? <article className={styles.record}><span>{copy[movement.kind]}</span><h3>{movement.playerName}{movement.counterpartPlayerName ? ` ↔ ${movement.counterpartPlayerName}` : ""}</h3><dl className={styles.metrics}><div><dt>{copy.date}</dt><dd>{date(movement.occurredAt)}</dd></div><div><dt>{copy.change}</dt><dd>{movement.creditsDelta > 0 ? "+" : ""}{money(movement.creditsDelta)}</dd></div></dl></article> : <>{status(history, true)}{history.status === "ready" ? <p className={styles.notice}>{copy.unavailable}</p> : null}</> : null}
        {view === "balance" ? <>
          {status(collection)}
          <dl className={styles.metrics}><div className={styles.balance}><dt>{copy.confirmedBalance}</dt><dd>{money(summary?.balance)}</dd></div><div><dt>{copy.playerCost}</dt><dd>{money(summary?.playersCost)}</dd></div><div><dt>{copy.coachCost}</dt><dd>{money(summary?.coachCost)}</dd></div></dl>
          {summary?.balance == null ? <p className={styles.notice}>{copy.noBalance}</p> : null}<p className={styles.hint}>{copy.balanceHintDetail}</p>
        </> : null}
      </main> : null}
    </dialog>
  </div>;
}
