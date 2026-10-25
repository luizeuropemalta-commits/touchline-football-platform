"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import type { ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { getAllocationDialogCopy, getAllocationSwapLabels } from "@/lib/touchlineFantasy/allocation-dialog-i18n";
import type { ClubRosterArea } from "@/lib/touchlineFantasy/club-roster";
import { clubPlayerPosition } from "@/lib/touchlineFantasy/club-position";
import { collectionPositionName, collectionGroupName, groupCollectionSlots } from "@/lib/touchlineFantasy/collection-position-display";
import type { ExchangePosition } from "@/lib/touchlineFantasy/exchange-eligibility";
import { clubStarterDestinations } from "@/lib/touchlineFantasy/club-allocation";
import { collectionSlotPlan, previewPlannedClubAllocation } from "@/lib/touchlineFantasy/collection-slot-plan";
import { clubPrimaryPositionIndex } from "@/lib/touchlineFantasy/club-primary-position-index";
import { primaryPositionFitsTacticalSlot } from "@/lib/touchlineFantasy/club-primary-position-policy";
import { squadSwapComparisonPlayers } from "@/lib/touchlineFantasy/squad-swap-presentation";
import type { TouchlineFormationGeometry } from "@/lib/touchlineArena/formation-geometry";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import TouchlineGameweekCard from "./TouchlineGameweekCard";
import TouchlineMarketPlayerTile from "@/components/touchline/market/TouchlineMarketPlayerTile";
import styles from "@/app/fantasy/fantasy.module.css";
import layout from "./ClubOwnerCollectionSlots.module.css";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";

export type CollectionDestination = Readonly<{ area: ClubRosterArea; slot: number }>;

/** Internal allocation only: no acquisition, release or cross-account trade. */
export function ClubOwnerSquadSwapDialog({ state, playerId, outsideOnly = false, catalogue, geometry, locale, liveSeasonRating = false, draftLocalesEnabled = false, busy, enabled, error, onClose, onMove }: {
  state: ClubAcquisitionState; playerId: string; outsideOnly?: boolean; catalogue: readonly ClubOwnerSquadCard[];
  geometry: TouchlineFormationGeometry; locale: string; liveSeasonRating?: boolean; draftLocalesEnabled?: boolean; busy: boolean; enabled: boolean; error: string | null;
  onClose: () => void; onMove: (playerId: string, destination: CollectionDestination) => Promise<boolean>;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const [choice, setChoice] = useState<{ playerId: string; counterpartId: string; destination: CollectionDestination; revision: number; label: string } | null>(null);
  const primaryDetails = useMemo(() => clubPrimaryPositionIndex(catalogue, { allowLegacyDisplay: true }), [catalogue]);
  const source = state.players.find(p => p.playerId === playerId);
  const copy = getAllocationDialogCopy(locale, draftLocalesEnabled);
  const swapCopy = getAllocationSwapLabels(locale, draftLocalesEnabled);
  const areaLabel = (area: ClubRosterArea) => area === "starters" ? swapCopy.starters : area === "reserves" ? copy.bench : copy.outside;
  const title = outsideOnly ? (copy.moveOutside) : (copy.replacePlayer);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: title, initialFocusRef: close,
    onDismiss: () => { if (!busy && !sending.current) onClose(); } });
  useTouchlineDialogScrollLock(true);
  const valid = (id: string, destination: CollectionDestination) => Boolean(source && previewPlannedClubAllocation(state,
    { action: "move", playerId: id, ...destination, expectedRevision: state.revision, idempotencyKey: "squad_swap_preview" }, geometry, primaryDetails));
  const candidates = state.players.filter(p => p.playerId !== playerId && p.area !== source?.area && (!outsideOnly || p.area === "outside"))
    .flatMap(p => {
      const card = catalogue.find(c => (c.canonicalPlayerId ?? c.id) === p.playerId);
      const id = outsideOnly ? playerId : p.playerId;
      const destination = outsideOnly ? { area: p.area, slot: p.slot } : source && { area: source.area, slot: source.slot };
      return card && destination && valid(id, destination) ? [{ card, area: p.area, id, counterpartId: p.playerId, destination }] : [];
    });
  const choose = (id: string, counterpartId: string, destination: CollectionDestination, label: string) => {
    if (enabled && !busy && valid(id, destination)) {
      const dialog = close.current?.closest<HTMLElement>('[role="dialog"]');
      if (dialog) dialog.scrollTop = 0;
      close.current?.focus({ preventScroll: true });
      setChoice({ playerId: id, counterpartId, destination, revision: state.revision, label });
    }
  };
  const counterpart = choice ? state.players.find(player => player.playerId === choice.counterpartId) : null;
  // Approved comparison order: incoming left, outgoing right.
  const comparisonPlayers = squadSwapComparisonPlayers(source, counterpart);
  return createPortal(<div className={layout.overlay}><div {...dialogProps} className={layout.dialog}>
    <header><h2>{title}</h2><button ref={close} type="button" className={controls.link} disabled={busy} onClick={() => { if (!sending.current) onClose(); }}>{copy.cancel}</button></header>
    <p>{copy.swapInstruction}</p>
    {error ? <p role="alert">{error}</p> : null}
    {!enabled ? <p role="status">{copy.waitForSquad}</p> : null}
    {choice ? <section aria-label={copy.confirmChange}>
      {source && counterpart ? <div className={layout.swapPreview}>
        <div className={layout.swapSummary}>
          {comparisonPlayers.map((player, index) => {
            const card = catalogue.find(card => (card.canonicalPlayerId ?? card.id) === player.playerId);
            const destination = comparisonPlayers[1 - index];
            if (!destination) return null;
            return <div key={player.playerId} className={index === 0 ? layout.swapEntering : layout.swapLeaving}>
              {index === 0 ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              <strong>{index === 0 ? swapCopy.entering : swapCopy.leaving}</strong>
              <span>{card?.name ?? copy.squadPlayer}</span>
              <small>{areaLabel(player.area)} → {areaLabel(destination.area)}</small>
            </div>;
          })}
        </div>
        {comparisonPlayers.map((player, index) => {
          const card = catalogue.find(card => (card.canonicalPlayerId ?? card.id) === player.playerId);
          return <figure key={player.playerId} data-swap-player={player.playerId} data-swap-side={index === 0 ? "in" : "out"}>
            {card ? <TouchlineGameweekCard card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} liveSeasonRating={liveSeasonRating} compact fitContainer /> : <p role="status">{copy.cardUnavailable}</p>}
          </figure>;
        })}
      </div> : null}
      <button type="button" className={controls.link} disabled={busy || !enabled || choice.revision !== state.revision}
        onClick={async () => {
          if (busy || !enabled || sending.current || choice.revision !== state.revision || !valid(choice.playerId, choice.destination)) return;
          sending.current = true;
          try { if (await onMove(choice.playerId, choice.destination)) onClose(); } finally { sending.current = false; }
        }}>{copy.confirmSquadChange}</button>
      <button type="button" className={controls.link} disabled={busy} onClick={() => { if (!sending.current) setChoice(null); }}>{copy.back}</button>
      {choice.revision !== state.revision ? <p role="status">{copy.squadChanged}</p> : null}
    </section> : <>
      {(["starters", "reserves", "outside"] as const).filter(area => area !== source?.area && (!outsideOnly || area === "outside")).map(area => <section key={area}>
        <h3>{areaLabel(area)}</h3>
        <div className={`${styles.myClubMarketResults} ${layout.results}`}>{candidates.filter(p => p.area === area).map(p => <TouchlineMarketPlayerTile liveSeasonRating={liveSeasonRating} key={p.card.id} card={p.card} locale={locale} draftLocalesEnabled={draftLocalesEnabled}>
          <button type="button" className={controls.link} disabled={busy || !enabled} onClick={() => choose(p.id, p.counterpartId, p.destination, p.card.name)}>{copy.select}</button>
        </TouchlineMarketPlayerTile>)}</div>
        {!candidates.some(p => p.area === area) ? <p>{copy.noPlayers}</p> : null}
      </section>)}
    </>}
  </div></div>, document.body);
}

/** Placement only. Card artwork, points, zoom and empty-slot button are canonical. */
export function ClubOwnerCollectionSlots({ state, catalogue, area, start = 0, count, locale, liveSeasonRating = false, draftLocalesEnabled = false, enabled, displayWidth = 70, guidedSlot, onChoose, onFieldPlayer, onReleasePlayer, grouped = false, slotPositions }: {
  state: Pick<ClubAcquisitionState, "players"> | null; catalogue: readonly ClubOwnerSquadCard[]; area: ClubRosterArea;
  start?: number; count: number; locale: string; liveSeasonRating?: boolean; draftLocalesEnabled?: boolean; enabled: boolean; displayWidth?: number; guidedSlot?: number;
  onChoose: (destination: CollectionDestination) => void;
  onFieldPlayer?: (playerId: string) => void;
  onReleasePlayer?: (playerId: string) => void;
  onOutsidePlayer?: (playerId: string) => void;
  grouped?: boolean;
  slotPositions?: readonly (ExchangePosition | null)[];
}) {
  const cards = useMemo(() => new Map(catalogue.map(card => [card.canonicalPlayerId ?? card.id, card])), [catalogue]);
  const pt = locale.startsWith("pt");
  const copy = getAllocationDialogCopy(locale, draftLocalesEnabled);
  const title = area === "reserves" ? copy.reserves : copy.outside;
  const slots = Array.from({ length: count }, (_, index) => {
      const slot = start + index;
      const owned = state?.players.find(player => player.area === area && player.slot === slot);
      return { slot, owned, position: owned?.position ?? slotPositions?.[slot] ?? null };
  });
  const renderSlot = ({ slot, owned, position }: typeof slots[number]) => {
      const card = owned ? cards.get(owned.playerId) : null;
      const positionName = position ? collectionPositionName(position, locale, draftLocalesEnabled) : null;
      return <div className={layout.slot} key={slot} data-collection-slot={slot} data-position={position ?? undefined} data-owned={owned ? "true" : undefined}>
        {card ? <TouchlineGameweekCard liveSeasonRating={liveSeasonRating} card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} compact displayWidth={displayWidth}
          replacementAction={owned && onFieldPlayer ? { label: copy.replacePlayer, disabled: !enabled || !state,
            onSelect: () => { if (enabled && state) onFieldPlayer(owned.playerId); } } : undefined}
          releaseAction={owned && onReleasePlayer ? { label: pt ? "Liberar jogador" : "Release player", disabled: !enabled || !state,
            onSelect: () => { if (enabled && state) onReleasePlayer(owned.playerId); } } : undefined} />
          : owned ? <span role="status">{copy.cardUnavailable}</span>
            : <button type="button" className={styles.emptyPosition} data-collection-placeholder="true" data-guided-action={enabled && Boolean(state) && guidedSlot === slot ? "true" : undefined} disabled={!enabled || !state || guidedSlot !== slot}
              aria-label={`${copy.signPlayer} · ${positionName ?? title} · ${slot + 1}`}
              onClick={() => { if (enabled && state && guidedSlot === slot) onChoose({ area, slot }); }}>+</button>}
        {position ? <b className={layout.positionLabel} title={positionName!} aria-label={`${position} · ${positionName}`}>{position}</b>
          : <small className={layout.positionLabel} aria-label={`${copy.slot} ${slot + 1}`}>{slot + 1}</small>}
        {owned ? <button type="button" className={controls.link} disabled={!enabled || !state}
          aria-label={`${copy.change} · ${title} ${slot + 1}`}
          title={copy.changePlayer}
          onClick={() => onChoose({ area, slot })}><ArrowLeftRight aria-hidden="true" /></button> : null}
      </div>;
  };
  const groupedSlots = groupCollectionSlots(slots);
  return <div className={grouped ? layout.groups : layout.slots} style={{ "--collection-card-width": `${displayWidth}px` } as CSSProperties} data-collection-area={area} aria-label={title}>
    {grouped ? <>{groupedSlots.groups.map(group => <section key={group.id} className={layout.positionGroup} aria-label={collectionGroupName(group.id, locale, draftLocalesEnabled)}>
      <h3>{collectionGroupName(group.id, locale, draftLocalesEnabled)} <span>{state ? group.slots.filter(slot => slot.owned).length : "—"}</span></h3>
      {group.slots.length ? <div className={layout.slots}>{group.slots.map(renderSlot)}</div> : <p>{!state
        ? (copy.awaitingSquad)
        : (copy.noPlayersInUnit)}</p>}
    </section>)}
      {groupedSlots.unassigned.length ? <section className={layout.positionGroup} aria-label={copy.unassignedPositions}>
        <h3>{copy.unassignedPositions}</h3>
        <div className={layout.slots}>{groupedSlots.unassigned.map(renderSlot)}</div>
      </section> : null}</> : slots.map(renderSlot)}
  </div>;
}

/** Existing squad only: no purchase, release or wallet operation. */
export function ClubOwnerPlayerPlacementDialog({ state, playerId, catalogue, geometry, locale, draftLocalesEnabled = false, busy, enabled, error, onClose, onMove }: {
  state: ClubAcquisitionState; playerId: string; catalogue: readonly ClubOwnerSquadCard[];
  geometry: TouchlineFormationGeometry; locale: string; draftLocalesEnabled?: boolean; busy: boolean; enabled: boolean; error: string | null;
  onClose: () => void; onMove: (slot: number) => Promise<boolean>;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const [chosen, setChosen] = useState<{ slot: number; revision: number } | null>(null);
  const primaryDetails = useMemo(() => clubPrimaryPositionIndex(catalogue, { allowLegacyDisplay: true }), [catalogue]);
  const copy = getAllocationDialogCopy(locale, draftLocalesEnabled);
  const title = copy.addToXI;
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({ open: true, label: title, initialFocusRef: close,
    onDismiss: () => { if (!busy && !sending.current) onClose(); } });
  useTouchlineDialogScrollLock(true);
  const options = clubStarterDestinations(state, playerId, geometry, primaryDetails).filter(option => previewPlannedClubAllocation(state,
    { action: "move", playerId, area: "starters", slot: option.slot, expectedRevision: state.revision, idempotencyKey: "placement_preview" }, geometry, primaryDetails));
  const name = (id: string) => catalogue.find(card => (card.canonicalPlayerId ?? card.id) === id)?.name ?? (copy.squadPlayer);
  return createPortal(<div className={layout.overlay}><div {...dialogProps} className={layout.dialog}>
    <header><h2>{title} · {name(playerId)}</h2><button ref={close} type="button" className={controls.link} disabled={busy} onClick={() => { if (!sending.current) onClose(); }}>{copy.backToSquad}</button></header>
    <p>{copy.placementInstruction}</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className={layout.pickerModes}>{options.map(option => <button key={option.slot} type="button" className={controls.link} disabled={busy || !enabled}
      onClick={() => { if (!busy && enabled && !sending.current) setChosen({ slot: option.slot, revision: state.revision }); }}>
      {copy.startAt} {option.position}{option.displacedPlayerId ? ` · ${copy.replacing} ${name(option.displacedPlayerId)}` : ""}
    </button>)}</div>
    {chosen ? <section aria-label={copy.confirmChange}>
      <p>{copy.confirmSquadQuestion} {options.find(option => option.slot === chosen.slot)?.position}</p>
      <button type="button" className={controls.link} disabled={busy || !enabled || chosen.revision !== state.revision || !options.some(option => option.slot === chosen.slot)} onClick={async () => {
        if (busy || !enabled || sending.current || chosen.revision !== state.revision || !options.some(option => option.slot === chosen.slot)) return;
        sending.current = true;
        try { if (await onMove(chosen.slot)) onClose(); } finally { sending.current = false; }
      }}>{copy.confirm}</button>
      <button type="button" className={controls.link} disabled={busy} onClick={() => { if (!sending.current) setChosen(null); }}>{copy.cancel}</button>
    </section> : null}
    {!options.length ? <p>{copy.noPosition}</p> : null}
  </div></div>, document.body);
}

export function ClubOwnerCollectionPicker({ destination, state, catalogue, geometry, locale, liveSeasonRating = false, busy, enabled, verificationRequired, error, requiredPosition, onClose, onRefresh, onPurchase, onMove }: {
  destination: CollectionDestination; state: ClubAcquisitionState; catalogue: readonly ClubOwnerSquadCard[];
  geometry: TouchlineFormationGeometry | null;
  locale: string; liveSeasonRating?: boolean; busy: boolean; enabled: boolean; verificationRequired: boolean; error: string | null; onClose: () => void; onRefresh: () => void;
  requiredPosition?: ExchangePosition | null;
  onPurchase: (playerId: string, destination: CollectionDestination) => Promise<boolean>;
  onMove: (playerId: string, destination: CollectionDestination) => Promise<boolean>;
}) {
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"owned" | "market">(state.players.length ? "owned" : "market");
  const primaryDetails = useMemo(() => clubPrimaryPositionIndex(catalogue, { allowLegacyDisplay: true }), [catalogue]);
  const pt = locale.startsWith("pt");
  const title = `${pt ? "Selecionar jogador" : "Select player"}${requiredPosition ? ` · ${collectionPositionName(requiredPosition, locale)}` : ""}`;
  const occupied = state.players.some(player => player.area === destination.area && player.slot === destination.slot);
  const { dialogProps } = useTouchlineDialog<HTMLDivElement>({
    open: true, label: title, initialFocusRef: search, onDismiss: () => { if (!busy) onClose(); },
  });
  useTouchlineDialogScrollLock(true);
  const owned = new Set(state.players.map(player => player.playerId));
  const filtered = catalogue.filter(card => (mode === "owned" ? owned.has(card.canonicalPlayerId ?? card.id) : !occupied && !owned.has(card.canonicalPlayerId ?? card.id))
    && clubPlayerPosition(primaryDetails[card.canonicalPlayerId ?? card.id]) !== null
    && (!requiredPosition || clubPlayerPosition(primaryDetails[card.canonicalPlayerId ?? card.id]) === requiredPosition)
    && `${card.name} ${card.clubName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    && (() => {
      const playerId = card.canonicalPlayerId ?? card.id;
      if (!geometry || state.players.some(p => p.playerId === playerId && p.area === destination.area && p.slot === destination.slot)) return false;
      if (mode === "market") {
        const primaryDetail = primaryDetails[playerId];
        const position = clubPlayerPosition(primaryDetail);
        const valueEur = card.editorialCard?.marketValueEur;
        if (!primaryDetail || !position || valueEur === undefined || !Number.isSafeInteger(valueEur) || valueEur <= 0) return false;
        const tacticalSlot = geometry.slots[destination.slot];
        if (destination.area === "starters" && (!tacticalSlot || !primaryPositionFitsTacticalSlot(primaryDetail, geometry.formationCode, tacticalSlot.id))) return false;
        const plan = collectionSlotPlan(geometry, state.players, primaryDetails);
        if (!plan || destination.area !== "starters" && plan[destination.area][destination.slot] !== position) return false;
        return Boolean(collectionSlotPlan(geometry, [...state.players, { playerId, ...destination, position, primaryDetail }], primaryDetails));
      }
      try {
        return Boolean(previewPlannedClubAllocation(state, { action: "move", playerId, ...destination, expectedRevision: state.revision, idempotencyKey: "selection_preview" }, geometry, primaryDetails));
      } catch { return false; }
    })());
  return createPortal(<div className={layout.overlay}>
    <div {...dialogProps} className={layout.dialog}>
      <header><h2>{title}</h2><button type="button" className={controls.link} onClick={onClose} disabled={busy}>{pt ? "Fechar" : "Close"}</button></header>
      <nav className={layout.pickerModes} aria-label={pt ? "Origem dos jogadores" : "Player source"}>
        <button type="button" className={controls.link} aria-pressed={mode === "owned"} disabled={busy} onClick={() => setMode("owned")}>{pt ? "Meu elenco" : "My squad"}</button>
        <button type="button" className={controls.link} aria-pressed={mode === "market"} disabled={busy || occupied} onClick={() => setMode("market")}>TouchLine Markt Transfer</button>
      </nav>
      <label className={styles.myClubSearch}><span>{pt ? "Buscar" : "Search"}</span><input ref={search} value={query}
        onChange={event => setQuery(event.target.value)} placeholder={pt ? "Jogador ou clube" : "Player or club"} /></label>
      <output>{pt ? "Saldo" : "Balance"}: {state.balanceEur.toLocaleString(locale)} TC</output>
      {error ? <p role="alert">{error}</p> : null}
      {busy || verificationRequired ? <div role="status">
        <p>{busy ? (pt ? "Aguarde a confirmação da operação. Não repita a contratação." : "Waiting for operation confirmation. Do not repeat the signing.")
          : (pt ? "Contratação pausada até confirmar o elenco. Atualizar consulta os registros sem realizar outra compra." : "Signing paused until the squad is confirmed. Refresh checks the records without making another purchase.")}</p>
        <button type="button" className={controls.link} disabled={busy} onClick={onRefresh}>{pt ? "Atualizar elenco" : "Refresh squad"}</button>
      </div> : null}
      {!enabled && !busy && !verificationRequired ? <p role="status">{pt ? "Esta vaga não está disponível para contratação neste momento." : "This slot is not available for signing right now."}</p> : null}
      <div className={`${styles.myClubMarketResults} ${layout.results}`}>
        {filtered.map(card => <TouchlineMarketPlayerTile liveSeasonRating={liveSeasonRating} key={card.id} card={card} locale={locale}>
          <button type="button" className={controls.link} disabled={busy || !enabled || (mode === "market" && (card.editorialCard?.marketValueEur === undefined || card.editorialCard.marketValueEur > state.balanceEur))}
            onClick={async () => { if (!busy && enabled && await (mode === "owned" ? onMove : onPurchase)(card.canonicalPlayerId ?? card.id, destination)) onClose(); }}>{mode === "owned" ? (pt ? "Selecionar" : "Select") : (pt ? "Contratar" : "Sign")}</button>
        </TouchlineMarketPlayerTile>)}
      </div>
      {!filtered.length ? <p>{pt ? "Nenhum jogador disponível." : "No available players."}</p> : null}
    </div>
  </div>, document.body);
}
