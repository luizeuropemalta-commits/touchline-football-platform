"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Crown, LockKeyhole, Search, ShieldCheck, Sparkles, Trophy, WalletCards } from "lucide-react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineGoalFacingPitchCard from "@/components/touchline/cards/TouchlineGoalFacingPitchCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { touchlineMarketPositionBucket } from "@/lib/touchlineArena/position-eligibility";
import {
  assignTouchlineFantasyPlayerToFirstSlot,
  formatTouchlineFantasyMarketValue,
  validateTouchlineFantasyLineup,
  type TouchlineFantasyEligiblePlayer,
  type TouchlineFantasySelection,
} from "@/lib/touchlineFantasy/domain";
import type { TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import styles from "./fantasy.module.css";

type LiveState = Pick<NonNullable<TouchlineFantasySnapshot>, "activeGameweek" | "userGameweek" | "gameweekScore" | "seasonScore" | "matchHistory" | "gameweekRanking" | "seasonRanking">;

function newIdempotencyKey(action: "draft" | "confirm") {
  return `fantasy:${action}:${crypto.randomUUID()}`;
}

function statusCopy(state: string | undefined, pt: boolean) {
  const values: Record<string, readonly [string, string]> = {
    UPCOMING: ["Upcoming", "Em breve"], MARKET_OPEN: ["Market open", "Mercado aberto"],
    LOCKED: ["Locked", "Bloqueada"], LIVE: ["Live", "Ao vivo"], FINAL: ["Final", "Final"], SETTLED: ["Settled", "Liquidada"],
  };
  return values[state ?? ""]?.[pt ? 1 : 0] ?? "—";
}

function RankingTable({ title, entries, empty }: {
  title: string;
  entries: TouchlineFantasySnapshot["gameweekRanking"];
  empty: string;
}) {
  return <section className={styles.rankingPanel}><h3><Trophy aria-hidden="true" />{title}</h3>{entries.length
    ? <ol>{entries.slice(0, 20).map((entry) => <li key={entry.rank} data-current-manager={entry.isCurrentManager ? "true" : undefined}><span>#{entry.rank}</span><b>{entry.name}</b><strong>{entry.score.toFixed(2)}</strong></li>)}</ol>
    : <p>{empty}</p>}</section>;
}

function FantasyCard({ card, locale, compact = false }: { card: ClubOwnerSquadCard; locale: string; compact?: boolean }) {
  const exact = squadCardToExactPlayer(card);
  const palette = touchlineCardTierPalette(card.editorialCard?.tierKey ?? null);
  return (
    <TouchlineCardZoom
      ariaLabel={`${card.name} TouchLine card`}
      tierAccent={palette.accent}
      details={buildTouchlinePlayerCardZoomDetails({
        locale, name: card.name, clubName: card.clubName, position: card.position,
        nationality: card.countryCode3, editorialCard: card.editorialCard,
        marketValue: card.marketValue, marketValueState: card.marketValueState,
        extraFields: [{ label: locale === "pt-BR" ? "Rating total" : "Total Rating", value: card.seasonTotalRating == null ? "—" : card.seasonTotalRating.toFixed(2), accent: true, primary: true, kind: "rating-total" }],
      })}
      expandedContent={<TouchlineEliteExactCard player={exact} staticRenderScale={390 / 430} runtimeLocaleOverride={locale} subscribeToRanking={false} rankingMode="preview" forceNeonActive />}
    >
      <TouchlineEliteExactCard player={exact} staticRenderScale={(compact ? 82 : 116) / 430} optimizeForLiveCompact runtimeLocaleOverride={locale} subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" forceNeonActive />
    </TouchlineCardZoom>
  );
}

export default function FantasyGameweekClient({ initialSnapshot, locale }: {
  initialSnapshot: TouchlineFantasySnapshot | null;
  locale: string;
}) {
  const pt = locale === "pt-BR";
  const [live, setLive] = useState<LiveState | null>(initialSnapshot);
  const [formationCode, setFormationCode] = useState(initialSnapshot?.userGameweek?.formationCode ?? "4-3-3");
  const [selections, setSelections] = useState<TouchlineFantasySelection[]>([...(initialSnapshot?.selections ?? [])]);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const snapshot = initialSnapshot;
  const activeGameweek = live?.activeGameweek ?? snapshot?.activeGameweek ?? null;
  const geometry = snapshot?.formationRegistry[formationCode];
  const catalogueById = useMemo(() => new Map((snapshot?.catalogue ?? []).map((card) => [card.canonicalPlayerId ?? card.id, card])), [snapshot]);
  const eligiblePlayers = useMemo(() => (snapshot?.catalogue ?? []).flatMap((card): TouchlineFantasyEligiblePlayer[] => {
    const bucket = touchlineMarketPositionBucket(card.position, card.role === "goalkeeper" ? "goalkeeper" : null);
    const marketValueEur = card.editorialCard?.marketValueEur;
    return bucket !== "outfield" && marketValueEur !== undefined
      ? [{ playerId: card.canonicalPlayerId ?? card.id, clubId: card.clubName, marketValueEur, positionBucket: bucket }]
      : [];
  }), [snapshot]);
  const validation = geometry && snapshot ? validateTouchlineFantasyLineup({ selections, players: eligiblePlayers, geometry, budgetEur: snapshot.config.budgetEur, maxPlayersPerClub: snapshot.config.maxPlayersPerClub, requireComplete: true }) : null;
  const editable = snapshot?.entitlementActive === true && activeGameweek?.state === "MARKET_OPEN";

  useEffect(() => {
    if (!snapshot?.entitlementActive || !activeGameweek || !["LOCKED", "LIVE", "FINAL", "SETTLED"].includes(activeGameweek.state)) return;
    const poll = window.setInterval(() => {
      fetch("/api/touchline-fantasy/state", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (payload?.ok) setLive(payload); }).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(poll);
  }, [activeGameweek, snapshot?.entitlementActive]);

  if (!snapshot) return <section className={styles.unavailable}><h1>TouchLine Fantasy</h1><p>{pt ? "Serviço temporariamente indisponível." : "Service temporarily unavailable."}</p></section>;

  function changeFormation(nextCode: string) {
    const nextGeometry = snapshot!.formationRegistry[nextCode];
    if (!nextGeometry) return;
    const remapped: TouchlineFantasySelection[] = [];
    for (const selection of selections) {
      const player = eligiblePlayers.find((entry) => entry.playerId === selection.playerId);
      if (!player) continue;
      const slotId = assignTouchlineFantasyPlayerToFirstSlot({ player, geometry: nextGeometry, selections: remapped });
      if (slotId) remapped.push({ playerId: player.playerId, slotId });
    }
    setFormationCode(nextCode);
    setSelections(remapped);
    setFeedback(pt ? "Formação alterada; confirme novamente o XI." : "Formation changed; confirm the XI again.");
  }

  function addPlayer(card: ClubOwnerSquadCard) {
    if (!editable || !geometry) return;
    const playerId = card.canonicalPlayerId ?? card.id;
    if (selections.some((selection) => selection.playerId === playerId)) return;
    const player = eligiblePlayers.find((entry) => entry.playerId === playerId);
    const slotId = player ? assignTouchlineFantasyPlayerToFirstSlot({ player, geometry, selections }) : null;
    if (!slotId) return setFeedback(pt ? "Não há vaga compatível nesta formação." : "No compatible slot remains in this formation.");
    setSelections((current) => [...current, { playerId, slotId }]);
    setFeedback(null);
  }

  async function save(action: "draft" | "confirm") {
    if (!activeGameweek || !editable) return;
    if (action === "confirm" && !validation?.valid) return setFeedback(pt ? "Corrija os requisitos do XI antes de confirmar." : "Fix the XI requirements before confirming.");
    setSaving(true); setFeedback(null);
    const response = await fetch("/api/touchline-fantasy/lineup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameweekId: activeGameweek.id, formationCode, selections, action, idempotencyKey: newIdempotencyKey(action) }) });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    setFeedback(response.ok ? (action === "confirm" ? (pt ? "XI confirmado para esta rodada." : "XI confirmed for this Gameweek.") : (pt ? "Rascunho salvo." : "Draft saved.")) : String(payload?.error ?? (pt ? "Não foi possível salvar." : "Unable to save.")));
  }

  async function subscribe() {
    setSaving(true);
    const response = await fetch("/api/touchline-fantasy/subscription", { method: "POST" });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (response.ok && payload?.url) window.location.assign(payload.url);
    else setFeedback(pt ? "Assinatura de teste indisponível no momento." : "Test subscription is currently unavailable.");
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = snapshot.catalogue.filter((card) => {
    const bucket = touchlineMarketPositionBucket(card.position, card.role === "goalkeeper" ? "goalkeeper" : null);
    return (position === "all" || bucket === position) && (!normalizedQuery || `${card.name} ${card.clubName}`.toLowerCase().includes(normalizedQuery));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24));
  const visibleCards = filtered.slice((Math.min(page, pageCount) - 1) * 24, Math.min(page, pageCount) * 24);

  return (
    <div className={styles.shell}>
      <header className={styles.hero}><div><span>TOUCHLINE FANTASY · 2026/27</span><h1>{pt ? "Seu XI. Cada Rating importa." : "Your XI. Every Rating matters."}</h1><p>{pt ? "Escolha 11 cards por rodada. A pontuação vem apenas do Rating oficial TouchLine; hat-trick aplica 2× uma única vez." : "Select 11 cards per Gameweek. Scoring comes only from the official TouchLine Rating; a hat-trick applies 2× once."}</p></div><aside><small>GAMEWEEK SCORE</small><strong>{(live?.gameweekScore ?? 0).toFixed(2)}</strong><span>{pt ? "Temporada" : "Season"} · {(live?.seasonScore ?? 0).toFixed(2)}</span></aside></header>
      <section className={styles.controlRail}><div><CalendarClock /><span>Gameweek</span><strong>{activeGameweek?.number ?? "—"}</strong></div><div><ShieldCheck /><span>{pt ? "Estado" : "State"}</span><strong>{statusCopy(activeGameweek?.state, pt)}</strong></div><div><WalletCards /><span>{pt ? "Orçamento" : "Budget"}</span><strong>{formatTouchlineFantasyMarketValue(validation?.budgetRemainingEur ?? snapshot.config.budgetEur, locale)}</strong></div><div><Crown /><span>XI</span><strong>{selections.length}/11</strong></div></section>
      {!snapshot.entitlementActive ? <section className={styles.paywall}><div><span><Sparkles />TOUCHLINE FANTASY ACCESS</span><h2>{pt ? "Uma assinatura. Um XI por rodada." : "One subscription. One XI per Gameweek."}</h2><p>{pt ? "Edite livremente enquanto o mercado estiver aberto, acompanhe ao vivo e dispute rankings por rodada e temporada." : "Edit freely while the market is open, follow live and compete in Gameweek and season rankings."}</p></div><aside><strong>£29.90</strong><span>{pt ? "por mês · ambiente de teste QA" : "per month · QA test environment"}</span><button type="button" disabled={saving} onClick={subscribe}>{pt ? "Assinar no modo de teste" : "Subscribe in test mode"}</button></aside></section> : null}
      <section className={styles.workspace}>
        <div className={styles.builder}>
          <header><div><span>{pt ? "ESCALAÇÃO DA RODADA" : "GAMEWEEK LINE-UP"}</span><h2>{pt ? "Monte o seu XI" : "Build your XI"}</h2></div><div className={styles.formations}>{Object.keys(snapshot.formationRegistry).map((code) => <button type="button" key={code} onClick={() => changeFormation(code)} disabled={!editable} data-active={code === formationCode ? "true" : undefined}>{code}</button>)}</div></header>
          <TouchlinePitchSurface className={styles.pitch} ariaLabel={pt ? "Campo Fantasy" : "Fantasy pitch"}>{geometry?.slots.map((slot) => {
            const selection = selections.find((entry) => entry.slotId === slot.id);
            const card = selection ? catalogueById.get(selection.playerId) : null;
            return <div className={styles.pitchSlot} key={slot.id} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>{card ? <><TouchlineGoalFacingPitchCard><FantasyCard card={card} locale={locale} compact /></TouchlineGoalFacingPitchCard>{editable ? <button type="button" onClick={() => setSelections((current) => current.filter((entry) => entry.playerId !== selection?.playerId))}>×</button> : null}<b>{card.shortName}</b></> : <span>{slot.id}</span>}</div>;
          })}</TouchlinePitchSurface>
          <footer><div><b>{pt ? "Valor do XI" : "XI value"}</b><strong>{formatTouchlineFantasyMarketValue(validation?.totalMarketValueEur ?? 0, locale)}</strong><span>{snapshot.config.maxPlayersPerClub} {pt ? "por clube" : "per club"}</span></div><div className={styles.validation}>{validation?.issues.map((issue) => <span key={issue}>{issue.replaceAll("_", " ")}</span>)}{validation?.valid ? <span data-valid="true"><Check />{pt ? "XI válido" : "Valid XI"}</span> : null}</div><div><button type="button" onClick={() => save("draft")} disabled={!editable || saving}>{pt ? "Salvar rascunho" : "Save draft"}</button><button className={styles.confirm} type="button" onClick={() => save("confirm")} disabled={!editable || saving || !validation?.valid}><LockKeyhole />{pt ? "Confirmar XI" : "Confirm XI"}</button></div></footer>
          {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
        </div>
        <aside className={styles.deadlinePanel}><span>{pt ? "PRAZO DA RODADA" : "GAMEWEEK DEADLINE"}</span><strong>{activeGameweek ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activeGameweek.locksAt)) : "—"}</strong><p>{pt ? `O XI fica imutável ${snapshot.config.lockOffsetMinutes} minutos antes do primeiro jogo.` : `The XI becomes immutable ${snapshot.config.lockOffsetMinutes} minutes before the first fixture.`}</p>{snapshot.userGameweek?.carriedFromPrevious ? <em>{pt ? "XI anterior copiado como rascunho — confirme novamente." : "Previous XI carried as draft — confirm it again."}</em> : null}</aside>
      </section>
      <section className={styles.market}><header><div><span>TOUCHLINE CARD MARKET</span><h2>{pt ? "Escolha seus jogadores" : "Choose your players"}</h2><p>{snapshot.catalogue.length} {pt ? "cards publicados com valor verificado" : "published cards with verified value"}</p></div><label><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={pt ? "Jogador ou clube" : "Player or club"} /></label><select value={position} onChange={(event) => { setPosition(event.target.value); setPage(1); }}><option value="all">{pt ? "Todas as posições" : "All positions"}</option><option value="goalkeeper">GK</option><option value="centre-back">CB</option><option value="right-back">RB</option><option value="left-back">LB</option><option value="defensive-midfield">DM</option><option value="midfield">MID</option><option value="attacker">ATT</option><option value="centre-forward">ST</option></select></header>
        <div className={styles.cardGrid}>{visibleCards.map((card) => { const selected = selections.some((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id)); return <article key={card.canonicalPlayerId ?? card.id}><TouchlineGoalFacingPitchCard><FantasyCard card={card} locale={locale} /></TouchlineGoalFacingPitchCard><div><b>{card.name}</b><span>{card.clubName} · {card.position}</span><strong>{card.marketValue}</strong><button type="button" disabled={!editable || selected} onClick={() => addPlayer(card)}>{selected ? (pt ? "No XI" : "In XI") : (pt ? "Adicionar ao XI" : "Add to XI")}</button></div></article>; })}</div>
        <footer><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>←</button><span>{Math.min(page, pageCount)} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>→</button></footer>
      </section>
      <section className={styles.rankings}><RankingTable title={pt ? "Ranking da rodada" : "Gameweek ranking"} entries={live?.gameweekRanking ?? []} empty={pt ? "Será publicado após existirem XIs bloqueados." : "Published after locked XIs exist."} /><RankingTable title={pt ? "Ranking da temporada" : "Season ranking"} entries={live?.seasonRanking ?? []} empty={pt ? "Ainda não há resultados finais." : "No final results yet."} /></section>
      <section className={styles.rules}><span>RULES · V1</span><h2>{pt ? "Claras, canônicas e auditáveis" : "Clear, canonical and auditable"}</h2><div><p><b>11</b>{pt ? "jogadores por Gameweek" : "players per Gameweek"}</p><p><b>3</b>{pt ? "máximo por clube real" : "maximum per real club"}</p><p><b>Rating</b>{pt ? "única fonte de pontuação" : "only scoring source"}</p><p><b>2×</b>{pt ? "uma vez ao marcar 3+ gols" : "once for scoring 3+ goals"}</p></div><small>{pt ? "DNP ou Rating não fornecido contribui 0 sem inventar Rating. Rodada dupla soma os Ratings válidos das partidas." : "DNP or missing provider Rating contributes 0 without inventing a Rating. Double Gameweeks sum valid fixture Ratings."}</small></section>
    </div>
  );
}
