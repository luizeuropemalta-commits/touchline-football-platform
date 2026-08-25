"use client";

import { BadgeCheck, CalendarClock, Crown, LockKeyhole, Pencil, Send } from "lucide-react";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import { formatTouchlineFantasyDeadline } from "@/lib/touchlineFantasy/domain";
import type { TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import styles from "./TouchlineGameweekTeamSnapshot.module.css";

export default function TouchlineGameweekTeamSnapshot({ snapshot, locale, surface }: {
  snapshot: TouchlineFantasySnapshot | null;
  locale: string;
  surface: "club-owner" | "arena";
}) {
  const pt = locale === "pt-BR";
  const gameweek = snapshot?.activeGameweek;
  const userGameweek = snapshot?.userGameweek;
  const geometry = userGameweek ? snapshot?.formationRegistry[userGameweek.formationCode] : null;
  const coach = snapshot?.coaches.find((entry) => entry.id === userGameweek?.selectedCoachId) ?? null;
  const cards = new Map((snapshot?.catalogue ?? []).map((card) => [card.canonicalPlayerId ?? card.id, card]));
  const editable = gameweek?.state === "MARKET_OPEN";
  const complete = Boolean(userGameweek && coach && snapshot?.selections.length === 11);
  const title = surface === "arena" ? (pt ? "Equipe sincronizada na Arena" : "Arena-synced Gameweek team") : (pt ? "Meu time da rodada" : "My Gameweek team");
  return <section className={styles.shell} data-gameweek-team-surface={surface}>
    <header><div><span><BadgeCheck /> TOUCHLINE GAMEWEEK XI</span><h2>{title}</h2><p>{complete ? (pt ? "Treinador, formação e 11 identidades canônicas. Nenhum banco Fantasy." : "Coach, formation and 11 canonical identities. No Fantasy bench.") : (pt ? "Monte e confirme sua equipe no TouchLine Markt." : "Build and confirm your team in TouchLine Markt.")}</p></div><aside><small>GAMEWEEK</small><strong>{gameweek?.number ?? "—"}</strong><em>{userGameweek?.formationCode ?? "—"}</em></aside></header>
    {complete && geometry ? <div className={styles.body}>
      <div className={styles.coach}><span><Crown />{pt ? "TREINADOR" : "COACH"}</span><div><TouchlineCoachCard coach={coach!.coach} slot={coach!.slot} clubName={coach!.clubName} clubLogoUrl={coach!.clubLogoUrl} countryCode3={coach!.countryCode3} locale={locale} displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /></div><b>{coach!.coach.displayName}</b><small>{coach!.clubName}</small></div>
      <TouchlinePitchSurface className={styles.pitch} ariaLabel={title}>{geometry.slots.map((slot) => { const selection = snapshot!.selections.find((entry) => entry.slotId === slot.id); const card = selection ? cards.get(selection.playerId) : null; return <div className={styles.slot} key={slot.id} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} data-canonical-player-id={selection?.playerId ?? undefined}>{card ? <><span><TouchlineGameweekCard card={card} locale={locale} compact /></span><b>{card.shortName}</b></> : <i>{slot.id}</i>}</div>; })}</TouchlinePitchSurface>
    </div> : <div className={styles.empty}><Send /><p>{pt ? "A equipe da rodada ainda não está completa." : "The Gameweek team is not complete yet."}</p></div>}
    <footer><div><CalendarClock /><span>{gameweek ? formatTouchlineFantasyDeadline(gameweek.locksAt, locale) : "—"}</span>{editable ? <em>{pt ? "EDIÇÃO ABERTA" : "EDITING OPEN"}</em> : <em><LockKeyhole />{pt ? "SNAPSHOT BLOQUEADO" : "LOCKED SNAPSHOT"}</em>}</div><a href={`/market-transfer?lang=${encodeURIComponent(locale)}`}>{editable ? <Pencil /> : <LockKeyhole />}{editable ? (pt ? "Editar no Markt" : "Edit in Markt") : (pt ? "Ver no Markt" : "View in Markt")}</a></footer>
  </section>;
}
