/** Local UI simulator only. No account, payment, provider or notification transport. */
import { CLUB_MARKET_RULES_VERSION } from "../../../lib/touchlineFantasy/club-market-rules.ts";
import type { ClubOwnerSquadCard as Card } from "@/lib/touchlineArena/demo-data";
import { changeShowcaseListing } from "../market/exchange-showcase.ts";
import { PREVIEW_PLANS, POSITIONS, allowedForPlan, assembleRoster, assembleDisplayRoster, cardIdentity, cardValue, exchangeQuote, marketQuote, positionOf, type PreviewPlan } from "./preview-model.ts";

export type PreviewEvent = { cardId: string; kind: "injury" | "transfer" | "ineligible" };
export type LocalProposal = {
  id: string; outgoingId: string; incomingId: string;
  direction: "outgoing" | "incoming";
  state: "pending" | "accepted" | "rejected" | "cancelled" | "countered";
  terms: NonNullable<ReturnType<typeof exchangeQuote>>;
  replaces?: string;
};
export type PreviewLedger = {
  plan: PreviewPlan; roster: Card[]; balance: number;
  otherRoster: Card[]; otherBalance: number;
  proposals: LocalProposal[]; events: PreviewEvent[]; locked: boolean; error: string | null;
  initialRosterIds: string[]; journal: PreviewAction[];
  initialOtherRosterIds: string[];
  listedIds: string[];
};
export function completeRoster(cards: readonly Card[]) {
  return cards.length === 35 && new Set(cards.map(cardIdentity)).size === 35
    && cards.every(c => cardValue(c) !== null)
    && POSITIONS.every(p => cards.filter(c => positionOf(c) === p.key).length === p.count);
}
export function createPreviewLedger(catalogue: Card[], plan: PreviewPlan = "standard", preferred: string[] = [], otherPreferred?: string[]): PreviewLedger {
  const roster = assembleRoster(catalogue, plan, preferred);
  const own = new Set(roster.map(cardIdentity));
  const otherPool = catalogue.filter(c => !own.has(cardIdentity(c)));
  const otherRoster = otherPreferred ? assembleRoster(otherPool, "vip", otherPreferred) : assembleDisplayRoster(otherPool);
  return { plan, roster, balance: PREVIEW_PLANS[plan].budget - roster.reduce((sum,c) => sum + cardValue(c)!, 5_000_000),
    otherRoster, otherBalance: PREVIEW_PLANS.vip.budget - otherRoster.reduce((sum,c) => sum + cardValue(c)!, 5_000_000),
    proposals: [], events: [], locked: false, error: null, initialRosterIds: roster.map(cardIdentity), initialOtherRosterIds: otherRoster.map(cardIdentity), journal: [], listedIds: [] };
}
export function reservations(state: PreviewLedger, exclude?: string) {
  const pending = state.proposals.filter(p => p.state === "pending" && p.id !== exclude);
  return { own: new Set(pending.map(p => p.outgoingId)), other: new Set(pending.map(p => p.incomingId)),
    credits: pending.reduce((n,p) => n + Math.max(0, p.terms.fee - p.terms.compensation), 0),
    otherCredits: pending.reduce((n,p) => n + Math.max(0, p.terms.otherFee + p.terms.compensation), 0) };
}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertOpen(state: PreviewLedger) {
  requireRule(!state.locked, "A rodada está travada. Aguarde a reabertura.");
  requireRule(completeRoster(state.roster), "O elenco precisa ter 35 jogadores nas posições obrigatórias.");
}
function pair(state: PreviewLedger, outgoingId: string, incoming: Card) {
  const outgoing = state.roster.find(c => cardIdentity(c) === outgoingId);
  requireRule(outgoing && cardValue(outgoing) !== null && cardValue(incoming) !== null, "Card ou valor indisponível.");
  requireRule(positionOf(outgoing) !== null && positionOf(outgoing) === positionOf(incoming), "A reposição deve preservar a posição.");
  requireRule(!state.roster.some(c => cardIdentity(c) === cardIdentity(incoming)), "Este jogador já pertence ao elenco.");
  requireRule(allowedForPlan(incoming, state.plan), "Este clube não está permitido no plano.");
  requireRule(!state.events.some(e => e.cardId === cardIdentity(incoming) && e.kind === "ineligible"), "O substituto está indisponível neste cenário.");
  return outgoing;
}
export type PreviewAction =
  | { type: "listing"; cardId: string; publish: boolean }
  | { type: "reset"; catalogue: Card[]; plan: PreviewPlan; preferred?: string[] }
  | { type: "restore"; raw: string; catalogue: Card[] }
  | { type: "market"; outgoingId: string; incoming: Card }
  | { type: "propose"; id: string; outgoingId: string; incomingId: string; direction: LocalProposal["direction"]; replaces?: string }
  | { type: "resolve"; id: string; result: "accepted" | "rejected" | "cancelled" }
  | { type: "lock"; locked: boolean }
  | { type: "events"; events: PreviewEvent[] }
  | { type: "dismiss-error" };

/** All ownership and wallet changes are one immutable transition, including both sides. */
function transitionCore(state: PreviewLedger, action: PreviewAction): PreviewLedger {
  if (action.type === "reset") return createPreviewLedger(action.catalogue, action.plan, action.preferred);
  if (action.type === "restore") return restorePreview(action.raw, action.catalogue);
  if (action.type === "dismiss-error") return { ...state, error: null };
  if (action.type === "lock") return { ...state, locked: action.locked, error: null };
  if (action.type === "listing") return { ...state, error: null, listedIds: changeShowcaseListing({
    plan: state.plan, listedIds: state.listedIds, ownedIds: state.roster.map(cardIdentity),
    reservedIds: reservations(state).own, unavailableIds: new Set(state.events.filter(e => e.kind === "ineligible").map(e => e.cardId)),
    cardId: action.cardId, publish: action.publish, locked: state.locked,
  }) };
  if (action.type === "events") {
    requireRule(action.events.every(e => state.roster.some(c => cardIdentity(c) === e.cardId)), "Alerta sem jogador no elenco.");
    requireRule(new Set(action.events.map(e => e.cardId)).size === action.events.length, "Alerta duplicado.");
    return { ...state, events: action.events, error: null };
  }
  if (action.type === "resolve") {
    const proposal = state.proposals.find(p => p.id === action.id);
    requireRule(proposal?.state === "pending", "A proposta já foi encerrada ou não existe.");
    if (action.result !== "accepted") return { ...state, error: null, proposals: state.proposals.map(p => p.id === action.id ? { ...p, state: action.result } : p) };
    assertOpen(state);
    requireRule(completeRoster(state.otherRoster), "O outro elenco não está completo.");
    const incoming = state.otherRoster.find(c => cardIdentity(c) === proposal.incomingId);
    requireRule(incoming, "O card oferecido não está mais disponível.");
    const outgoing = pair(state, proposal.outgoingId, incoming);
    requireRule(!state.otherRoster.some(c => cardIdentity(c) === proposal.outgoingId), "O outro clube já possui o jogador oferecido.");
    requireRule(!state.events.some(e => e.cardId === proposal.outgoingId && e.kind === "ineligible"), "O card oferecido está indisponível. Revise ou cancele a proposta.");
    const quote = exchangeQuote(state.balance, cardValue(outgoing)!, cardValue(incoming)!, state.plan, "vip", proposal.direction);
    requireRule(quote && quote.fee === proposal.terms.fee && quote.otherFee === proposal.terms.otherFee && quote.bonus === proposal.terms.bonus && quote.otherBonus === proposal.terms.otherBonus && quote.compensation === proposal.terms.compensation, "As condições mudaram; prepare outra proposta.");
    const reserve = reservations(state, proposal.id);
    const otherFinal = state.otherBalance - quote.compensation - quote.otherFee + quote.otherBonus;
    requireRule(quote.final >= reserve.credits && otherFinal >= reserve.otherCredits, "Saldo insuficiente em um dos clubes, considerando as reservas.");
    return { ...state, error: null, balance: quote.final, otherBalance: otherFinal,
      listedIds: state.listedIds.filter(id => id !== proposal.outgoingId),
      roster: state.roster.map(c => cardIdentity(c) === proposal.outgoingId ? incoming : c),
      otherRoster: state.otherRoster.map(c => cardIdentity(c) === proposal.incomingId ? outgoing : c),
      events: state.events.filter(e => e.cardId !== proposal.outgoingId),
      proposals: state.proposals.map(p => p.id === action.id ? { ...p, state: "accepted" } : p) };
  }
  assertOpen(state);
  const reserved = reservations(state, action.type === "propose" ? action.replaces : undefined);
  if (action.type === "market") {
    const outgoing = pair(state, action.outgoingId, action.incoming);
    requireRule(!reserved.own.has(action.outgoingId), "Cancele a proposta pendente antes de substituir este card.");
    const quote = marketQuote(state.balance, cardValue(outgoing)!, cardValue(action.incoming)!, state.plan, state.events.some(e => e.cardId === action.outgoingId && e.kind === "injury") ? "injury" : "ordinary");
    requireRule(quote.final >= reserved.credits, "Saldo insuficiente após reservar os créditos das propostas.");
    return { ...state, error: null, balance: quote.final, listedIds: state.listedIds.filter(id => id !== action.outgoingId), roster: state.roster.map(c => cardIdentity(c) === action.outgoingId ? action.incoming : c), events: state.events.filter(e => e.cardId !== action.outgoingId) };
  }
  requireRule(state.plan !== "beta" && completeRoster(state.otherRoster), "Exchange indisponível neste cenário.");
  requireRule(action.id.length > 0 && !state.proposals.some(p => p.id === action.id), "Identificador de proposta duplicado.");
  if (action.replaces) requireRule(state.proposals.some(p => p.id === action.replaces && p.state === "pending"), "A proposta original já foi encerrada.");
  const incoming = state.otherRoster.find(c => cardIdentity(c) === action.incomingId);
  requireRule(incoming, "O card não pertence ao outro clube.");
  const outgoing = pair(state, action.outgoingId, incoming);
  requireRule(!state.otherRoster.some(c => cardIdentity(c) === action.outgoingId), "O outro clube já possui o jogador oferecido.");
  requireRule(!state.events.some(e => e.cardId === action.outgoingId && e.kind === "ineligible"), "Este card está indisponível para negociação.");
  requireRule(!reserved.own.has(action.outgoingId) && !reserved.other.has(action.incomingId), "Um dos cards já está reservado em outra proposta.");
  const terms = exchangeQuote(state.balance, cardValue(outgoing)!, cardValue(incoming)!, state.plan, "vip", action.direction)!;
  requireRule(terms.final >= reserved.credits && state.otherBalance - terms.compensation - terms.otherFee + terms.otherBonus >= reserved.otherCredits, "Saldo insuficiente em um dos clubes, considerando as reservas.");
  const original = state.proposals.find(p => p.id === action.replaces);
  const proposal: LocalProposal = { id: action.id, outgoingId: action.outgoingId, incomingId: action.incomingId, direction: action.direction, state: "pending", terms, ...(original ? { replaces: original.id } : {}) };
  return { ...state, error: null, proposals: [proposal, ...state.proposals.map(p => p.id === action.replaces ? { ...p, state: "countered" as const } : p)] };
}

export function transitionPreview(state: PreviewLedger, action: PreviewAction): PreviewLedger {
  if (action.type === "reset" || action.type === "restore" || action.type === "dismiss-error") return transitionCore(state, action);
  requireRule(state.journal.length < 500, "Este cenário atingiu 500 ações. Reinicie a simulação nas configurações.");
  const next = transitionCore(state, action);
  return { ...next, journal: [...state.journal, action] };
}

function signature(catalogue: Card[]) {
  return JSON.stringify(catalogue.map(c => [cardIdentity(c), cardValue(c), positionOf(c), c.clubName]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
}
/** Persist commands, never trust saved wallet totals or supplied card values. */
export function serializePreview(state: PreviewLedger, catalogue: Card[]) {
  return JSON.stringify({ version: 2, rules: CLUB_MARKET_RULES_VERSION, catalogue: signature(catalogue), plan: state.plan, initialRosterIds: state.initialRosterIds, initialOtherRosterIds: state.initialOtherRosterIds,
    actions: state.journal.map(a => a.type === "market" ? { type: a.type, outgoingId: a.outgoingId, incomingId: cardIdentity(a.incoming) } : a) });
}
export function restorePreview(raw: string, catalogue: Card[]): PreviewLedger {
  requireRule(raw.length <= 2_000_000, "Cenário salvo excede o limite local.");
  const saved = JSON.parse(raw);
  requireRule(saved && saved.version === 2 && saved.rules === CLUB_MARKET_RULES_VERSION && saved.catalogue === signature(catalogue), "O catálogo mudou ou o cenário salvo não é compatível.");
  requireRule(Object.hasOwn(PREVIEW_PLANS, saved.plan), "Plano salvo inválido.");
  requireRule(Array.isArray(saved.initialRosterIds) && saved.initialRosterIds.length <= 35 && saved.initialRosterIds.every((id: unknown) => typeof id === "string"), "Elenco inicial inválido.");
  requireRule(Array.isArray(saved.actions) && saved.actions.length <= 500, "Histórico local inválido.");
  requireRule((Array.isArray(saved.initialOtherRosterIds) && saved.initialOtherRosterIds.length === 35 && new Set(saved.initialOtherRosterIds).size === 35 && saved.initialOtherRosterIds.every((id: unknown) => typeof id === "string")), "Elenco visitante inválido.");
  const expectedOther = saved.initialOtherRosterIds;
  let state = createPreviewLedger(catalogue, saved.plan, saved.initialRosterIds, expectedOther);
  requireRule(JSON.stringify(state.initialOtherRosterIds) === JSON.stringify(expectedOther), "Elenco visitante incompatível com o catálogo.");
  requireRule(JSON.stringify(state.initialRosterIds) === JSON.stringify(saved.initialRosterIds), "Elenco inicial incompatível com o catálogo.");
  const cards = new Map(catalogue.map(c => [cardIdentity(c), c]));
  for (const item of saved.actions) {
    requireRule(item && typeof item === "object", "Ação salva inválida.");
    let action: PreviewAction;
    switch (item.type) {
      case "listing":
        requireRule(typeof item.cardId === "string" && typeof item.publish === "boolean", "Anúncio salvo inválido.");
        action = { type: "listing", cardId: item.cardId, publish: item.publish }; break;
      case "market": {
        const incoming = cards.get(item.incomingId);
        requireRule(incoming && typeof item.outgoingId === "string", "Card salvo inválido.");
        action = { type: "market", outgoingId: item.outgoingId, incoming }; break;
      }
      case "propose":
        requireRule(typeof item.id === "string" && typeof item.outgoingId === "string" && typeof item.incomingId === "string" && ["incoming", "outgoing"].includes(item.direction) && (item.replaces === undefined || typeof item.replaces === "string"), "Proposta salva inválida.");
        action = { type: "propose", id: item.id, outgoingId: item.outgoingId, incomingId: item.incomingId, direction: item.direction, ...(item.replaces === undefined ? {} : { replaces: item.replaces }) }; break;
      case "resolve":
        requireRule(typeof item.id === "string" && ["accepted", "rejected", "cancelled"].includes(item.result), "Resposta salva inválida.");
        action = { type: "resolve", id: item.id, result: item.result }; break;
      case "lock":
        requireRule(typeof item.locked === "boolean", "Trava salva inválida.");
        action = { type: "lock", locked: item.locked }; break;
      case "events":
        requireRule(Array.isArray(item.events) && item.events.length <= 35 && item.events.every((e: { cardId?: unknown; kind?: unknown } | null) => e && typeof e.cardId === "string" && ["injury", "transfer", "ineligible"].includes(String(e.kind))), "Alertas salvos inválidos.");
        action = { type: "events", events: item.events.map((e: PreviewEvent) => ({ cardId: e.cardId, kind: e.kind })) }; break;
      default: throw new Error("Ação desconhecida no histórico salvo.");
    }
    state = transitionPreview(state, action);
  }
  return state;
}

/** Rejections leave every wallet, card and proposal intact, with a user-facing reason. */
export function previewReducer(state: PreviewLedger, action: PreviewAction): PreviewLedger {
  try { return transitionPreview(state, action); }
  catch (error) { return { ...state, error: error instanceof Error ? error.message : "Operação local indisponível." }; }
}
