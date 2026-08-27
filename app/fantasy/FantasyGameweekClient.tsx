"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Check, ChevronRight, CircleAlert, Crown, Filter, LockKeyhole, Save, Search, Send, ShieldCheck, Sparkles, TimerReset, Trophy, Users, WalletCards } from "lucide-react";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import { touchlineLiveOptimizedClubLogoUrl } from "@/lib/touchlineArena/club-crests";
import { findTouchLineClub, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import type { TouchlineFormationGeometrySlot } from "@/lib/touchlineArena/formation-geometry";
import { touchlineMarketPositionBucket } from "@/lib/touchlineArena/position-eligibility";
import { assignTouchlineFantasyPlayerToFirstSlot, formatTouchlineFantasyDeadline, formatTouchlineFantasyMarketValue, resolveTouchlineFantasyBuilderStep, resolveTouchlineFantasyMarketClock, validateTouchlineFantasyLineup, type TouchlineFantasyBuilderStep, type TouchlineFantasyEligiblePlayer, type TouchlineFantasySelection } from "@/lib/touchlineFantasy/domain";
import type { TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import styles from "./fantasy.module.css";

type LiveState = Pick<NonNullable<TouchlineFantasySnapshot>, "gameweeks" | "activeGameweek" | "userGameweek" | "selections" | "gameweekScore" | "seasonScore" | "matchHistory" | "gameweekRanking" | "seasonRanking" | "lineupAlerts">;
const STEPS: readonly TouchlineFantasyBuilderStep[] = ["coach", "formation", "players", "review", "locked"];

function newIdempotencyKey(action: "draft" | "confirm") { return `fantasy:${action}:${crypto.randomUUID()}`; }
function lineupFingerprint(input: Readonly<{ selectedCoachId: string | null; formationCode: string | null; selections: readonly TouchlineFantasySelection[] }>) {
  return JSON.stringify({
    selectedCoachId: input.selectedCoachId ?? "",
    formationCode: input.formationCode ?? "",
    selections: [...input.selections].sort((first, second) => first.slotId.localeCompare(second.slotId) || first.playerId.localeCompare(second.playerId)),
  });
}
function lineupErrorCopy(code: string, pt: boolean) {
  const messages: Record<string, readonly [string, string]> = {
    TL_FANTASY_BUDGET_EXCEEDED: ["This team exceeds the €900M budget.", "Este time ultrapassa o orçamento de €900M."],
    TL_FANTASY_GAMEWEEK_LOCKED: ["The market is closed for this Gameweek.", "O mercado está fechado para esta rodada."],
    TL_FANTASY_XI_REQUIRES_11: ["Complete exactly 11 players before confirming.", "Complete exatamente 11 jogadores antes de confirmar."],
    TL_FANTASY_SELECTION_INELIGIBLE: ["One selected card is no longer eligible. Replace it and save again.", "Um card escolhido não está mais elegível. Troque-o e salve novamente."],
    TL_FANTASY_ENTITLEMENT_REQUIRED: ["Gameweek access is not active for this account.", "O acesso à rodada não está ativo nesta conta."],
  };
  return messages[code]?.[pt ? 1 : 0] ?? (pt ? "Não foi possível salvar sua equipe." : "Unable to save your team.");
}
function wait(milliseconds: number) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
function countdownUnit(value: number, singular: string, plural: string) { return `${value} ${value === 1 ? singular : plural}`; }
function statusCopy(state: string | undefined, pt: boolean) {
  const values: Record<string, readonly [string, string]> = { UPCOMING: ["Upcoming", "Em breve"], MARKET_OPEN: ["Market open", "Mercado aberto"], LOCKED: ["Locked", "Bloqueada"], LIVE: ["Live", "Ao vivo"], FINAL: ["Final", "Final"], SETTLED: ["Settled", "Liquidada"] };
  return values[state ?? ""]?.[pt ? 1 : 0] ?? "—";
}
function stepLabel(step: TouchlineFantasyBuilderStep, pt: boolean) {
  const labels: Record<TouchlineFantasyBuilderStep, readonly [string, string]> = { coach: ["Coach", "Treinador"], formation: ["Formation", "Formação"], players: ["Starting XI", "11 jogadores"], review: ["Review", "Revisão"], locked: ["Arena sync", "Enviar à Arena"] };
  return labels[step][pt ? 1 : 0];
}
function RankingTable({ title, entries, empty }: { title: string; entries: TouchlineFantasySnapshot["gameweekRanking"]; empty: string }) {
  return <section className={styles.rankingPanel}><h3><Trophy aria-hidden="true" />{title}</h3>{entries.length ? <ol>{entries.slice(0, 20).map((entry) => <li key={entry.rank} data-current-manager={entry.isCurrentManager ? "true" : undefined}><span>#{entry.rank}</span><b>{entry.name}</b><strong>{entry.score.toFixed(2)}</strong></li>)}</ol> : <p>{empty}</p>}</section>;
}
function MarketWindowClock({ gameweeks, locale }: { gameweeks: TouchlineFantasySnapshot["gameweeks"]; locale: string }) {
  const pt = locale === "pt-BR";
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = useMemo(() => nowMs === null ? null : resolveTouchlineFantasyMarketClock(gameweeks, nowMs), [gameweeks, nowMs]);
  const phase = clock?.phase ?? "loading";
  const targetMs = clock?.targetAt ? Date.parse(clock.targetAt) : Number.NaN;
  const remainingMs = nowMs !== null && Number.isFinite(targetMs) ? Math.max(0, targetMs - nowMs) : 0;
  const totalSeconds = Math.floor(remainingMs / 1_000);
  const parts = [
    { value: Math.floor(totalSeconds / 86_400), unit: pt ? "D" : "D" },
    { value: Math.floor((totalSeconds % 86_400) / 3_600), unit: pt ? "H" : "H" },
    { value: Math.floor((totalSeconds % 3_600) / 60), unit: pt ? "M" : "M" },
    { value: totalSeconds % 60, unit: pt ? "S" : "S" },
  ];
  const heading = phase === "closing"
    ? (pt ? "Mercado fecha em" : "Market closes in")
    : phase === "opening"
      ? (pt ? "Mercado reabre em" : "Market reopens in")
      : phase === "awaiting-final"
        ? (pt ? "Reabre após a rodada" : "Reopens after the Gameweek")
        : phase === "syncing"
          ? (pt ? "Atualizando o Markt" : "Updating the Markt")
          : (pt ? "Próxima janela" : "Next window");
  const detail = phase === "awaiting-final"
    ? (pt ? "5 min após o fim da rodada" : "5 min after the Gameweek ends")
    : phase === "syncing"
      ? (pt ? "Sincronizando a janela canônica" : "Syncing the canonical window")
      : clock?.targetAt
        ? `${formatTouchlineFantasyDeadline(clock.targetAt, locale)} · ${pt ? "Londres" : "London"}`
        : (pt ? "Horário em confirmação" : "Time to be confirmed");
  const accessibleCountdown = [
    countdownUnit(parts[0].value, pt ? "dia" : "day", pt ? "dias" : "days"),
    countdownUnit(parts[1].value, pt ? "hora" : "hour", pt ? "horas" : "hours"),
    countdownUnit(parts[2].value, pt ? "minuto" : "minute", pt ? "minutos" : "minutes"),
    countdownUnit(parts[3].value, pt ? "segundo" : "second", pt ? "segundos" : "seconds"),
  ].join(", ");
  const timed = phase === "closing" || phase === "opening";
  return <aside className={styles.marketClock} data-market-clock-phase={phase} aria-label={`${heading}. ${timed ? accessibleCountdown : detail}`}>
    <div className={styles.clockHeading}><i aria-hidden="true"><TimerReset /></i><span><small>TOUCHLINE MARKT</small><b>{heading}</b></span>{clock?.gameweekNumber ? <em>GW {clock.gameweekNumber}</em> : null}</div>
    {timed ? <><div className={styles.clockDigits} aria-hidden="true">{parts.map((part) => <span key={part.unit}><b>{String(part.value).padStart(2, "0")}</b><small>{part.unit}</small></span>)}</div><time className={styles.srOnly} dateTime={clock?.targetAt ?? undefined}>{accessibleCountdown}</time></> : <strong className={styles.clockRule}>{phase === "awaiting-final" ? "+05:00" : "—"}</strong>}
    <p><span aria-hidden="true" />{detail}</p>
  </aside>;
}
function CompactClubIdentity({ clubName, clubLogoUrl, detail }: { clubName: string; clubLogoUrl?: string | null; detail?: string }) {
  const compactLogoUrl = touchlineLiveOptimizedClubLogoUrl(clubLogoUrl);
  return <span className={styles.clubIdentity} data-club-identity="compact">
    {compactLogoUrl ? <Image src={compactLogoUrl} alt="" width={22} height={22} unoptimized loading="eager" aria-hidden="true" /> : <i aria-hidden="true" />}
    <small>{clubName}{detail ? ` · ${detail}` : ""}</small>
  </span>;
}
function slotAccepts(slot: TouchlineFormationGeometrySlot | null, card: ClubOwnerSquadCard) {
  if (!slot) return true;
  const bucket = touchlineMarketPositionBucket(card.position, card.role === "goalkeeper" ? "goalkeeper" : null);
  return bucket !== "outfield" && slot.allowedPositions.includes(bucket);
}

export default function FantasyGameweekClient({ initialSnapshot, locale }: { initialSnapshot: TouchlineFantasySnapshot | null; locale: string }) {
  const pt = locale === "pt-BR";
  const [live, setLive] = useState<LiveState | null>(initialSnapshot);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(initialSnapshot?.userGameweek?.selectedCoachId ?? null);
  const [formationCode, setFormationCode] = useState<string | null>(initialSnapshot?.userGameweek?.formationCode ?? null);
  const [selections, setSelections] = useState<TouchlineFantasySelection[]>([...(initialSnapshot?.selections ?? [])]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [visibleStep, setVisibleStep] = useState<TouchlineFantasyBuilderStep>(selectedCoachId ? (formationCode ? "players" : "formation") : "coach");
  const [query, setQuery] = useState(""); const [clubFilter, setClubFilter] = useState("all");
  const [feedback, setFeedback] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [page, setPage] = useState(1);
  const [deadlineReachedFor, setDeadlineReachedFor] = useState<string | null>(null);
  const snapshot = initialSnapshot; const activeGameweek = live?.activeGameweek ?? snapshot?.activeGameweek ?? null;
  const persistedUserGameweek = live?.userGameweek ?? snapshot?.userGameweek ?? null;
  const persistedSelections = live?.selections ?? snapshot?.selections ?? [];
  const gameweeks = live?.gameweeks ?? snapshot?.gameweeks ?? [];
  const geometry = formationCode ? snapshot?.formationRegistry[formationCode] : null;
  const catalogueById = useMemo(() => new Map((snapshot?.catalogue ?? []).map((card) => [card.canonicalPlayerId ?? card.id, card])), [snapshot]);
  const eligiblePlayers = useMemo(() => (snapshot?.catalogue ?? []).flatMap((card): TouchlineFantasyEligiblePlayer[] => { const bucket = touchlineMarketPositionBucket(card.position, card.role === "goalkeeper" ? "goalkeeper" : null); const marketValueEur = card.editorialCard?.marketValueEur; return bucket !== "outfield" && marketValueEur !== undefined ? [{ playerId: card.canonicalPlayerId ?? card.id, clubId: card.clubName, marketValueEur, positionBucket: bucket }] : []; }), [snapshot]);
  const validation = geometry && snapshot ? validateTouchlineFantasyLineup({ selections, players: eligiblePlayers, geometry, budgetEur: snapshot.config.budgetEur, maxPlayersPerClub: snapshot.config.maxPlayersPerClub, requireComplete: true }) : null;
  const deadlineReached = deadlineReachedFor === activeGameweek?.id;
  const editable = snapshot?.entitlementActive === true && activeGameweek?.state === "MARKET_OPEN" && !deadlineReached;
  const localFingerprint = lineupFingerprint({ selectedCoachId, formationCode, selections });
  const persistedFingerprint = lineupFingerprint({ selectedCoachId: persistedUserGameweek?.selectedCoachId ?? null, formationCode: persistedUserGameweek?.formationCode ?? null, selections: persistedSelections });
  const hasUnsavedChanges = localFingerprint !== persistedFingerprint;
  const lineupConfirmed = persistedUserGameweek?.state === "CONFIRMED" && !hasUnsavedChanges;
  const canonicalStep = resolveTouchlineFantasyBuilderStep({ editable, selectedCoachId, formationCode, selectedCount: selections.length, lineupValid: validation?.valid === true });
  const selectedCoach = snapshot?.coaches.find((entry) => entry.id === selectedCoachId) ?? null;
  const activeSlot = geometry?.slots.find((slot) => slot.id === activeSlotId) ?? geometry?.slots.find((slot) => !selections.some((selection) => selection.slotId === slot.id)) ?? null;

  useEffect(() => { if (!activeGameweek) return; const deadline = Date.parse(activeGameweek.locksAt); if (!Number.isFinite(deadline)) return; const remaining = Math.max(0, deadline - Date.now()); const gameweekId = activeGameweek.id; const timer = window.setTimeout(() => setDeadlineReachedFor(gameweekId), Math.min(remaining, 2_147_000_000)); return () => window.clearTimeout(timer); }, [activeGameweek]);
  useEffect(() => { if (!snapshot?.entitlementActive || !activeGameweek) return; const poll = window.setInterval(() => { fetch("/api/touchline-fantasy/state", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (!payload?.ok) return; setLive(payload); if (payload.activeGameweek?.id !== activeGameweek.id) { setSelectedCoachId(payload.userGameweek?.selectedCoachId ?? null); setFormationCode(payload.userGameweek?.formationCode ?? null); setSelections(Array.isArray(payload.selections) ? payload.selections : []); setVisibleStep(payload.userGameweek?.selectedCoachId ? "players" : "coach"); } }).catch(() => undefined); }, 20_000); return () => window.clearInterval(poll); }, [activeGameweek, snapshot?.entitlementActive]);
  if (!snapshot) return <section className={styles.unavailable}><h1>TouchLine Markt</h1><p>{pt ? "Serviço temporariamente indisponível." : "Service temporarily unavailable."}</p></section>;

  function changeFormation(nextCode: string) { const nextGeometry = snapshot!.formationRegistry[nextCode]; if (!nextGeometry || !editable) return; const remapped: TouchlineFantasySelection[] = []; for (const selection of selections) { const player = eligiblePlayers.find((entry) => entry.playerId === selection.playerId); if (!player) continue; const slotId = assignTouchlineFantasyPlayerToFirstSlot({ player, geometry: nextGeometry, selections: remapped }); if (slotId) remapped.push({ playerId: player.playerId, slotId }); } setFormationCode(nextCode); setSelections(remapped); setActiveSlotId(null); setVisibleStep("players"); setFeedback(pt ? "Formação atualizada. Salve novamente para gravar a alteração." : "Formation updated. Save again to persist the change."); }
  function addPlayer(card: ClubOwnerSquadCard) { if (!editable || !geometry) return; const playerId = card.canonicalPlayerId ?? card.id; if (selections.some((selection) => selection.playerId === playerId)) return; const player = eligiblePlayers.find((entry) => entry.playerId === playerId); const preferred = activeSlot && player && slotAccepts(activeSlot, card) && !selections.some((entry) => entry.slotId === activeSlot.id) ? activeSlot.id : null; const slotId = preferred ?? (player ? assignTouchlineFantasyPlayerToFirstSlot({ player, geometry, selections }) : null); if (!slotId || !player) return setFeedback(pt ? "Não há vaga compatível nesta formação." : "No compatible slot remains in this formation."); const next = [...selections, { playerId, slotId }]; const nextValidation = validateTouchlineFantasyLineup({ selections: next, players: eligiblePlayers, geometry, budgetEur: snapshot.config.budgetEur, maxPlayersPerClub: snapshot.config.maxPlayersPerClub, requireComplete: false }); if (nextValidation.issues.includes("BUDGET_EXCEEDED")) return setFeedback(pt ? "Este card ultrapassa o orçamento disponível." : "This card exceeds the available budget."); setSelections(next); setActiveSlotId(geometry.slots.find((slot) => !next.some((entry) => entry.slotId === slot.id))?.id ?? null); if (next.length === 11) setVisibleStep("review"); setFeedback(null); }
  function removePlayer(playerId: string) { if (!editable) return; const removed = selections.find((entry) => entry.playerId === playerId); setSelections((current) => current.filter((entry) => entry.playerId !== playerId)); setActiveSlotId(removed?.slotId ?? null); setVisibleStep("players"); setFeedback(pt ? "Alteração ainda não salva." : "Change not saved yet."); }
  async function loadPersistedLineup(expectedFingerprint: string, expectedState: "DRAFT" | "CONFIRMED") {
    for (const delay of [0, 300, 800]) {
      if (delay) await wait(delay);
      const response = await fetch("/api/touchline-fantasy/state", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) continue;
      const payload = await response.json().catch(() => null) as (LiveState & { ok?: boolean }) | null;
      if (!payload?.ok || payload.activeGameweek?.id !== activeGameweek?.id || payload.userGameweek?.state !== expectedState || !Array.isArray(payload.selections)) continue;
      const authoritativeFingerprint = lineupFingerprint({ selectedCoachId: payload.userGameweek.selectedCoachId, formationCode: payload.userGameweek.formationCode, selections: payload.selections });
      if (authoritativeFingerprint !== expectedFingerprint) continue;
      setLive(payload);
      setSelectedCoachId(payload.userGameweek.selectedCoachId);
      setFormationCode(payload.userGameweek.formationCode);
      setSelections([...payload.selections]);
      return true;
    }
    return false;
  }
  async function save(action: "draft" | "confirm") {
    if (!activeGameweek || !editable || !selectedCoachId || !formationCode) return;
    if (action === "confirm" && !validation?.valid) return setFeedback(pt ? "Corrija os requisitos do XI antes de confirmar." : "Fix the XI requirements before confirming.");
    setSaving(true); setFeedback(null);
    const expectedFingerprint = lineupFingerprint({ selectedCoachId, formationCode, selections });
    try {
      const response = await fetch("/api/touchline-fantasy/lineup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameweekId: activeGameweek.id, selectedCoachId, formationCode, selections, action, idempotencyKey: newIdempotencyKey(action) }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setFeedback(lineupErrorCopy(String(payload?.error ?? ""), pt));
      const verified = await loadPersistedLineup(expectedFingerprint, action === "confirm" ? "CONFIRMED" : "DRAFT");
      if (!verified) return setFeedback(pt ? "O servidor recebeu o salvamento, mas a verificação ainda não voltou. Atualize a página antes de fazer outra mudança." : "The server received the save, but verification has not returned yet. Refresh before making another change.");
      setFeedback(action === "confirm" ? (pt ? "XI confirmado, gravado e verificado no TouchLine." : "XI confirmed, persisted and verified in TouchLine.") : (pt ? "Rascunho gravado e verificado no TouchLine." : "Draft persisted and verified in TouchLine."));
      if (action === "confirm") setVisibleStep("locked");
    } catch {
      setFeedback(pt ? "A conexão falhou antes da confirmação do salvamento. Tente novamente." : "The connection failed before save confirmation. Try again.");
    } finally {
      setSaving(false);
    }
  }
  async function subscribe() { setSaving(true); const response = await fetch("/api/touchline-fantasy/subscription", { method: "POST" }); const payload = await response.json().catch(() => null); setSaving(false); if (response.ok && payload?.url) window.location.assign(payload.url); else setFeedback(pt ? "Assinatura de teste indisponível no momento." : "Test subscription is currently unavailable."); }

  const normalizedQuery = query.trim().toLowerCase(); const clubs = [...new Set(snapshot.catalogue.map((card) => card.clubName))].sort((a, b) => a.localeCompare(b));
  const filtered = snapshot.catalogue.filter((card) => { const selected = selections.some((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id)); return !selected && slotAccepts(activeSlot ?? null, card) && (clubFilter === "all" || card.clubName === clubFilter) && (!normalizedQuery || `${card.name} ${card.clubName} ${card.position}`.toLowerCase().includes(normalizedQuery)); });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20)); const safePage = Math.min(page, pageCount); const visibleCards = filtered.slice((safePage - 1) * 20, safePage * 20);
  const currentAlerts = live?.lineupAlerts ?? snapshot.lineupAlerts;

  return <div className={styles.shell} data-canonical-step={canonicalStep} data-market-visual="classic">
    <section className={styles.controlRail}><div><CalendarClock /><span>Gameweek</span><strong>{activeGameweek?.number ?? "—"}</strong></div><div><ShieldCheck /><span>{pt ? "Estado" : "State"}</span><strong>{statusCopy(activeGameweek?.state, pt)}</strong></div><div><WalletCards /><span>{pt ? "Restante" : "Remaining"}</span><strong>{formatTouchlineFantasyMarketValue(validation?.budgetRemainingEur ?? snapshot.config.budgetEur, locale)}</strong></div><div><Crown /><span>XI</span><strong>{selections.length}/11</strong></div></section>
    <section className={styles.classicBuilder} aria-labelledby="touchline-markt-title">
      <header className={styles.hero}><div><span>{pt ? "ESCALAÇÃO DA RODADA" : "GAMEWEEK TEAM"}</span><h1 id="touchline-markt-title">{pt ? "Monte seu time TouchLine" : "Build Your TouchLine Team"}</h1><p>{pt ? "Escolha primeiro seu treinador, depois a formação e complete exatamente 11 cards para a rodada." : "Choose your coach first, then formation, and complete exactly 11 cards for the Gameweek."}</p></div><MarketWindowClock gameweeks={gameweeks} locale={locale} /></header>
    <nav className={styles.stepper} aria-label={pt ? "Etapas da escalação" : "Lineup steps"}>{STEPS.map((step, index) => { const complete = (step === "coach" && Boolean(selectedCoachId)) || (step === "formation" && Boolean(formationCode)) || (step === "players" && selections.length === 11) || (step === "review" && lineupConfirmed) || (step === "locked" && !editable); const accessible = step === "coach" || Boolean(selectedCoachId) && (step === "formation" || Boolean(formationCode)); return <button type="button" key={step} disabled={!accessible} onClick={() => setVisibleStep(step)} data-active={visibleStep === step ? "true" : undefined} data-complete={complete ? "true" : undefined}><i>{complete ? <Check /> : index + 1}</i><span>{stepLabel(step, pt)}</span><ChevronRight /></button>; })}</nav>
    {!snapshot.entitlementActive ? <section className={styles.paywall}><div><span><Sparkles />TOUCHLINE GAMEWEEK ACCESS</span><h2>{pt ? "Uma assinatura. Um XI por rodada." : "One subscription. One XI per Gameweek."}</h2><p>{pt ? "O ambiente QA usa apenas cobrança de teste." : "The QA environment uses test billing only."}</p></div><aside><strong>£29.90</strong><span>{pt ? "por mês · QA" : "per month · QA"}</span><button type="button" disabled={saving} onClick={subscribe}>{pt ? "Assinar em modo de teste" : "Subscribe in test mode"}</button></aside></section> : null}
    <main className={styles.workspace}><section className={styles.builder}><header className={styles.sectionHeading}><div><span>{pt ? "PREVIEW EM TEMPO REAL" : "REAL-TIME PREVIEW"}</span><h2>{formationCode ?? (pt ? "Escolha a formação" : "Choose formation")}</h2></div><div><b>{pt ? "Valor usado" : "Used value"}</b><strong>{formatTouchlineFantasyMarketValue(validation?.totalMarketValueEur ?? 0, locale)}</strong></div></header>
      <TouchlinePitchSurface className={styles.pitch} ariaLabel={pt ? "Campo da equipe da rodada" : "Gameweek team pitch"}>{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; const alert = selection ? currentAlerts.some((entry) => entry.playerId === selection.playerId) : false; const openSlot = () => { if (!card) { setActiveSlotId(slot.id); setVisibleStep("players"); } }; return <div className={styles.pitchSlot} role={card ? undefined : "button"} tabIndex={card || !editable ? -1 : 0} aria-label={card ? undefined : `${pt ? "Selecionar jogador para" : "Select player for"} ${slot.id}`} key={slot.id} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onClick={openSlot} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !card) { event.preventDefault(); openSlot(); } }} data-state={!editable ? "locked" : card ? (alert ? "invalid" : "selected") : activeSlot?.id === slot.id ? "active" : "empty"}>{card ? <><span className={styles.pitchCard}><TouchlineGameweekCard card={card} locale={locale} compact displayWidth={62} /></span><b>{card.shortName}</b>{editable ? <i role="button" tabIndex={0} aria-label={`${pt ? "Remover" : "Remove"} ${card.name}`} onClick={(event) => { event.stopPropagation(); removePlayer(selection!.playerId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); removePlayer(selection!.playerId); } }}>×</i> : null}{alert ? <em><CircleAlert />{pt ? "Fora da súmula" : "Not selected"}</em> : null}</> : <><span className={styles.emptySlot}>+</span><b>{slot.id}</b></>}</div>; })}</TouchlinePitchSurface>
      <footer className={styles.pitchFooter}><span>{selectedCoach ? `${selectedCoach.coach.displayName} · ${selectedCoach.clubName}` : (pt ? "Treinador pendente" : "Coach pending")}</span><span>{pt ? "Escolha livre de jogadores por clube" : "No per-club player limit"}</span><strong>{validation?.valid ? <><BadgeCheck />{pt ? "XI válido" : "Valid XI"}</> : `${selections.length}/11`}</strong></footer></section>
      <aside className={styles.guidePanel} tabIndex={0} aria-label={pt ? "Painel de escolha TouchLine" : "TouchLine selection panel"} onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}>{visibleStep === "coach" ? <><span>STEP 1</span><h2>{pt ? "Escolha seu treinador" : "Choose your coach"}</h2><p>{pt ? "Os 20 treinadores oficiais da competição usam a identidade canônica TouchLine." : "The competition's 20 official coaches use canonical TouchLine identity."}</p><div className={styles.coachGrid}>{snapshot.coaches.map((entry) => <button type="button" key={entry.id} disabled={!editable} onClick={() => { setSelectedCoachId(entry.id); setFeedback(pt ? "Treinador atualizado. Salve novamente para gravar a alteração." : "Coach updated. Save again to persist the change."); setVisibleStep("formation"); }} data-selected={entry.id === selectedCoachId ? "true" : undefined}><span><TouchlineCoachCard coach={entry.coach} slot={entry.slot} clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} countryCode3={entry.countryCode3} locale={locale} displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /></span><div className={styles.coachIdentity}><b>{entry.coach.displayName}</b><CompactClubIdentity clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} /></div></button>)}</div></> : null}
      {visibleStep === "formation" ? <><span>STEP 2</span><h2>{pt ? "Escolha a formação" : "Choose formation"}</h2><p>{pt ? "Todas as opções vêm do registro canônico calibrado." : "Every option comes from the calibrated canonical registry."}</p><div className={styles.formationGrid}>{Object.keys(snapshot.formationRegistry).map((code) => <button type="button" key={code} onClick={() => changeFormation(code)} disabled={!editable} data-selected={code === formationCode ? "true" : undefined}><b>{code}</b><small>11 {pt ? "vagas" : "slots"}</small></button>)}</div></> : null}
      {visibleStep === "players" ? <><span>STEP 3</span><h2>{pt ? "Preencha a vaga" : "Fill the slot"}</h2><p>{activeSlot ? `${activeSlot.id} · ${activeSlot.allowedPositions.join(" / ")}` : (pt ? "Selecione uma vaga no campo." : "Select a slot on the pitch.")}</p><div className={styles.filters}><label><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={pt ? "Jogador, clube ou posição" : "Player, club or position"} /></label><label><Filter /><select value={clubFilter} onChange={(event) => { setClubFilter(event.target.value); setPage(1); }}><option value="all">20 {pt ? "clubes" : "clubs"}</option>{clubs.map((club) => <option key={club} value={club}>{club}</option>)}</select></label></div><div className={styles.playerGrid}>{visibleCards.map((card) => <article data-player-choice-card="premium" key={card.canonicalPlayerId ?? card.id}><div className={styles.marketCard}><TouchlineGameweekCard card={card} locale={locale} displayWidth={146} /></div><div className={styles.playerIdentity}><b>{card.name}</b><CompactClubIdentity clubName={card.clubName} clubLogoUrl={findTouchLineClub(card.clubName)?.logoUrl ?? null} detail={card.position} /></div><button type="button" disabled={!editable} onClick={() => addPlayer(card)}>{pt ? "Escolher para esta vaga" : "Choose for this slot"}</button></article>)}</div><footer className={styles.pagination}><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>←</button><span>{safePage} / {pageCount}</span><button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => value + 1)}>→</button></footer></> : null}
      {visibleStep === "review" ? <><span>STEP 4</span><h2>{pt ? "Revise sua equipe" : "Review your team"}</h2><div className={styles.editActions}><button type="button" disabled={!editable} onClick={() => setVisibleStep("coach")}>{pt ? "Trocar treinador" : "Change coach"}</button><button type="button" disabled={!editable} onClick={() => setVisibleStep("players")}>{pt ? "Editar jogadores" : "Edit players"}</button></div><div className={styles.reviewCoach}>{selectedCoach ? <><Crown /><div><b>{selectedCoach.coach.displayName}</b><span>{selectedCoach.clubName}</span></div></> : null}</div><ol className={styles.reviewList}>{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; return <li key={slot.id}><span>{slot.id}</span><b>{card?.name ?? "—"}</b><strong>{card?.marketValue ?? "—"}</strong></li>; })}</ol><div className={styles.validation}>{validation?.issues.map((issue) => <span key={issue}>{issue.replaceAll("_", " ")}</span>)}{validation?.valid ? <span data-valid="true"><Check />{pt ? "Pronto para confirmar" : "Ready to confirm"}</span> : null}</div></> : null}
      {visibleStep === "locked" ? <><span>{editable ? "STEP 5" : "LOCKED SNAPSHOT"}</span><h2>{editable ? (pt ? "Equipe confirmada" : "Confirmed team") : (pt ? "Equipe da rodada bloqueada" : "Gameweek team locked")}</h2>{editable ? <div className={styles.editActions}><button type="button" onClick={() => setVisibleStep("coach")}>{pt ? "Trocar treinador" : "Change coach"}</button><button type="button" onClick={() => setVisibleStep("players")}>{pt ? "Editar jogadores" : "Edit players"}</button></div> : null}<div className={styles.syncPanel}><Send /><p>{lineupConfirmed || !editable ? (pt ? "A mesma identidade canônica, treinador, formação e 11 jogadores está pronta na Arena." : "The same canonical identity, coach, formation and 11 players is ready in Arena.") : (pt ? "Confirme o XI para liberar a sincronização." : "Confirm the XI to enable sync.")}</p><a href={`/arena?lang=${encodeURIComponent(locale)}`} aria-disabled={!(lineupConfirmed || !editable)}>{pt ? "Abrir na Arena" : "Open in Arena"}</a></div></> : null}</aside></main>
    <section className={styles.actionRail}><div><b>{pt ? "Prazo canônico" : "Canonical deadline"}</b><strong>{activeGameweek ? formatTouchlineFantasyDeadline(activeGameweek.locksAt, locale) : "—"}</strong><span>{pt ? `Primeiro jogo − ${snapshot.config.lockOffsetMinutes} min` : `First fixture − ${snapshot.config.lockOffsetMinutes} min`}</span><em data-save-state={hasUnsavedChanges ? "dirty" : persistedUserGameweek?.selectedCoachId ? "saved" : "empty"}>{hasUnsavedChanges ? (pt ? "Alterações não salvas" : "Unsaved changes") : persistedUserGameweek?.selectedCoachId ? (pt ? "Equipe gravada no TouchLine" : "Team saved in TouchLine") : (pt ? "Ainda não salvo" : "Not saved yet")}</em></div><div><button type="button" onClick={() => save("draft")} disabled={!editable || saving || !selectedCoachId || !formationCode || !hasUnsavedChanges}><Save />{pt ? "Salvar rascunho" : "Save draft"}</button><button className={styles.confirm} type="button" onClick={() => save("confirm")} disabled={!editable || saving || !selectedCoachId || !validation?.valid || lineupConfirmed}><LockKeyhole />{pt ? "Confirmar XI" : "Confirm XI"}</button></div></section>
    {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    {currentAlerts.length ? <section className={styles.alertPanel}><CircleAlert /><div><b>{pt ? "Atualização da escalação oficial" : "Official lineup update"}</b><p>{pt ? `${currentAlerts.length} jogador(es) selecionado(s) não aparece(m) entre titulares ou banco. ${editable ? "Você ainda pode editar antes do prazo." : "O prazo encerrou; a equipe permanece imutável."}` : `${currentAlerts.length} selected player(s) are absent from starters and bench. ${editable ? "You can still edit before the deadline." : "The deadline passed; the team remains immutable."}`}</p></div></section> : null}
    </section>
    <section className={styles.rankings}><RankingTable title={pt ? "Ranking da rodada" : "Gameweek ranking"} entries={live?.gameweekRanking ?? []} empty={pt ? "Será publicado após existirem equipes bloqueadas." : "Published after locked teams exist."} /><RankingTable title={pt ? "Ranking da temporada" : "Season ranking"} entries={live?.seasonRanking ?? []} empty={pt ? "Ainda não há resultados finais." : "No final results yet."} /></section>
    <section className={styles.rules}><Users /><div><span>TOUCHLINE GAMEWEEK RULES</span><h2>{pt ? "11 cards. Nenhum banco Fantasy." : "11 cards. No Fantasy bench."}</h2><p>{pt ? "Rating oficial TouchLine é a fonte da rodada; Rating ausente nunca é inventado. O orçamento permanece em €900M." : "Official TouchLine Rating is the Gameweek source; a missing Rating is never invented. Budget remains €900M."}</p></div></section>
  </div>;
}
