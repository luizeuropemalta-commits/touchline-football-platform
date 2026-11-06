"use client";
import type { PublicOwnerSquad } from "@/lib/touchlineArena/clubowner-public-squad-server";
import TouchlinePlayerAvailabilityBadge from "../cards/TouchlinePlayerAvailabilityBadge";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import TouchlineGameweekCard from "../fantasy/TouchlineGameweekCard";
import TouchlineCoachCardZoom from "../cards/TouchlineCoachCardZoom";
import TouchlinePitchSurface from "../pitch/TouchlinePitchSurface";
import styles from "./ClubOwnerPublicSquad.module.css";

export default function ClubOwnerPublicSquad({ squad, locale }: { squad: PublicOwnerSquad; locale: string }) {
  const pt = locale.startsWith("pt"), coach = squad.coach;
  const cardAt = (area: string, slot: number) => {
    const player = squad.players.find(player => player.area === area && player.slot === slot);
    const card = player && squad.cards.find(card => (card.canonicalPlayerId ?? card.id) === player.playerId);
    const indicators = player ? squad.availability?.filter(entry => entry.playerId === player.playerId) ?? [] : [];
    return card ? <><TouchlineGameweekCard card={card} locale={locale} compact fitContainer imageLoading="lazy" />
      {indicators.length === 1 ? <div className={styles.availability}><TouchlinePlayerAvailabilityBadge badge={indicators[0].badge} locale={resolveTouchlineCatalogueLocale(locale)} /></div> : null}</>
      : <span className={styles.vacancy}>{player ? (pt ? "Card indisponível" : "Card unavailable") : (pt ? "Vaga livre" : "Empty slot")}</span>;
  };
  return <section className={styles.squad} aria-label={pt ? "Elenco" : "Squad"} data-public-squad="read-only">
    <header><h2>{pt ? "Elenco" : "Squad"}</h2><span>{squad.players.length}/35 · {squad.geometry.formationCode}</span></header>
    <section className={styles.coach}><h3>{pt ? "Treinador" : "Coach"}</h3>
      {coach ? <div className={styles.coachCard}><TouchlineCoachCardZoom coach={coach.coach} slot={coach.slot} clubName={coach.clubName}
        clubLogoUrl={coach.clubLogoUrl} countryCode3={coach.countryCode3} contract={null} competition={coach.competition}
        profileHref={`/touchline-coaches/${encodeURIComponent(coach.id)}?lang=${encodeURIComponent(locale)}`} locale={locale}
        compact frameDisplayWidth={110} /></div> : <span>{squad.hasCoach ? (pt ? "Card indisponível" : "Card unavailable") : (pt ? "Ainda sem treinador" : "No coach yet")}</span>}
    </section>
    <h3>{pt ? "Titulares" : "Starting XI"} · {squad.players.filter(p => p.area === "starters").length}/11</h3>
    <TouchlinePitchSurface className={styles.pitch} ariaLabel={pt ? "Escalação do ClubOwner" : "ClubOwner lineup"} surfaceVariant="smoked-glass">
      {squad.geometry.slots.map((slot, index) => <div key={slot.id} className={styles.pitchSlot} style={{ left: `${Math.min(89, Math.max(11, slot.x))}%`, top: `${Math.min(86, Math.max(14, 100 - slot.y))}%` }}>
        {cardAt("starters", index)}
      </div>)}
    </TouchlinePitchSurface>
    {(["reserves", "outside"] as const).map(area => <section key={area}>
      <h3>{area === "reserves" ? (pt ? "Banco de reservas" : "Substitutes") : (pt ? "Fora da partida" : "Outside the match")} · {squad.players.filter(p => p.area === area).length}/{area === "reserves" ? 9 : 15}</h3>
      <div className={styles.rail}>{Array.from({ length: area === "reserves" ? 9 : 15 }, (_, slot) => <div className={styles.reserve} key={slot}>{cardAt(area, slot)}</div>)}</div>
    </section>)}
  </section>;
}
