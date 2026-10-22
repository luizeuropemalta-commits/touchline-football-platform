"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inspectClubAcquisition, type ClubAcquisitionState, type ClubAcquisitionCommand } from "@/lib/touchlineFantasy/club-acquisition";
import type { CollectionDestination } from "./ClubOwnerCollectionSlots";
import type { ClubAllocationCommand } from "@/lib/touchlineFantasy/club-allocation";
import { useConfirmedClubCollection } from "./ClubCollectionContext";
import { requestClubCollection, readClubCollection } from "@/lib/touchlineFantasy/club-collection-request";
import { parseClubCommandAuthority, clubCommandMatchesAuthority, type ClubCommandAuthority } from "@/lib/touchlineFantasy/club-command-authority";
import { parseClubInitialBudget, type ClubInitialBudget } from "@/lib/touchlineFantasy/club-initial-budget";
import { isClubReleaseReceipt, type ClubReleaseCommand } from "@/lib/touchlineFantasy/club-release";
import type { ClubCollectionReadResult } from "@/lib/touchlineFantasy/club-collection-read-server";
import { confirmedCollectionBootstrap } from "@/lib/touchlineFantasy/club-collection-bootstrap";

/** No local wallet persistence or optimistic debit; the response owns all money/state. */
export function useClubCollection(enabled: boolean, locale: string, expectedContext: ClubCommandAuthority | null,
  onSnapshot?: (state: ClubAcquisitionState | null) => void, initialRead?: ClubCollectionReadResult | null) {
  const { publish, publishInitialBudget, publishVerificationStatus } = useConfirmedClubCollection();
  const [bootstrap] = useState(() => enabled ? confirmedCollectionBootstrap(initialRead, expectedContext) : null);
  const bootstrapDelivered = useRef(false);
  const firstRead = useRef(true);
  const [initialBudget, setInitialBudget] = useState<ClubInitialBudget | null>(bootstrap?.initialBudget ?? null);
  const initialBudgetRef = useRef<ClubInitialBudget | null>(bootstrap?.initialBudget ?? null);
  // Keep one generation for reads and writes. Background refreshes retain the
  // last verified view while pending, but a failed verification revokes it.
  const readEpoch = useRef(0) as { current: number; reading?: boolean; background?: boolean };
  const confirmInitialBudget = useCallback((value: ClubInitialBudget | null) => {
    initialBudgetRef.current = value;
    setInitialBudget(value); publishInitialBudget(value);
  }, [publishInitialBudget]);
  const [state, setState] = useState<ClubAcquisitionState | null>(bootstrap?.state ?? null);
  const [ready, setReady] = useState(bootstrap !== null);
  const [releaseAvailable, setReleaseAvailable] = useState(bootstrap?.releaseAvailable === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const pending = useRef<ClubAcquisitionCommand | ClubAllocationCommand | ClubReleaseCommand | null>(null);
  const [hasPending, setHasPending] = useState(false);
  function rememberPending(command: ClubAcquisitionCommand | ClubAllocationCommand | ClubReleaseCommand | null) {
    pending.current = command; setHasPending(command !== null);
  }
  const snapshotListener = useRef(onSnapshot);
  useEffect(() => { snapshotListener.current = onSnapshot; }, [onSnapshot]);
  const confirmedSnapshot = useRef<ClubAcquisitionState | null>(bootstrap?.state ?? null);
  useEffect(() => {
    if (!bootstrap || bootstrapDelivered.current) return;
    bootstrapDelivered.current = true;
    publish(bootstrap.state); publishInitialBudget(bootstrap.initialBudget);
    snapshotListener.current?.(bootstrap.state);
  }, [bootstrap, publish, publishInitialBudget]);
  // Bind even the first GET to the server-rendered page. A session could change
  // between SSR and hydration, before there is any previous client snapshot.
  const pageAuthority = useRef<ClubCommandAuthority | null>(parseClubCommandAuthority(expectedContext)?.authority ?? null);
  const acceptSnapshot = useCallback((incoming: ClubAcquisitionState | null) => {
    // Only explicit null represents a confirmed club not yet initialized.
    // Missing/malformed JSON must fail validation, not grant write readiness.
    if (incoming !== null) inspectClubAcquisition(incoming);
    if (incoming && incoming.seasonId !== pageAuthority.current?.expectedSeasonId) throw new Error("CLUB_CONTEXT_CHANGED");
    const previous = confirmedSnapshot.current;
    // A delayed read must not undo a confirmed debit/allocation. A missing
    // collection after initialization needs a fresh page/season authority.
    if (previous && !incoming) throw new Error("CLUB_COLLECTION_UNCONFIRMED");
    // A season transition requires a fresh page authority. Never mix a pending
    // command from one season with another season's budget or ownership.
    if (previous && incoming && previous.seasonId !== incoming.seasonId) throw new Error("CLUB_COLLECTION_UNCONFIRMED");
    if (previous && incoming && previous.seasonId === incoming.seasonId && incoming.revision <= previous.revision) return;
    confirmedSnapshot.current = incoming;
    if (incoming) confirmInitialBudget(null);
    setState(incoming); publish(incoming); snapshotListener.current?.(incoming);
  }, [publish, confirmInitialBudget]);
  const pt = locale.startsWith("pt");
  const unavailable = pt ? "Não foi possível confirmar o elenco. Tente novamente." : "Unable to confirm the squad. Please retry.";
  useEffect(() => {
    if (!enabled || inFlight.current) return;
    let active = true;
    const epoch = ++readEpoch.current;
    const background = readEpoch.background === true || (firstRead.current && bootstrap !== null);
    firstRead.current = false;
    readEpoch.background = false;
    readEpoch.reading = true;
    publishVerificationStatus("pending");
    const finishRead = () => { if (epoch === readEpoch.current) readEpoch.reading = false; };
    if (!background) {
      setReady(false);
      setReleaseAvailable(false);
      confirmInitialBudget(null);
    }
    const controller = new AbortController();
    const readStartedAt = Date.now();
    readClubCollection(controller.signal)
      .then(({response, payload}) => { if (!response.ok || !payload.ok) throw new Error(
        typeof payload.error === "string" && /^CLUB_[A-Z_]+$/.test(payload.error) ? payload.error : "CLUB_READ_RESPONSE_INVALID");
        if (payload.state) inspectClubAcquisition(payload.state);
        if (active && epoch === readEpoch.current) {
          const envelope = parseClubCommandAuthority({expectedAccountId:payload.accountId,expectedSeasonId:payload.seasonId});
          if (!envelope || !pageAuthority.current || !clubCommandMatchesAuthority(pageAuthority.current, payload.accountId, payload.seasonId)) {
            setReady(false); throw new Error("CLUB_CONTEXT_CHANGED");
          }
          pageAuthority.current = envelope.authority;
          acceptSnapshot(payload.state);
          const budget = payload.state === null ? parseClubInitialBudget(payload.initialBudget) : null;
          confirmInitialBudget(budget);
          if (payload.state === null && !budget) throw new Error("CLUB_BUDGET_UNCONFIRMED");
          const command = pending.current;
          if (command && !("action" in command) && (payload.state as ClubAcquisitionState | null)?.receipts.some(receipt =>
            receipt.key === command.idempotencyKey && receipt.playerId === command.playerId && receipt.area === command.area && receipt.slot === command.slot)) rememberPending(null);
          setReady(true);
          setReleaseAvailable(payload.releaseAvailable === true);
          setError(null);
          publishVerificationStatus(pending.current ? "unavailable" : "confirmed");
        } })
      .catch(error => {
        if (!active || epoch !== readEpoch.current) return;
        if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
          // Diagnostic only: no account ID, financial data, response body or tokens.
          const code = error instanceof Error && /^CLUB_[A-Z_]+$/.test(error.message) ? error.message : "CLUB_READ_TRANSPORT_OR_FORMAT";
          console.warn("[ClubOwner] Squad read unconfirmed", { code, elapsedMs: Date.now() - readStartedAt });
        }
        // Keep the last confirmed display, but never keep its write authority
        // after a failed read (including a missing previously-created club).
        setReady(false);
        publishVerificationStatus("unavailable");
        setReleaseAvailable(false);
        confirmInitialBudget(null);
        setError(error instanceof Error && error.message === "CLUB_CONTEXT_CHANGED"
          ? (pt ? "A conta ou temporada mudou. Reabra a página antes de continuar." : "The account or season changed. Reopen the page before continuing.") : unavailable);
      }).finally(finishRead);
    return () => { active = false; controller.abort(); finishRead(); };
  }, [enabled, unavailable, reload, acceptSnapshot, pt, confirmInitialBudget, bootstrap, publishVerificationStatus]);

  async function submit(path: string, body: unknown) {
    if (!enabled || !ready || !pageAuthority.current || inFlight.current) return false;
    const operationStartedAt = Date.now();
    ++readEpoch.current;
    readEpoch.reading = false;
    readEpoch.background = false;
    inFlight.current = true; setBusy(true); setError(null);
    publishVerificationStatus("pending");
    try {
      const { response, payload } = await requestClubCollection(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({...(body as Record<string,unknown>),...pageAuthority.current}) });
      if (!response.ok || !payload.ok) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
          // Distinguish a known operation response from a failed GET without
          // logging the command, identity, money, response body or credentials.
          const code = typeof payload.error === "string" && /^CLUB_[A-Z_]+$/.test(payload.error)
            ? payload.error : "CLUB_OPERATION_RESPONSE_INVALID";
          console.warn("[ClubOwner] Squad operation response", { code, status: response.status, elapsedMs: Date.now() - operationStartedAt });
        }
        const messages: Record<string,string> = {
          CLUB_TEAM_LIMIT: pt ? "A regra anterior de limite por clube ainda está ativa no servidor. Esta contratação foi recusada." : "The previous club limit is still active on the server. This signing was rejected.",
          CLUB_CONTEXT_CHANGED: pt ? "A conta ou temporada mudou. Reabra a página antes de continuar." : "The account or season changed. Reopen the page before continuing.",
          CLUB_LEGACY_RESET_REQUIRED: pt ? "O elenco anterior precisa ser regularizado antes de começar." : "The previous squad needs reconciliation before starting.",
          CLUB_POSITION_FULL: pt ? "Todas as vagas desta posição estão ocupadas." : "All slots for this position are filled.",
          CLUB_MARKET_CLOSED: pt ? "O mercado está fechado." : "The market is closed.",
          CLUB_INSUFFICIENT_BALANCE: pt ? "Saldo insuficiente." : "Insufficient balance.",
          CLUB_STALE_REVISION: pt ? "O elenco mudou. Atualize a página antes de continuar." : "The squad changed. Refresh before continuing.",
          CLUB_PLAYER_RESERVED_OR_MISSING: pt ? "Este jogador participa de uma proposta pendente." : "This player is involved in a pending proposal.",
          CLUB_PLAYER_RESERVED: pt ? "Este jogador participa de uma proposta pendente." : "This player is involved in a pending proposal.",
          CLUB_PLAYER_ROUND_LOCKED: pt ? "Este jogador está vinculado a uma rodada fechada ou em andamento." : "This player is committed to a locked or live round.",
          CLUB_RELEASE_UNAVAILABLE: pt ? "A liberação de atletas ainda não está disponível." : "Player release is not available yet.",
          CLUB_SLOT_POSITION_INVALID: pt ? "Posição incompatível com esta vaga." : "Position incompatible with this slot.",
          CLUB_OUTSIDE_FULL: pt ? "Libere uma vaga fora da partida antes de alterar a formação." : "Free an outside slot before changing formation.",
          CLUB_FORMATION_REQUIRES_COMPATIBLE_PLAYER: pt ? "Não há jogador disponível para completar esta formação." : "No available player can complete this formation.",
        };
        setError(messages[payload.error] ?? unavailable);
        if (payload.error === "CLUB_CONTEXT_CHANGED") setReady(false);
        // Keep the same request on ambiguous transport/storage failures.
        if (response.status < 500) rememberPending(null);
        publishVerificationStatus(response.status >= 500 || payload.error === "CLUB_CONTEXT_CHANGED" || payload.error === "CLUB_STALE_REVISION" ? "unavailable" : "confirmed");
        return false;
      }
      if (payload.state == null) {
        setReady(false);
        throw new Error("CLUB_COLLECTION_UNCONFIRMED");
      }
      const current = pending.current;
      if (current && "action" in current && current.action === "release"
        && (!isClubReleaseReceipt(payload.receipt, current) || typeof payload.replayed !== "boolean")) throw new Error("CLUB_COLLECTION_UNCONFIRMED");
      acceptSnapshot(payload.state); rememberPending(null); publishVerificationStatus("confirmed"); return true;
    } catch { setError(unavailable); publishVerificationStatus("unavailable"); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function release(playerId: string, expectedRevision: number) {
    if (!enabled || !ready || !releaseAvailable || !state || inFlight.current) return false;
    const retry = pending.current;
    if (retry && (!("action" in retry) || retry.action !== "release" || retry.playerId !== playerId || retry.expectedRevision !== expectedRevision)) return false;
    if (!retry && (state.revision !== expectedRevision || !state.players.some(player => player.playerId === playerId))) {
      setError(pt ? "O elenco mudou. Revise a liberação antes de confirmar." : "The squad changed. Review the release before confirming."); return false;
    }
    const command: ClubReleaseCommand = (retry as ClubReleaseCommand | null) ?? { action: "release", playerId, expectedRevision, idempotencyKey: crypto.randomUUID() };
    rememberPending(command);
    return submit("/api/touchline-fantasy/collection/release", command);
  }
  async function purchase(playerId: string, destination: CollectionDestination) {
    if (!enabled || !ready || !state || inFlight.current) return false;
    const retry = pending.current;
    if (retry && ("action" in retry || retry.playerId !== playerId || retry.area !== destination.area || retry.slot !== destination.slot)) {
      setError(pt ? "Confirme a contratação anterior antes de iniciar outra." : "Resolve the previous purchase before starting another."); return false;
    }
    const command = retry ?? { playerId, ...destination, expectedRevision: state.revision, idempotencyKey: crypto.randomUUID() };
    rememberPending(command);
    return submit("/api/touchline-fantasy/collection", command);
  }
  async function allocate(intent: {action:"formation";formationCode:string}|({action:"move";playerId:string}&CollectionDestination)) {
    if(!enabled || !ready || !state || inFlight.current)return false;
    const retry=pending.current;
    const sameIntent=retry&&"action" in retry&&Object.entries(intent).every(([k,v])=>retry[k as keyof typeof retry]===v);
    if(retry&&!sameIntent){setError(pt?"Confirme a operação anterior antes de continuar.":"Resolve the previous operation before continuing.");return false;}
    const command=retry??{...intent,expectedRevision:state.revision,idempotencyKey:crypto.randomUUID()};
    rememberPending(command);
    return submit("/api/touchline-fantasy/collection/allocation",command);
  }
  const canInitialize = enabled && ready && !busy && !state && initialBudget !== null;
  return { state, ready, busy, error, purchase, allocate, release, releaseAvailable, hasPending, canInitialize,
    retryPending: () => {
      const command = pending.current;
      return command ? submit("action" in command ? (command.action === "release" ? "/api/touchline-fantasy/collection/release" : "/api/touchline-fantasy/collection/allocation") : "/api/touchline-fantasy/collection", command) : Promise.resolve(false);
    },
    getConfirmedState: () => confirmedSnapshot.current,
    revalidate: () => {
      // Polling cannot reconcile an uncertain command or repeat a POST. Its
      // previous receipt/key remain owned by the explicit recovery action.
      // A failed GET revokes write readiness, not permission to read again.
      // Otherwise the existing round poll cannot recover after a timeout.
      // Writes remain locked until a new authenticated GET succeeds.
      if (!enabled || inFlight.current || pending.current || readEpoch.reading) return;
      readEpoch.background = true;
      setReload(n => n + 1);
    },
    reload: () => {if(!inFlight.current){readEpoch.background=false;setReady(false);setReleaseAvailable(false);confirmInitialBudget(null);setError(null);setReload(n=>n+1);}},
    initialize: async (coachId: string) => {
      if (!canInitialize || !initialBudgetRef.current || inFlight.current) return false;
      confirmInitialBudget(null);
      const confirmed = await submit("/api/touchline-fantasy/collection/initialize", { coachId });
      if (!confirmed) { confirmInitialBudget(null); setReady(false); }
      return confirmed;
    } };
}
