"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BadgeCheck, CalendarClock, Check, ChevronRight, CircleAlert, Crown, House, LockKeyhole, PlaneTakeoff, Save, Search, Send, ShieldCheck, Sparkles, TimerReset, Trophy, Users, WalletCards } from "lucide-react";

import TouchlineCoachCardZoom from "@/components/touchline/cards/TouchlineCoachCardZoom";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import TouchlinePitchSurface, { TOUCHLINE_MARKET_HOUSE_CAMPAIGN } from "@/components/touchline/pitch/TouchlinePitchSurface";
import { touchlineLiveOptimizedClubLogoUrl } from "@/lib/touchlineArena/club-crests";
import { findTouchLineClub, TOUCHLINE_ENGLAND_CLUBS_BY_RANK, type ClubOwnerSquadCard, type TouchLineClubVisual } from "@/lib/touchlineArena/demo-data";
import type { TouchlineFormationGeometrySlot } from "@/lib/touchlineArena/formation-geometry";
import { touchlineMarketPositionBucket, touchlineMarketPositionBucketLabel, type TouchlineMarketPositionBucket, type TouchlineRosterRole } from "@/lib/touchlineArena/position-eligibility";
import { assignTouchlineFantasyPlayerToFirstSlot, formatTouchlineFantasyDeadline, formatTouchlineFantasyMarketValue, removeTouchlineFantasyPlayerFromSlot, replaceTouchlineFantasyPlayerAtSlot, resolveTouchlineFantasyBuilderStep, resolveTouchlineFantasyMarketClock, touchlineFantasySlotAcceptsPlayer, validateTouchlineFantasyLineup, type TouchlineFantasyBuilderStep, type TouchlineFantasyEligiblePlayer, type TouchlineFantasySelection } from "@/lib/touchlineFantasy/domain";
import type { TouchlineFantasyCoachView, TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import { TOUCHLINE_FANTASY_BROWSE_POSITIONS, resolveTouchlineFantasyBrowseSlot, touchlineFantasyPitchCardWidth } from "@/lib/touchlineFantasy/market-browser";
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
  const countdownWindowMs = 24 * 60 * 60 * 1_000;
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
  const timed = (clock?.phase === "closing" || clock?.phase === "opening")
    && Number.isFinite(targetMs)
    && remainingMs <= countdownWindowMs;
  const parts = [
    { value: Math.floor(totalSeconds / 3_600), unit: pt ? "H" : "H" },
    { value: Math.floor((totalSeconds % 3_600) / 60), unit: pt ? "M" : "M" },
    { value: totalSeconds % 60, unit: pt ? "S" : "S" },
  ];
  const heading = phase === "closing"
    ? (timed ? (pt ? "Mercado fecha em" : "Market closes in") : (pt ? "Mercado aberto" : "Market open"))
    : phase === "opening"
      ? (timed ? (pt ? "Mercado reabre em" : "Market reopens in") : (pt ? "Mercado fechado" : "Market closed"))
      : phase === "awaiting-final"
        ? (pt ? "Último apito da rodada" : "Last whistle of the round")
        : phase === "syncing"
          ? (pt ? "Atualizando o Meu Clube" : "Updating My Club")
          : (pt ? "Próxima janela" : "Next window");
  const detail = phase === "awaiting-final"
    ? (pt ? "Reabre quando o provedor confirmar o fim do último jogo. Sem horário estimado." : "Reopens when the provider confirms the last match has ended. No estimated time.")
    : phase === "syncing"
      ? (pt ? "Sincronizando a janela canônica" : "Syncing the canonical window")
      : clock?.targetAt
        ? timed
          ? `${formatTouchlineFantasyDeadline(clock.targetAt, locale)} · ${pt ? "Londres" : "London"}`
          : phase === "closing"
            ? (pt ? `Fecha em ${formatTouchlineFantasyDeadline(clock.targetAt, locale)}. O cronômetro inicia 24h antes.` : `Closes ${formatTouchlineFantasyDeadline(clock.targetAt, locale)}. The countdown starts 24 hours before.`)
            : (pt ? `Reabre em ${formatTouchlineFantasyDeadline(clock.targetAt, locale)}. O cronômetro inicia 24h antes.` : `Reopens ${formatTouchlineFantasyDeadline(clock.targetAt, locale)}. The countdown starts 24 hours before.`)
        : (pt ? "Horário em confirmação" : "Time to be confirmed");
  const accessibleCountdown = [
    countdownUnit(parts[0].value, pt ? "hora" : "hour", pt ? "horas" : "hours"),
    countdownUnit(parts[1].value, pt ? "minuto" : "minute", pt ? "minutos" : "minutes"),
    countdownUnit(parts[2].value, pt ? "segundo" : "second", pt ? "segundos" : "seconds"),
  ].join(", ");
  return <aside className={styles.marketClock} data-market-clock-phase={phase} aria-label={`${heading}. ${timed ? accessibleCountdown : detail}`}>
    <div className={styles.clockHeading}><i aria-hidden="true"><TimerReset /></i><span><small>TOUCHLINE · MARKET</small><b>{heading}</b></span>{clock?.gameweekNumber ? <em>GW {clock.gameweekNumber}</em> : null}</div>
    {timed ? <><div className={styles.clockDigits} aria-hidden="true">{parts.map((part) => <span key={part.unit}><b>{String(part.value).padStart(2, "0")}</b><small>{part.unit}</small></span>)}</div><time className={styles.srOnly} dateTime={clock?.targetAt ?? undefined}>{accessibleCountdown}</time></> : <strong className={styles.clockRule}>{phase === "awaiting-final" || phase === "opening" ? "Market Closed" : phase === "closing" ? "Market Open" : phase === "syncing" ? (pt ? "Sincronizando" : "Syncing") : (pt ? "A confirmar" : "To be confirmed")}</strong>}
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
function CompactClubSelector({ selectedTeamId, onSelect, locale }: { selectedTeamId: string; onSelect: (club: TouchLineClubVisual) => void; locale: string }) {
  const pt = locale === "pt-BR";
  return <div className={styles.clubSelector} role="group" aria-label={pt ? "Escolha um clube" : "Choose a club"}>
    {TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club) => <button
      type="button"
      key={club.teamId}
      aria-label={club.name}
      aria-pressed={club.teamId === selectedTeamId}
      onClick={() => onSelect(club)}
    >
      {club.logoUrl ? <Image alt="" aria-hidden="true" draggable={false} height={56} loading="eager" src={club.logoUrl} unoptimized width={56} /> : <span aria-hidden="true">{club.shortCode}</span>}
    </button>)}
  </div>;
}
function FantasyCoachZoom({ entry, locale, eager = false }: { entry: TouchlineFantasyCoachView; locale: string; eager?: boolean }) {
  return <TouchlineCoachCardZoom
    coach={entry.coach}
    slot={entry.slot}
    clubName={entry.clubName}
    clubLogoUrl={entry.clubLogoUrl}
    countryCode3={entry.countryCode3}
    locale={locale}
    contract={null}
    competition={entry.competition}
    profileHref={`/touchline-coaches/${encodeURIComponent(entry.coach.providerId)}?lang=${encodeURIComponent(locale)}`}
    assetLoading={eager ? "eager" : "lazy"}
  />;
}
function canonicalRosterRole(role: string | null | undefined): TouchlineRosterRole | null {
  return role === "goalkeeper" || role === "defender" || role === "midfielder" || role === "forward" ? role : null;
}
function slotAccepts(slot: TouchlineFormationGeometrySlot | null, card: ClubOwnerSquadCard) {
  if (!slot) return true;
  const bucket = touchlineMarketPositionBucket(card.position, canonicalRosterRole(card.role));
  return bucket !== "outfield" && touchlineFantasySlotAcceptsPlayer(slot, {
    playerId: card.canonicalPlayerId ?? card.id,
    clubId: card.clubName,
    marketValueEur: card.editorialCard?.marketValueEur ?? 0,
    positionBucket: bucket,
  });
}

function verticalPitchPosition(slot: TouchlineFormationGeometrySlot) {
  const left = Math.min(88, Math.max(12, slot.y));
  const canonicalTop = Math.min(88, Math.max(12, 100 - slot.x));
  const top = 19 + ((canonicalTop - 12) * 69) / 76;
  return { left: `${left}%`, top: `${top}%` };
}

/** The My Club selector uses the canonical formation geometry on a wide,
 * television-style field: goalkeepers left, forwards right. */
function horizontalMyClubPitchPosition(slot: TouchlineFormationGeometrySlot) {
  return {
    left: `${Math.min(89, Math.max(11, slot.x))}%`,
    top: `${Math.min(86, Math.max(14, slot.y))}%`,
  };
}

export default function FantasyGameweekClient({
  initialSnapshot,
  locale,
  embedded = false,
  initialPlayerClubTeamId,
}: {
  initialSnapshot: TouchlineFantasySnapshot | null;
  locale: string;
  /** The ClubOwner page owns the outer identity/navigation shell. */
  embedded?: boolean;
  /** A validated ClubHub/Ranking hand-off opens that club in the XI selector. */
  initialPlayerClubTeamId?: string | null;
}) {
  const pt = locale === "pt-BR";
  const [live, setLive] = useState<LiveState | null>(initialSnapshot);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(initialSnapshot?.userGameweek?.selectedCoachId ?? null);
  const [formationCode, setFormationCode] = useState<string | null>(initialSnapshot?.userGameweek?.formationCode ?? null);
  const [selections, setSelections] = useState<TouchlineFantasySelection[]>([...(initialSnapshot?.selections ?? [])]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [browsePosition, setBrowsePosition] = useState<Exclude<TouchlineMarketPositionBucket, "outfield"> | null>(null);
  const [pitchCardWidth, setPitchCardWidth] = useState(48);
  const pitchViewportRef = useRef<HTMLDivElement>(null);
  // My Club opens as a collection-first squad workspace. The tactical pitch
  // remains available for deliberate formation work instead of dominating the
  // entire market experience.
  // My Club is pitch-first. The legacy standalone Gameweek builder keeps its
  // own default, but the owner command centre should always make the XI clear.
  const [squadView, setSquadView] = useState<"squad" | "tactical">("tactical");
  const [visibleStep, setVisibleStep] = useState<TouchlineFantasyBuilderStep>(selectedCoachId ? (formationCode ? "players" : "formation") : "coach");
  const [query, setQuery] = useState("");
  const [playerClubTeamId, setPlayerClubTeamId] = useState(() => (
    TOUCHLINE_ENGLAND_CLUBS_BY_RANK.some((club) => club.teamId === initialPlayerClubTeamId)
      ? initialPlayerClubTeamId!
      : TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0]?.teamId ?? ""
  ));
  const [coachClubTeamId, setCoachClubTeamId] = useState(TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0]?.teamId ?? "");
  const [feedback, setFeedback] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const [deadlineReachedFor, setDeadlineReachedFor] = useState<string | null>(null);
  const builderRef = useRef<HTMLElement>(null);
  const guidePanelRef = useRef<HTMLElement>(null);
  const snapshot = initialSnapshot; const activeGameweek = live?.activeGameweek ?? snapshot?.activeGameweek ?? null;
  const persistedUserGameweek = live?.userGameweek ?? snapshot?.userGameweek ?? null;
  const persistedSelections = live?.selections ?? snapshot?.selections ?? [];
  const gameweeks = live?.gameweeks ?? snapshot?.gameweeks ?? [];
  const geometry = formationCode ? snapshot?.formationRegistry[formationCode] : null;
  const catalogueById = useMemo(() => new Map((snapshot?.catalogue ?? []).map((card) => [card.canonicalPlayerId ?? card.id, card])), [snapshot]);
  const eligiblePlayers = useMemo(() => (snapshot?.catalogue ?? []).flatMap((card): TouchlineFantasyEligiblePlayer[] => { const bucket = touchlineMarketPositionBucket(card.position, canonicalRosterRole(card.role)); const marketValueEur = card.editorialCard?.marketValueEur; return bucket !== "outfield" && marketValueEur !== undefined ? [{ playerId: card.canonicalPlayerId ?? card.id, clubId: card.clubName, marketValueEur, positionBucket: bucket }] : []; }), [snapshot]);
  const validation = geometry && snapshot ? validateTouchlineFantasyLineup({ selections, players: eligiblePlayers, geometry, budgetEur: snapshot.config.budgetEur, maxPlayersPerClub: snapshot.config.maxPlayersPerClub, requireComplete: true }) : null;
  const deadlineReached = deadlineReachedFor === activeGameweek?.id;
  const editable = snapshot?.entitlementActive === true && activeGameweek?.state === "MARKET_OPEN" && !deadlineReached;
  const localFingerprint = lineupFingerprint({ selectedCoachId, formationCode, selections });
  const persistedFingerprint = lineupFingerprint({ selectedCoachId: persistedUserGameweek?.selectedCoachId ?? null, formationCode: persistedUserGameweek?.formationCode ?? null, selections: persistedSelections });
  const hasUnsavedChanges = localFingerprint !== persistedFingerprint;
  const lineupConfirmed = persistedUserGameweek?.state === "CONFIRMED" && !hasUnsavedChanges;
  const canonicalStep = resolveTouchlineFantasyBuilderStep({ editable, selectedCoachId, formationCode, selectedCount: selections.length, lineupValid: validation?.valid === true });
  const selectedCoach = snapshot?.coaches.find((entry) => entry.id === selectedCoachId) ?? null;
  // A complete XI must still expose a usable replacement market. Keep a real
  // position active whenever the chosen formation has slots.
  const activeSlot = geometry?.slots.find((slot) => slot.id === activeSlotId)
    ?? geometry?.slots.find((slot) => !selections.some((selection) => selection.slotId === slot.id))
    ?? geometry?.slots[0]
    ?? null;
  const browsingPosition = browsePosition ?? activeSlot?.allowedPositions[0] ?? "goalkeeper";
  const browseSlot = resolveTouchlineFantasyBrowseSlot({ geometry, bucket: browsingPosition, activeSlotId: activeSlot?.id ?? null, selections });

  useEffect(() => {
    const pitch = pitchViewportRef.current?.firstElementChild as HTMLElement | null;
    if (!pitch || !geometry) return;
    const resize = () => setPitchCardWidth(touchlineFantasyPitchCardWidth(geometry.slots, pitch.offsetWidth, pitch.offsetHeight));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(pitch);
    return () => observer.disconnect();
  }, [embedded, geometry, selectedCoach, squadView]);

  useEffect(() => { if (!activeGameweek) return; const deadline = Date.parse(activeGameweek.locksAt); if (!Number.isFinite(deadline)) return; const remaining = Math.max(0, deadline - Date.now()); const gameweekId = activeGameweek.id; const timer = window.setTimeout(() => setDeadlineReachedFor(gameweekId), Math.min(remaining, 2_147_000_000)); return () => window.clearTimeout(timer); }, [activeGameweek]);
  useEffect(() => { if (!snapshot?.entitlementActive || !activeGameweek) return; const poll = window.setInterval(() => { fetch("/api/touchline-fantasy/state", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (!payload?.ok) return; setLive(payload); if (payload.activeGameweek?.id !== activeGameweek.id) { setSelectedCoachId(payload.userGameweek?.selectedCoachId ?? null); setFormationCode(payload.userGameweek?.formationCode ?? null); setSelections(Array.isArray(payload.selections) ? payload.selections : []); setVisibleStep(payload.userGameweek?.selectedCoachId ? "players" : "coach"); } }).catch(() => undefined); }, 20_000); return () => window.clearInterval(poll); }, [activeGameweek, snapshot?.entitlementActive]);
  useEffect(() => {
    const builder = builderRef.current;
    const guidePanel = guidePanelRef.current;
    if (!builder || !guidePanel) return;
    const synchroniseHeight = () => {
      const height = Math.ceil(builder.getBoundingClientRect().height);
      if (height > 0) guidePanel.style.setProperty("--market-guide-height", `${height}px`);
    };
    synchroniseHeight();
    const observer = new ResizeObserver(synchroniseHeight);
    observer.observe(builder);
    window.addEventListener("resize", synchroniseHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", synchroniseHeight);
    };
  }, []);
  if (!snapshot) return <section className={styles.unavailable} data-fantasy-context={embedded ? "my-club" : "standalone"}><h1>{pt ? "Meu Clube" : "My Club"}</h1><p>{pt ? "Serviço temporariamente indisponível." : "Service temporarily unavailable."}</p></section>;

  function changeFormation(nextCode: string) { const nextGeometry = snapshot!.formationRegistry[nextCode]; if (!nextGeometry || !editable) return; const remapped: TouchlineFantasySelection[] = []; for (const selection of selections) { const player = eligiblePlayers.find((entry) => entry.playerId === selection.playerId); if (!player) continue; const slotId = assignTouchlineFantasyPlayerToFirstSlot({ player, geometry: nextGeometry, selections: remapped }); if (slotId) remapped.push({ playerId: player.playerId, slotId }); } setFormationCode(nextCode); setSelections(remapped); setActiveSlotId(null); setBrowsePosition(null); setVisibleStep("players"); setFeedback(pt ? "Formação atualizada. Salve novamente para gravar a alteração." : "Formation updated. Save again to persist the change."); }
  function addPlayer(card: ClubOwnerSquadCard) {
    if (!editable || !geometry) return false;
    const playerId = card.canonicalPlayerId ?? card.id;
    const player = eligiblePlayers.find((entry) => entry.playerId === playerId);
    if (!player) { setFeedback(pt ? "Este card não está elegível nesta rodada." : "This card is not eligible for this Gameweek."); return false; }

    // A selected slot is intentional: never silently put an incompatible card
    // into some other empty position (for example, a full-back into attack).
    if (activeSlot && !touchlineFantasySlotAcceptsPlayer(activeSlot, player)) {
      setFeedback(pt ? "Este card não é elegível para a vaga selecionada." : "This card is not eligible for the selected slot."); return false;
    }
    const slotId = activeSlot?.id ?? assignTouchlineFantasyPlayerToFirstSlot({ player, geometry, selections });
    const slot = slotId ? geometry.slots.find((entry) => entry.id === slotId) ?? null : null;
    if (!slot) { setFeedback(pt ? "Não há vaga compatível nesta formação." : "No compatible slot remains in this formation."); return false; }
    const next = replaceTouchlineFantasyPlayerAtSlot({ selections, slot, player });
    if (!next) { setFeedback(pt ? "Este card já está em outra vaga da sua equipe." : "This card is already in another slot in your team."); return false; }
    const nextValidation = validateTouchlineFantasyLineup({ selections: next, players: eligiblePlayers, geometry, budgetEur: snapshot.config.budgetEur, maxPlayersPerClub: snapshot.config.maxPlayersPerClub, requireComplete: false });
    if (nextValidation.issues.includes("BUDGET_EXCEEDED")) { setFeedback(pt ? "Este card ultrapassa o orçamento disponível." : "This card exceeds the available budget."); return false; }
    setSelections([...next]);
    setActiveSlotId(geometry.slots.find((entry) => !next.some((selection) => selection.slotId === entry.id))?.id ?? null);
    if (next.length === 11) setVisibleStep("review");
    setFeedback(null);
    return true;
  }
  function removePlayer(playerId: string) {
    if (!editable) return;
    const removed = selections.find((entry) => entry.playerId === playerId);
    if (!removed) return;
    setSelections((current) => [...removeTouchlineFantasyPlayerFromSlot(current, removed.slotId)]);
    setActiveSlotId(removed.slotId);
    setVisibleStep("players");
    setFeedback(pt ? "Alteração ainda não salva." : "Change not saved yet.");
  }
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

  const normalizedQuery = query.trim().toLowerCase();
  const selectedPlayerClub = TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find((club) => club.teamId === playerClubTeamId) ?? TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0] ?? null;
  const selectedCoachClub = TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find((club) => club.teamId === coachClubTeamId) ?? TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0] ?? null;
  const filtered = snapshot.catalogue.filter((card) => {
    const selected = selections.some((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id));
    const cardClub = findTouchLineClub(card.clubName);
    return !selected
      && slotAccepts(activeSlot ?? null, card)
      // Both entry points constrain the catalogue to the selected position
      // and canonical club identity.
      && cardClub?.teamId === selectedPlayerClub?.teamId
      && (!normalizedQuery || `${card.name} ${card.position}`.toLowerCase().includes(normalizedQuery));
  });
  const filteredCoaches = snapshot.coaches.filter((entry) => findTouchLineClub(entry.clubName)?.teamId === selectedCoachClub?.teamId);
  // The review catalogue stays available when closed, including cards already
  // in the XI. Browsing never calls the lineup mutation functions.
  const browseCards = snapshot.catalogue.filter((card) => (
    touchlineMarketPositionBucket(card.position, canonicalRosterRole(card.role)) === browsingPosition
    && findTouchLineClub(card.clubName)?.teamId === selectedPlayerClub?.teamId
    && (!normalizedQuery || `${card.name} ${card.position}`.toLowerCase().includes(normalizedQuery))
  ));
  const currentAlerts = live?.lineupAlerts ?? snapshot.lineupAlerts;

  // My Club is a club command centre, not the legacy step-by-step Gameweek
  // wizard. The same canonical eligibility and persistence code remains in
  // charge; only the authenticated presentation changes.
  if (embedded) {
    const selectedCards = geometry?.slots.map((slot) => ({
      slot,
      selection: selections.find((entry) => entry.slotId === slot.id) ?? null,
    })) ?? [];
    const selectedCount = selectedCards.filter(({ selection }) => selection).length;
    // Selecting a slot always opens the tactical selector. The premium card
    // board is the default overview, while the field remains the deliberate,
    // visible way to place or replace a player by position.
    const openTacticalSelector = (slotId: string) => {
      setActiveSlotId(slotId);
      setBrowsePosition(null);
      setVisibleStep("players");
      setSquadView("tactical");
      window.requestAnimationFrame(() => document.getElementById("my-club-player-selection")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    const selectMyClubPlayer = (card: ClubOwnerSquadCard) => {
      if (!browseSlot || browseSlot.id !== activeSlot?.id) return;
      if (!addPlayer(card)) return;
      setBrowsePosition(null);
      setSquadView("tactical");
      window.requestAnimationFrame(() => document.getElementById("my-club-xi-pitch")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    return <section className={styles.myClubCommand} data-fantasy-context="my-club" data-market-state={activeGameweek?.state ?? "unknown"} aria-label={pt ? "Central do Meu Clube" : "My Club command centre"}>
      <section className={styles.myClubMarketStatus} aria-label={pt ? "Estado do mercado" : "Market status"}>
        <div><span>{pt ? "MERCADO DE TRANSFERÊNCIAS" : "TRANSFER MARKET"}</span><strong>{activeGameweek?.state === "MARKET_OPEN" && !deadlineReached ? "Market Open" : "Market Closed"}</strong><small>{editable ? (pt ? "Escolha uma posição para gerenciar o XI" : "Choose a position to manage the XI") : (pt ? "Consulte todos os clubes, posições e perfis. Alterações no XI estão bloqueadas." : "Browse every club, position and profile. XI changes are locked.")}</small><p className={styles.myClubMarketRule}>{pt ? "Fecha no apito inicial do primeiro jogo da rodada. Reabre após a confirmação do apito final do último jogo pelo provedor." : "Closes at the first match kickoff of the round. Reopens after the provider confirms the final whistle of the last match."}</p></div>
        <MarketWindowClock gameweeks={gameweeks} locale={locale} />
      </section>
      <header className={styles.myClubCommandHeader}>
        <div>
          <span>{pt ? "MEU XI" : "MY XI"}</span>
          <h1>{formationCode ?? (pt ? "Defina sua formação" : "Set your formation")}</h1>
          <p>{!selectedCoach
            ? (pt ? "Escolha primeiro o treinador do seu clube." : "Choose your club coach first.")
            : !formationCode
              ? (pt ? "Agora escolha a formação antes de montar os 11 jogadores." : "Now choose a formation before building the 11 players.")
              : editable ? (pt ? "Escolha um card para trocar ou remover. A seleção mostra apenas atletas elegíveis para a posição." : "Select a card to replace or remove it. The selection only shows players eligible for that position.") : (pt ? "Seu XI está preservado. Explore as posições abaixo e abra qualquer card para ver o perfil." : "Your XI is preserved. Explore positions below and open any card to view its profile.")}</p>
        </div>
        <div className={styles.myClubCommandStatus}>
          <span>{pt ? "Gameweek" : "Gameweek"}</span><strong>{activeGameweek?.number ?? "—"}</strong>
          <small>{statusCopy(activeGameweek?.state, pt)}</small>
        </div>
      </header>
      {!selectedCoach ? <section className={styles.myClubSetup} data-my-club-setup="coach" aria-label={pt ? "Escolha de treinador" : "Coach selection"}>
        <header><span>STEP 1</span><h2>{pt ? "Escolha seu treinador" : "Choose your coach"}</h2><p>{pt ? "Selecione um clube para ver o treinador canônico e continue para a formação." : "Select a club to see its canonical coach, then continue to formation."}</p></header>
        <CompactClubSelector selectedTeamId={selectedCoachClub?.teamId ?? ""} onSelect={(club) => setCoachClubTeamId(club.teamId)} locale={locale} />
        <div className={styles.myClubCoachResults}>{filteredCoaches.map((entry) => <article key={entry.id}><span><FantasyCoachZoom entry={entry} locale={locale} eager /></span><div><strong>{entry.coach.displayName}</strong><CompactClubIdentity clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} /></div><button type="button" disabled={!editable} onClick={() => { setSelectedCoachId(entry.id); setVisibleStep("formation"); setFeedback(pt ? "Treinador escolhido. Agora escolha a formação." : "Coach chosen. Now choose a formation."); }}>{pt ? "Escolher treinador" : "Choose coach"}</button></article>)}{filteredCoaches.length === 0 ? <p>{pt ? "Nenhum treinador canônico disponível para este clube." : "No canonical coach is available for this club."}</p> : null}</div>
      </section> : !formationCode ? <section className={styles.myClubSetup} data-my-club-setup="formation" aria-label={pt ? "Escolha de formação" : "Formation selection"}>
        <header><span>STEP 2</span><h2>{pt ? "Escolha a formação" : "Choose formation"}</h2><p>{pt ? "A formação canônica abre as 11 vagas elegíveis para montagem." : "The canonical formation opens the 11 eligible slots for your build."}</p></header>
        <div className={styles.formationGrid}>{Object.keys(snapshot.formationRegistry).map((code) => <button type="button" key={code} onClick={() => changeFormation(code)} disabled={!editable}><b>{code}</b><small>11 {pt ? "vagas" : "slots"}</small></button>)}</div>
      </section> : <div className={styles.myClubCommandGrid}>
        <section className={styles.myClubSquad} id="my-club-xi-pitch" aria-label={pt ? "Seu XI por linhas" : "Your XI by lines"}>
          <header><div><span>{pt ? "ELENCO TITULAR" : "STARTING XI"}</span><strong>{selectedCount}/11</strong></div><button type="button" className={styles.viewToggle} onClick={() => setSquadView((current) => current === "squad" ? "tactical" : "squad")}>{squadView === "squad" ? (pt ? "Ver visão tática" : "View tactical layout") : (pt ? "Ver cards" : "View cards")}</button></header>
          {squadView === "tactical" ? <>
            <div className={styles.myClubPitchViewport} ref={pitchViewportRef}>
              <TouchlinePitchSurface className={styles.myClubTacticalPitch} ariaLabel={pt ? "Campo tático interativo" : "Interactive tactical field"} orientation="horizontal" surfaceVariant="premium-stadium">{selectedCards.map(({ slot, selection }) => {
                const card = selection ? catalogueById.get(selection.playerId) : null;
                const action = card ? (pt ? "Trocar" : "Replace") : (pt ? "Adicionar" : "Add");
                return <div key={slot.id} className={styles.myClubTacticalSlot} data-pitch-edge={slot.x >= 75 ? "end" : undefined} style={{ ...horizontalMyClubPitchPosition(slot), width: Math.max(44, pitchCardWidth) }}>
                  <span style={{ width: pitchCardWidth, "--touchline-card-static-scale": pitchCardWidth / 430 } as CSSProperties}>{card ? <TouchlineGameweekCard card={card} locale={locale} compact displayWidth={pitchCardWidth} /> : <i>+</i>}</span>
                  <b>{slot.id}</b>
                  {editable ? <button type="button" data-slot-action={card ? "replace" : "add"} onClick={() => openTacticalSelector(slot.id)} aria-label={`${action} ${slot.id}`}>{action}</button> : <small className={styles.marketClosedLabel}>Market Closed</small>}
                </div>;
              })}</TouchlinePitchSurface>
            </div>
            <nav className={styles.myClubMobileSlotNav} aria-label={pt ? "Explore uma posição" : "Browse a position"}>
              {selectedCards.map(({ slot, selection }) => {
                const card = selection ? catalogueById.get(selection.playerId) : null;
                return <button type="button" key={slot.id} onClick={() => openTacticalSelector(slot.id)} data-active={activeSlot?.id === slot.id ? "true" : undefined}>
                  <b>{slot.id}</b><span>{card?.shortName ?? (pt ? "Vaga" : "Open")}</span>
                </button>;
              })}
            </nav>
          </> : <div className={styles.myClubCardRows}>{selectedCards.map(({ slot, selection }) => {
            const card = selection ? catalogueById.get(selection.playerId) : null;
            const active = activeSlot?.id === slot.id;
            return <article key={slot.id} data-active={active ? "true" : undefined} data-empty={!card ? "true" : undefined}>
              <span className={styles.myClubPosition}>{slot.id}</span>
              {card ? <span className={styles.myClubCard}><TouchlineGameweekCard card={card} locale={locale} displayWidth={116} fitContainer /></span> : <span className={styles.myClubEmptyCard}>+</span>}
              <strong>{card?.shortName ?? (pt ? "Vaga aberta" : "Open slot")}</strong>
              {editable ? <button type="button" className={styles.myClubSelect} onClick={() => openTacticalSelector(slot.id)} aria-label={`${card ? (pt ? "Trocar" : "Replace") : (pt ? "Escolher" : "Choose")} ${slot.id}`}>{card ? (pt ? "Trocar" : "Replace") : (pt ? "Escolher" : "Choose")}</button> : <small className={styles.marketClosedLabel}>Market Closed</small>}
              {card && editable ? <button className={styles.myClubRemove} type="button" onClick={() => removePlayer(selection!.playerId)} aria-label={`${pt ? "Remover" : "Remove"} ${card.name}`}>{pt ? "Remover" : "Remove"}</button> : null}
            </article>;
          })}</div>}
        </section>
      </div>}
        <aside className={styles.myClubMarket} id="my-club-player-selection" data-open="true" aria-label={pt ? "Seleção por posição" : "Position selection"}>
          <header className={styles.myClubMarketHeading}><span>MY CLUB · SCOUTING</span><h2>Market Transfer TouchLine</h2><p>{pt ? "Explore o clube. Escolha a posição. Conheça cada atleta." : "Explore the club. Choose a position. Discover every player."}</p></header>
          <label className={styles.myClubSearch}><Search aria-hidden="true" /><span className={styles.srOnly}>{pt ? "Pesquisar jogador" : "Search player"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pt ? "Pesquisar jogador" : "Search player"} /></label>
          <CompactClubSelector selectedTeamId={selectedPlayerClub?.teamId ?? ""} onSelect={(club) => setPlayerClubTeamId(club.teamId)} locale={locale} />
          <nav className={styles.myClubPositionTabs} aria-label={pt ? "Posições dos jogadores" : "Player positions"}>{TOUCHLINE_FANTASY_BROWSE_POSITIONS.map((position) => <button key={position.bucket} type="button" className={styles.viewToggle} aria-pressed={browsingPosition === position.bucket} aria-controls="my-club-position-results" aria-label={touchlineMarketPositionBucketLabel(position.bucket, locale)} onClick={() => {
            setBrowsePosition(position.bucket);
            const slot = resolveTouchlineFantasyBrowseSlot({ geometry, bucket: position.bucket, activeSlotId: activeSlot?.id ?? null, selections });
            if (slot) setActiveSlotId(slot.id);
          }}>{position.code}</button>)}</nav>
          <header className={styles.myClubSelectionSummary} aria-live="polite"><div><span>{pt ? "SELEÇÃO DE JOGADORES" : "PLAYER SELECTION"}</span><h3>{touchlineMarketPositionBucketLabel(browsingPosition, locale)}</h3><p>{selectedPlayerClub?.name} · {browseCards.length} {pt ? "cards nesta posição" : "cards in this position"}</p></div><p>{editable && browseSlot ? (pt ? `Vaga do XI: ${browseSlot.id}` : `XI slot: ${browseSlot.id}`) : !editable ? (pt ? "Modo consulta · mercado fechado" : "Review mode · market closed") : (pt ? "Consulte os cards; escolha treinador e formação para montar o XI." : "Browse cards; choose a coach and formation to build the XI.")}</p></header>
          <div className={styles.myClubMarketResults} id="my-club-position-results">{browseCards.map((card) => {
            const inLineup = selections.some((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id));
            const tierKey = card.editorialCard?.tierKey;
            const palette = tierKey ? touchlineCardTierPalette(tierKey) : null;
            return <article key={card.canonicalPlayerId ?? card.id}
              data-market-tier-frame={tierKey ?? "unresolved"}
              style={{ "--tier-accent": palette?.accent } as CSSProperties}>
              <TouchlineClubPerimeterTrace accent={palette?.accent} />
              <span><TouchlineGameweekCard card={card} locale={locale} displayWidth={126} fitContainer /></span>
              <div>
                <strong>{card.name}</strong><small>{card.position}</small><em>{card.clubName}</em>
                {!editable ? <span className={styles.marketClosedLabel}>Market Closed</span>
                  : inLineup ? <span className={styles.marketClosedLabel}>{pt ? "No seu XI" : "In your XI"}</span>
                  : browseSlot && browseSlot.id === activeSlot?.id && selectedCoach
                    ? <button type="button" onClick={() => selectMyClubPlayer(card)}>{selections.some((entry) => entry.slotId === browseSlot.id) ? (pt ? `Substituir · ${browseSlot.id}` : `Replace · ${browseSlot.id}`) : (pt ? `Escolher · ${browseSlot.id}` : `Choose · ${browseSlot.id}`)}</button>
                    : <span className={styles.marketClosedLabel}>{pt ? "Somente consulta" : "Review only"}</span>}
              </div>
            </article>;
          })}{browseCards.length === 0 ? <p>{pt ? "Nenhum card publicado para esta posição neste clube. Experimente outra posição ou clube." : "No published card for this position at this club. Try another position or club."}</p> : null}</div>
        </aside>
      <footer className={styles.myClubGameweekFooter}><div><span>{pt ? "GAMEWEEK" : "GAMEWEEK"}</span><strong>{lineupConfirmed ? (pt ? "XI confirmado" : "XI confirmed") : validation?.valid ? (pt ? "Pronto para confirmar" : "Ready to confirm") : `${selectedCount}/11`}</strong></div><div><small>{hasUnsavedChanges ? (pt ? "Alterações não salvas" : "Unsaved changes") : (pt ? "Elenco sincronizado" : "Squad synced")}</small><button type="button" disabled={!editable || saving || !selectedCoachId || !validation?.valid || lineupConfirmed} onClick={() => save("confirm")}>{pt ? "Confirmar XI" : "Confirm XI"}</button></div></footer>
      {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    </section>;
  }

  return <div className={styles.shell} data-canonical-step={canonicalStep} data-market-visual="my-club" data-fantasy-context={embedded ? "my-club" : "standalone"}>
    <section className={styles.controlRail}><div><CalendarClock /><span>Gameweek</span><strong>{activeGameweek?.number ?? "—"}</strong></div><div><ShieldCheck /><span>{pt ? "Estado" : "State"}</span><strong>{statusCopy(activeGameweek?.state, pt)}</strong></div><div><WalletCards /><span>{pt ? "Restante" : "Remaining"}</span><strong>{formatTouchlineFantasyMarketValue(validation?.budgetRemainingEur ?? snapshot.config.budgetEur, locale)}</strong></div><div><Crown /><span>XI</span><strong>{selections.length}/11</strong></div></section>
    <section className={styles.classicBuilder} aria-labelledby="touchline-markt-title">
      <header className={styles.hero}><div><span>{pt ? "ESCALAÇÃO DA RODADA" : "GAMEWEEK TEAM"}</span><h1 id="touchline-markt-title">{pt ? "Monte seu time TouchLine" : "Build Your TouchLine Team"}</h1><p>{pt ? "Escolha primeiro seu treinador, depois a formação e complete exatamente 11 cards para a rodada." : "Choose your coach first, then formation, and complete exactly 11 cards for the Gameweek."}</p></div><MarketWindowClock gameweeks={gameweeks} locale={locale} /></header>
    <nav className={styles.stepper} aria-label={pt ? "Etapas da escalação" : "Lineup steps"}>{STEPS.map((step, index) => { const complete = (step === "coach" && Boolean(selectedCoachId)) || (step === "formation" && Boolean(formationCode)) || (step === "players" && selections.length === 11) || (step === "review" && lineupConfirmed) || (step === "locked" && !editable); const accessible = step === "coach" || Boolean(selectedCoachId) && (step === "formation" || Boolean(formationCode)); return <button type="button" key={step} disabled={!accessible} onClick={() => setVisibleStep(step)} data-active={visibleStep === step ? "true" : undefined} data-complete={complete ? "true" : undefined}><i>{complete ? <Check /> : index + 1}</i><span>{stepLabel(step, pt)}</span><ChevronRight /></button>; })}</nav>
    {!snapshot.entitlementActive ? <section className={styles.paywall}><div><span><Sparkles />TOUCHLINE GAMEWEEK ACCESS</span><h2>{pt ? "Uma assinatura. Um XI por rodada." : "One subscription. One XI per Gameweek."}</h2><p>{pt ? "O ambiente QA usa apenas cobrança de teste." : "The QA environment uses test billing only."}</p></div><aside><strong>£29.90</strong><span>{pt ? "por mês · QA" : "per month · QA"}</span><button type="button" disabled={saving} onClick={subscribe}>{pt ? "Assinar em modo de teste" : "Subscribe in test mode"}</button></aside></section> : null}
    <main className={styles.workspace}><section className={styles.builder} ref={builderRef}><header className={styles.sectionHeading}><div><span>{pt ? "MEU ELENCO" : "MY SQUAD"}</span><h2>{formationCode ?? (pt ? "Escolha a formação" : "Choose formation")}</h2></div><div><b>{pt ? "Valor usado" : "Used value"}</b><strong>{formatTouchlineFantasyMarketValue(validation?.totalMarketValueEur ?? 0, locale)}</strong><button className={styles.viewToggle} type="button" onClick={() => setSquadView((current) => current === "squad" ? "tactical" : "squad")}>{squadView === "squad" ? (pt ? "Ver campo tático" : "View tactical pitch") : (pt ? "Ver elenco" : "View squad")}</button></div></header>
      {squadView === "tactical" ? <TouchlinePitchSurface advertisingCampaign={TOUCHLINE_MARKET_HOUSE_CAMPAIGN} className={styles.pitch} ariaLabel={pt ? "Campo tático da equipe da rodada" : "Gameweek tactical pitch"} orientation="vertical" surfaceVariant="premium-stadium">{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; const alert = selection ? currentAlerts.some((entry) => entry.playerId === selection.playerId) : false; const openSlot = () => { if (editable) { setActiveSlotId(slot.id); setVisibleStep("players"); } }; return <div className={styles.pitchSlot} role={editable ? "button" : undefined} tabIndex={editable ? 0 : -1} aria-label={`${card ? (pt ? "Trocar" : "Replace") : (pt ? "Selecionar jogador para" : "Select player for")} ${slot.id}`} key={slot.id} style={verticalPitchPosition(slot)} onClick={openSlot} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && editable) { event.preventDefault(); openSlot(); } }} data-state={!editable ? "locked" : card ? (alert ? "invalid" : "selected") : activeSlot?.id === slot.id ? "active" : "empty"}>{card ? <><span className={styles.pitchCard}><TouchlineGameweekCard card={card} locale={locale} compact displayWidth={62} /></span><b>{card.shortName}</b>{editable ? <i role="button" tabIndex={0} aria-label={`${pt ? "Remover" : "Remove"} ${card.name}`} onClick={(event) => { event.stopPropagation(); removePlayer(selection!.playerId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); removePlayer(selection!.playerId); } }}>×</i> : null}{alert ? <em><CircleAlert />{pt ? "Fora da súmula" : "Not selected"}</em> : null}</> : <><span className={styles.emptySlot}>+</span><b>{slot.id}</b></>}</div>; })}</TouchlinePitchSurface> : <section className={styles.squadBoard} aria-label={pt ? "Elenco por posição" : "Squad by position"}>{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; const alert = selection ? currentAlerts.some((entry) => entry.playerId === selection.playerId) : false; const openSlot = () => { if (editable) { setActiveSlotId(slot.id); setVisibleStep("players"); } }; return <article key={slot.id} data-state={!editable ? "locked" : card ? (alert ? "invalid" : "selected") : activeSlot?.id === slot.id ? "active" : "empty"}><button type="button" disabled={!editable} onClick={openSlot} aria-label={`${card ? (pt ? "Trocar" : "Replace") : (pt ? "Selecionar jogador para" : "Select player for")} ${slot.id}`}><span>{slot.id}</span><strong>{card?.shortName ?? (pt ? "Vaga aberta" : "Open slot")}</strong><small>{slot.allowedPositions.join(" / ")}</small></button>{card ? <div><span>{card.clubName}</span>{editable ? <button type="button" onClick={() => removePlayer(selection!.playerId)} aria-label={`${pt ? "Remover" : "Remove"} ${card.name}`}>×</button> : null}</div> : null}</article>; })}</section>}
      <footer className={styles.pitchFooter}><span>{selectedCoach ? `${selectedCoach.coach.displayName} · ${selectedCoach.clubName}` : (pt ? "Treinador pendente" : "Coach pending")}</span><span>{pt ? "Escolha livre de jogadores por clube" : "No per-club player limit"}</span><strong>{validation?.valid ? <><BadgeCheck />{pt ? "XI válido" : "Valid XI"}</> : `${selections.length}/11`}</strong></footer></section>
      <aside className={styles.guidePanel} ref={guidePanelRef} data-guide-step={visibleStep} tabIndex={0} aria-label={pt ? "Painel de escolha TouchLine" : "TouchLine selection panel"} onPointerDown={(event) => { if (event.target === event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}>{selectedCoach && visibleStep !== "coach" ? <section className={styles.selectedCoachSummary} data-coach-tier-frame={selectedCoach.slot.cardTier} style={{ "--tier-accent": touchlineCardTierPalette(selectedCoach.slot.cardTier).accent } as CSSProperties} aria-label={pt ? "Treinador escolhido" : "Selected coach"}><TouchlineClubPerimeterTrace accent={touchlineCardTierPalette(selectedCoach.slot.cardTier).accent} /><span><FantasyCoachZoom entry={selectedCoach} locale={locale} eager /></span><div className={styles.selectedCoachIdentity}><small>{pt ? "TREINADOR ESCOLHIDO" : "SELECTED COACH"}</small><b>{selectedCoach.coach.displayName}</b><CompactClubIdentity clubName={selectedCoach.clubName} clubLogoUrl={selectedCoach.clubLogoUrl} /></div><dl className={styles.coachMetrics}><div><dt><Trophy aria-hidden="true" />{pt ? "RANK" : "RANK"}</dt><dd>{selectedCoach.competition ? `#${selectedCoach.competition.rank}` : "—"}</dd></div><div><dt><House aria-hidden="true" />{pt ? "CASA" : "HOME"}</dt><dd>{selectedCoach.competition?.home.touchlinePoints ?? "—"}<small> TL</small></dd></div><div><dt><PlaneTakeoff aria-hidden="true" />{pt ? "FORA" : "AWAY"}</dt><dd>{selectedCoach.competition?.away.touchlinePoints ?? "—"}<small> TL</small></dd></div></dl><button type="button" disabled={!editable} onClick={() => setVisibleStep("coach")}>{pt ? "Trocar" : "Change"}</button></section> : null}{visibleStep === "coach" ? <section className={styles.coachStage}><header><span>STEP 1 · {pt ? "ÁREA TÉCNICA" : "TECHNICAL AREA"}</span><h2>{pt ? "Escolha seu treinador" : "Choose your coach"}</h2><p>{pt ? "Clique num clube para ver o treinador; contrate somente quando decidir." : "Select a club to preview its coach; hire only when you decide."}</p><CompactClubSelector selectedTeamId={selectedCoachClub?.teamId ?? ""} onSelect={(club) => setCoachClubTeamId(club.teamId)} locale={locale} /></header><div className={styles.coachScroller} tabIndex={0} aria-label={pt ? "Lista rolável de treinadores" : "Scrollable coach list"}><div className={styles.coachGrid}>{filteredCoaches.map((entry) => <article key={entry.id} data-coach-tier-frame={entry.slot.cardTier} style={{ "--tier-accent": touchlineCardTierPalette(entry.slot.cardTier).accent } as CSSProperties} data-selected={entry.id === selectedCoachId ? "true" : undefined}><TouchlineClubPerimeterTrace accent={touchlineCardTierPalette(entry.slot.cardTier).accent} /><span><FantasyCoachZoom entry={entry} locale={locale} /></span><div className={styles.coachIdentity}><small>{pt ? "TOUCHLINE VERIFIED" : "TOUCHLINE VERIFIED"}</small><b>{entry.coach.displayName}</b><CompactClubIdentity clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} /></div><dl className={styles.coachMetrics}><div><dt><Trophy aria-hidden="true" />RANK</dt><dd>{entry.competition ? `#${entry.competition.rank}` : "—"}</dd></div><div><dt><House aria-hidden="true" />{pt ? "CASA" : "HOME"}</dt><dd>{entry.competition?.home.touchlinePoints ?? "—"}<small> TL</small></dd></div><div><dt><PlaneTakeoff aria-hidden="true" />{pt ? "FORA" : "AWAY"}</dt><dd>{entry.competition?.away.touchlinePoints ?? "—"}<small> TL</small></dd></div></dl><button type="button" disabled={!editable} onClick={() => { setSelectedCoachId(entry.id); setFeedback(pt ? "Treinador contratado. Escolha agora a formação." : "Coach hired. Choose the formation next."); setVisibleStep("formation"); }}>{pt ? "Contratar treinador" : "Hire coach"}</button></article>)}</div>{filteredCoaches.length === 0 ? <p className={styles.emptyResults}>{pt ? "Nenhum treinador canônico disponível para este clube." : "No canonical coach is available for this club."}</p> : null}</div></section> : null}
      {visibleStep === "formation" ? <><span>STEP 2</span><h2>{pt ? "Escolha a formação" : "Choose formation"}</h2><p>{pt ? "Todas as opções vêm do registro canônico calibrado." : "Every option comes from the calibrated canonical registry."}</p><div className={styles.formationGrid}>{Object.keys(snapshot.formationRegistry).map((code) => <button type="button" key={code} onClick={() => changeFormation(code)} disabled={!editable} data-selected={code === formationCode ? "true" : undefined}><b>{code}</b><small>11 {pt ? "vagas" : "slots"}</small></button>)}</div></> : null}
      {visibleStep === "players" ? <section className={styles.selectionStage}><header><span>STEP 3</span><h2>{pt ? "Preencha a vaga" : "Fill the slot"}</h2><p>{activeSlot ? `${activeSlot.id} · ${activeSlot.allowedPositions.join(" / ")}` : (pt ? "Selecione uma vaga no campo." : "Select a slot on the pitch.")}</p><div className={styles.filters}><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pt ? "Pesquisar jogador" : "Search player"} /></label></div><CompactClubSelector selectedTeamId={selectedPlayerClub?.teamId ?? ""} onSelect={(club) => setPlayerClubTeamId(club.teamId)} locale={locale} /></header><div className={styles.playerViewport}><div className={styles.playerScroller} tabIndex={0} aria-label={pt ? "Lista rolável de atletas" : "Scrollable player list"} onPointerDown={(event) => { const target = event.target as HTMLElement; if (!target.closest("button, a, input, select")) event.currentTarget.focus({ preventScroll: true }); }} onKeyDown={(event) => { if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return; event.preventDefault(); event.currentTarget.scrollBy({ top: event.key === "ArrowDown" ? 96 : -96, behavior: "smooth" }); }}><div className={styles.playerGrid}>{filtered.map((card) => <article data-player-choice-card="premium" key={card.canonicalPlayerId ?? card.id} data-choice-tier-frame={card.editorialCard?.tierKey ?? "unresolved"} style={{ "--tier-accent": card.editorialCard?.tierKey ? touchlineCardTierPalette(card.editorialCard.tierKey).accent : undefined } as CSSProperties}><TouchlineClubPerimeterTrace accent={card.editorialCard?.tierKey ? touchlineCardTierPalette(card.editorialCard.tierKey).accent : undefined} /><div className={styles.marketCard}><TouchlineGameweekCard card={card} locale={locale} displayWidth={132} fitContainer /></div><div className={styles.playerIdentity}><b>{card.name}</b><CompactClubIdentity clubName={card.clubName} clubLogoUrl={findTouchLineClub(card.clubName)?.logoUrl ?? null} detail={card.position} /></div><button type="button" disabled={!editable} onClick={() => addPlayer(card)}>{pt ? "Escolher para esta vaga" : "Choose for this slot"}</button></article>)}</div>{filtered.length === 0 ? <p className={styles.emptyResults}>{pt ? "Nenhum jogador desta posição está disponível neste clube." : "No player for this position is available at this club."}</p> : null}</div></div></section> : null}
      {visibleStep === "review" ? <><span>STEP 4</span><h2>{pt ? "Revise sua equipe" : "Review your team"}</h2><div className={styles.editActions}><button type="button" disabled={!editable} onClick={() => setVisibleStep("coach")}>{pt ? "Trocar treinador" : "Change coach"}</button><button type="button" disabled={!editable} onClick={() => setVisibleStep("players")}>{pt ? "Editar jogadores" : "Edit players"}</button></div><div className={styles.reviewCoach}>{selectedCoach ? <><Crown /><div><b>{selectedCoach.coach.displayName}</b><span>{selectedCoach.clubName}</span></div></> : null}</div><ol className={styles.reviewList}>{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; return <li key={slot.id}><span>{slot.id}</span><b>{card?.name ?? "—"}</b><strong>{card?.marketValue ?? "—"}</strong></li>; })}</ol><div className={styles.validation}>{validation?.issues.map((issue) => <span key={issue}>{issue.replaceAll("_", " ")}</span>)}{validation?.valid ? <span data-valid="true"><Check />{pt ? "Pronto para confirmar" : "Ready to confirm"}</span> : null}</div></> : null}
      {visibleStep === "locked" ? <><span>{editable ? "STEP 5" : "LOCKED SNAPSHOT"}</span><h2>{editable ? (pt ? "Equipe confirmada" : "Confirmed team") : (pt ? "Equipe da rodada bloqueada" : "Gameweek team locked")}</h2>{editable ? <div className={styles.editActions}><button type="button" onClick={() => setVisibleStep("coach")}>{pt ? "Trocar treinador" : "Change coach"}</button><button type="button" onClick={() => setVisibleStep("players")}>{pt ? "Editar jogadores" : "Edit players"}</button></div> : null}<div className={styles.syncPanel}><Send /><p>{lineupConfirmed || !editable ? (pt ? "A mesma identidade canônica, treinador, formação e 11 jogadores está pronta na Arena." : "The same canonical identity, coach, formation and 11 players is ready in Arena.") : (pt ? "Confirme o XI para liberar a sincronização." : "Confirm the XI to enable sync.")}</p><a href={`/arena?lang=${encodeURIComponent(locale)}`} aria-disabled={!(lineupConfirmed || !editable)}>{pt ? "Abrir na Arena" : "Open in Arena"}</a></div></> : null}</aside></main>
    <section className={styles.actionRail}><div><b>{pt ? "Prazo canônico" : "Canonical deadline"}</b><strong suppressHydrationWarning>{activeGameweek ? formatTouchlineFantasyDeadline(activeGameweek.locksAt, locale) : "—"}</strong><span>{pt ? "Fecha no início da primeira partida; reabre após o apito final confirmado da última." : "Closes at the first kickoff; reopens after the last confirmed final whistle."}</span><em data-save-state={hasUnsavedChanges ? "dirty" : persistedUserGameweek?.selectedCoachId ? "saved" : "empty"}>{hasUnsavedChanges ? (pt ? "Alterações não salvas" : "Unsaved changes") : persistedUserGameweek?.selectedCoachId ? (pt ? "Equipe gravada no TouchLine" : "Team saved in TouchLine") : (pt ? "Ainda não salvo" : "Not saved yet")}</em></div><div><button type="button" onClick={() => save("draft")} disabled={!editable || saving || !selectedCoachId || !formationCode || !hasUnsavedChanges}><Save />{pt ? "Salvar rascunho" : "Save draft"}</button><button className={styles.confirm} type="button" onClick={() => save("confirm")} disabled={!editable || saving || !selectedCoachId || !validation?.valid || lineupConfirmed}><LockKeyhole />{pt ? "Confirmar XI" : "Confirm XI"}</button></div></section>
    {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    {currentAlerts.length ? <section className={styles.alertPanel}><CircleAlert /><div><b>{pt ? "Atualização da escalação oficial" : "Official lineup update"}</b><p>{pt ? `${currentAlerts.length} jogador(es) selecionado(s) não aparece(m) entre titulares ou banco. ${editable ? "Você ainda pode editar antes do prazo." : "O prazo encerrou; a equipe permanece imutável."}` : `${currentAlerts.length} selected player(s) are absent from starters and bench. ${editable ? "You can still edit before the deadline." : "The deadline passed; the team remains immutable."}`}</p></div></section> : null}
    </section>
    <section className={styles.rankings}><RankingTable title={pt ? "Ranking da rodada" : "Gameweek ranking"} entries={live?.gameweekRanking ?? []} empty={pt ? "Será publicado após existirem equipes bloqueadas." : "Published after locked teams exist."} /><RankingTable title={pt ? "Ranking da temporada" : "Season ranking"} entries={live?.seasonRanking ?? []} empty={pt ? "Ainda não há resultados finais." : "No final results yet."} /></section>
    <section className={styles.rules}><Users /><div><span>TOUCHLINE GAMEWEEK RULES</span><h2>{pt ? "11 cards. Um XI titular." : "11 cards. One Starting XI."}</h2><p>{pt ? "Rating oficial TouchLine é a fonte da rodada; Rating ausente nunca é inventado. O orçamento permanece em €900M." : "Official TouchLine Rating is the Gameweek source; a missing Rating is never invented. Budget remains €900M."}</p></div></section>
  </div>;
}
