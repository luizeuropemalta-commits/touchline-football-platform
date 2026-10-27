"use client";

import { memo, useEffect, useMemo, useReducer, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowLeftRight, ArrowRight, Bell, Check, CheckCheck, ChevronRight, CircleAlert, Clock3, LayoutDashboard, LockKeyhole, Search, ShieldCheck, ShoppingBag, Smartphone, Users, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Logo } from "@/components/logo";
import pageStyles from "@/app/clubowner/market-game.module.css";
import ClubOwnerMarketHeader from "@/components/touchline/ClubOwnerMarketHeader";
import TouchlineLandscapeBoundary from "@/components/touchline/TouchlineLandscapeBoundary";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import TouchlineMarketPlayerTile from "@/components/touchline/market/TouchlineMarketPlayerTile";
import ClubOwnerExchangeShowcase, { ClubOwnerMarketArea } from "@/components/touchline/market/ClubOwnerExchangeShowcase";
import { CLUBOWNER_SHOWCASE_LIMIT, TOUCHLINE_TRANSFER_MARKET_NAME, selectShowcaseCards } from "@/components/touchline/market/exchange-showcase";
import canonicalMarketStyles from "@/app/fantasy/fantasy.module.css";
import { useTouchlineDialog, useTouchlineDialogScrollLock } from "@/components/touchline/a11y/TouchlineDialog";
import { TouchlineCoinMark } from "@/components/touchline/market/TouchlineMarketMarks";
import { type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { PREVIEW_PLANS, POSITIONS, allowedForPlan, cardIdentity, cardValue, positionOf, formatCredits, initialShowcaseIds, marketQuote, exchangeQuote } from "./preview-model";
import styles from "./MarketExperiencePreview.module.css";
import { createPreviewLedger, previewReducer, reservations, restorePreview, serializePreview, transitionPreview, type PreviewAction } from "./preview-ledger";
import PreviewNegotiationThread from "./PreviewNegotiationThread";
import ClubOwnerNegotiationRoom from "../market/ClubOwnerNegotiationRoom";

type Card = ClubOwnerSquadCard;
type View = "club" | "market" | "exchange" | "public" | "proposals";
type Deal = { kind: "market" | "exchange"; incoming: Card; outgoingId: string | null; sent?: boolean; replaces?: string };
type Props = { catalogue: Card[]; initialRosterIds?: string[]; participation?: Record<string, number> };
const views: { id: View; label: string; icon: typeof Users }[] = [
  { id: "club", label: "Meu ClubOwner", icon: Users },
  { id: "market", label: TOUCHLINE_TRANSFER_MARKET_NAME, icon: ShoppingBag },
  { id: "exchange", label: "Visitar ClubOwner", icon: ArrowLeftRight },
  { id: "public", label: "Ver minha vitrine pública", icon: Users },
  { id: "proposals", label: "Negociações", icon: LayoutDashboard },
];
const owner = { name: "Meu ClubOwner", avatarUrl: "", city: "", nationality: "", since: "" };
const EMPTY_IDS: string[] = [];
const EMPTY_PARTICIPATION: Record<string, number> = {};
const SESSION_KEY = "touchline:isolated-market-preview:v1";
const subscribeClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function Dialog({ label, close, children, narrow = false }: { label: string; close: () => void; children: ReactNode; narrow?: boolean }) {
  const { dialogProps } = useTouchlineDialog({ open: true, onDismiss: close, label });
  useTouchlineDialogScrollLock(true);
  return createPortal(<div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section {...dialogProps} className={`${styles.dialog} ${narrow ? styles.narrow : ""}`}>
      <div className={styles.dialogHeading}><h2>{label}</h2><Button variant="ghost" aria-label="Fechar" onClick={close}><X size={20} /></Button></div>
      {children}
    </section>
  </div>, document.body);
}

/** Original renderer and original zoom; no screenshot, social transport or second card design. */
const OriginalCard = memo(function OriginalCard({ card, width = 126 }: { card: Card; width?: number }) {
  return <TouchlineGameweekCard card={card} locale="pt-BR" displayWidth={width} />;
});

function Amount({ value }: { value: number }) { return <span className={styles.money}><TouchlineCoinMark size={16} />{formatCredits(value)}</span>; }

export default function MarketExperiencePreview(props: Props) {
  const clientReady = useSyncExternalStore(subscribeClient, clientSnapshot, serverSnapshot);
  return clientReady ? <ReadyMarketExperiencePreview {...props} /> : <p role="status">Carregando ClubOwner…</p>;
}

function ReadyMarketExperiencePreview({ catalogue, initialRosterIds = EMPTY_IDS, participation = EMPTY_PARTICIPATION }: Props) {
  const [initial] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return { ledger: raw ? restorePreview(raw, catalogue) : createPreviewLedger(catalogue, "standard", initialRosterIds), warning: null };
    } catch {
      return { ledger: createPreviewLedger(catalogue, "standard", initialRosterIds), warning: "Não foi possível recuperar suas alterações nesta aba. O conteúdo salvo foi preservado." };
    }
  });
  const [ledger, dispatch] = useReducer(previewReducer, initial.ledger);
  const { plan, roster, balance, proposals, events: reviewEvents, locked: roundLocked, otherRoster: exchangeCards } = ledger;
  function applyAction(action: PreviewAction) {
    try {
      transitionPreview(ledger, action); dispatch(action);
      if (action.type === "resolve") {
        setRead(false);
      }
      return true;
    }
    catch { dispatch(action); return false; }
  }
  const [view, setView] = useState<View>("club");
  const isVisitor = view === "exchange" || view === "public";
  const listing = ledger.listedIds;
  const [listingSearch, setListingSearch] = useState("");
  const [listingPage, setListingPage] = useState(0);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");
  const [club, setClub] = useState("ALL");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<"notifications" | "listings" | null>(null);
  const [read, setRead] = useState(false);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.warning);
  const policy = PREVIEW_PLANS[plan];
  const rosterIds = useMemo(() => new Set(roster.map(cardIdentity)), [roster]);
  const catalogueById = useMemo(() => new Map(catalogue.map(c => [cardIdentity(c), c])), [catalogue]);
  const fullRoster = roster.length === 35 && POSITIONS.every(p => roster.filter(c => positionOf(c) === p.key).length === p.count);

  useEffect(() => {
    if (storageWarning) return;
    try { sessionStorage.setItem(SESSION_KEY, serializePreview(ledger, catalogue)); }
    catch {
      // Report a failure of the external storage API once; this is not derived UI state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageWarning("Não foi possível salvar as alterações nesta aba. Evite recarregar até resolver o armazenamento.");
    }
  }, [ledger, catalogue, storageWarning]);

  useEffect(() => {
    const navigate = () => { const next = location.hash.slice(1); if (views.some(v => v.id === next)) setView(next as View); };
    navigate(); window.addEventListener("hashchange", navigate); return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const navigate = (next: View) => { setPage(0); setSearch(""); setPosition("ALL"); setClub("ALL"); setReplacementId(null); setView(next); window.location.assign(`#${next}`); };
  const available = catalogue.filter(c => allowedForPlan(c, plan) && cardValue(c) !== null && positionOf(c) !== null && !rosterIds.has(cardIdentity(c)));
  // Explicit demo listings, not the visitor's private 35-card inventory.
  const [demoVisitorListingIds] = useState(() => initialShowcaseIds(initial.ledger.otherRoster));
  const visitorCards = selectShowcaseCards(exchangeCards, demoVisitorListingIds, cardIdentity);
  const ownListedCards = selectShowcaseCards(roster, listing, cardIdentity);
  const listingCandidates = roster.filter(c => `${c.name} ${c.clubName}`.toLocaleLowerCase("pt-BR").includes(listingSearch.toLocaleLowerCase("pt-BR")));
  const listingPageIndex = Math.min(listingPage, Math.max(0, Math.ceil(listingCandidates.length / 8) - 1));
  const base = view === "club" ? ownListedCards : view === "exchange" ? visitorCards : [...available].sort((a, b) => cardValue(b)! - cardValue(a)! || a.name.localeCompare(b.name));
  const filtered = base.filter(c => (position === "ALL" || positionOf(c) === position)
    && (club === "ALL" || c.clubName === club)
    && `${c.name} ${c.clubName}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const clubs = [...new Set(base.map(c => c.clubName))].sort();
  const outgoing = deal ? roster.find(c => cardIdentity(c) === deal.outgoingId) : undefined;
  const returnEvent = outgoing ? reviewEvents.find(event => event.cardId === cardIdentity(outgoing)) : undefined;
  const market = deal && outgoing && deal.kind === "market" ? marketQuote(balance, cardValue(outgoing)!, cardValue(deal.incoming)!, plan, returnEvent?.kind === "injury" ? "injury" : "ordinary") : null;
  const exchange = deal && outgoing && deal.kind === "exchange" ? exchangeQuote(balance, cardValue(outgoing)!, cardValue(deal.incoming)!, plan, "vip") : null;
  const finalBalance = market?.final ?? exchange?.final ?? null;
  const reservation = reservations(ledger, deal?.replaces);
  const reserved = reservation.own;
  const candidates = deal ? roster.filter(c => positionOf(c) === positionOf(deal.incoming)) : [];
  const validDeal = !!deal && !!outgoing && fullRoster && !roundLocked && finalBalance !== null && finalBalance >= reservation.credits
    && !reserved.has(cardIdentity(outgoing)) && !rosterIds.has(cardIdentity(deal.incoming))
    && positionOf(outgoing) === positionOf(deal.incoming)
    && (deal.kind !== "exchange" || (!reservation.other.has(cardIdentity(deal.incoming)) && !!exchange && ledger.otherBalance - exchange.compensation - exchange.otherFee + exchange.otherBonus >= reservation.otherCredits && !reviewEvents.some(e => e.cardId === cardIdentity(outgoing) && e.kind === "ineligible")));
  const openDeal = (incoming: Card, kind: Deal["kind"]) => setDeal({ incoming, kind, outgoingId: kind === "market" ? replacementId : null });
  function completeDeal(direction: "incoming" | "outgoing" = "outgoing") {
    if (!validDeal || !deal || !outgoing || finalBalance === null) return;
    if (deal.kind === "exchange") {
      const id = crypto.randomUUID();
      if (!applyAction({ type: "propose", id, outgoingId: cardIdentity(outgoing), incomingId: cardIdentity(deal.incoming), direction, ...(deal.replaces ? { replaces: deal.replaces } : {}) })) return;
      setRead(false); setDeal(null); setThreadId(id); navigate("proposals");
    } else {
      if (!applyAction({ type: "market", outgoingId: cardIdentity(outgoing), incoming: deal.incoming })) return;
      setDeal(null); setNotice(`${deal.incoming.name} entrou no elenco. ${outgoing.name} foi devolvido ao TouchLine Market.`);
      setReplacementId(null);
    }
  }
  function findReplacement(card: Card) {
    setPanel(null); navigate("market"); setPosition(positionOf(card) ?? "ALL"); setReplacementId(cardIdentity(card));
  }
  const injuredKeepers = reviewEvents.filter(event => event.kind === "injury" && roster.some(c => cardIdentity(c) === event.cardId && positionOf(c) === "GK")).length;
  const thread = proposals.find(p => p.id === threadId);
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(filtered.length / 36) - 1));

  return <TouchlineLandscapeBoundary locale="pt-BR" skipLabel="Ir para o conteúdo">
    <div className={`${pageStyles.page} ${styles.app}`} data-market-preview="local-only" data-view={view}>
      <header className={styles.topbar}>
        <Logo href="#club" officialArena minimalMark subtitle="TouchLine Futebol Cards" wordmarkClassName="text-[clamp(26px,3.2vw,34px)]" />
        <nav className={styles.navigation} aria-label="Mercados e elenco">{views.map(({ id, label, icon: Icon }) => <Button key={id} variant={view === id ? "primary" : "ghost"} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={16} />{label}{id === "proposals" && proposals.some(p => p.state === "pending") ? <span className={styles.count}>{proposals.filter(p => p.state === "pending").length}</span> : null}</Button>)}</nav>
        <div className={styles.topActions}><Button variant="secondary" aria-label={!read && (proposals.length || reviewEvents.length) ? "Notificações não lidas" : "Notificações"} onClick={() => { setPanel("notifications"); setRead(true); }}><Bell size={19} />{!read && (proposals.length || reviewEvents.length) ? <i className={styles.dot} /> : null}</Button></div>
      </header>
      <main className={`${pageStyles.content} ${styles.main}`}>
        <div className={styles.breadcrumb}>TouchLine <ChevronRight size={12} /> {views.find(v => v.id === view)?.label}</div>
        {storageWarning ? <p role="status" className={styles.warning}>{storageWarning}</p> : null}
        {ledger.error ? <div role="alert" className={styles.warning}><CircleAlert size={18} /><span>{ledger.error}</span><Button variant="ghost" aria-label="Dispensar erro" onClick={() => dispatch({ type: "dismiss-error" })}><X size={16} /></Button></div> : null}
        {!isVisitor && reservation.credits > 0 ? <p className={styles.feeHint}>Saldo total: {formatCredits(balance)} · reservado em propostas: {formatCredits(reservation.credits)} · livre: {formatCredits(balance - reservation.credits)}</p> : null}
        {view === "club" ? <>
          <ClubOwnerMarketHeader key={plan} owner={owner} locale="pt-BR" plan={{ active: true, expiresAt: null }} activePlanKey={plan} activePlanBudget={policy.budget} remainingMarketPower={balance} />
        </> : isVisitor ? <>
          <ClubOwnerMarketHeader key={`visitor-${view}-${plan}`} owner={view === "public" ? owner : { ...owner, name: "ClubOwner United" }} locale="pt-BR" identityOnly plan={{ active: true, expiresAt: null }} activePlanKey={view === "public" ? plan : "vip"} />
        </> : <div className={styles.marketHero}><div><h1>{views.find(v => v.id === view)?.label}</h1><p>{view === "proposals" ? "Cada proposta, seus dois cards e todas as condições." : "Encontre o jogador para a próxima posição do seu elenco."}</p></div><div className={styles.heroBalance}><span>Saldo total</span><Amount value={balance} /><small>{policy.name} · {policy.market}% no Market</small></div></div>}
        {notice ? <div role="status" className={styles.success}><CheckCheck size={18} /><span>{notice}</span><Button variant="ghost" aria-label="Dispensar aviso" onClick={() => setNotice(null)}><X size={16} /></Button></div> : null}
        {!isVisitor && !fullRoster ? <div className={styles.warning} role="alert"><CircleAlert size={18} />Não foi possível completar as 35 posições dentro deste orçamento. As operações estão indisponíveis.</div> : null}
        {view === "market" && replacementId ? <div className={styles.success}><ArrowLeftRight size={18} /><span>Escolha quem entra no lugar de <b>{catalogueById.get(replacementId)?.name}</b>.</span><Button variant="ghost" onClick={() => setReplacementId(null)}>Limpar seleção</Button></div> : null}
        {roundLocked ? <div className={styles.warning}><LockKeyhole size={18} />Rodada travada. Seus cards e propostas continuam visíveis; alterações aguardam a reabertura.</div> : null}

        {view === "club" ? <>
          <ClubOwnerMarketArea audience="owner" onOpenExchange={() => setPanel("listings")} />
          <ClubOwnerExchangeShowcase cards={ownListedCards} locale="pt-BR" plan={plan} onManage={() => setPanel("listings")} renderAction={card => <Button variant="secondary" onClick={() => applyAction({ type: "listing", cardId: cardIdentity(card), publish: false })}>Retirar da vitrine</Button>} />
        </> : view === "public" ? <ClubOwnerMarketArea audience="visitor" showcase={{ cards: ownListedCards, locale: "pt-BR", plan }} /> : view === "exchange" ? <ClubOwnerMarketArea audience="visitor" showcase={{ cards: visitorCards, locale: "pt-BR", plan: "vip", renderAction: card => <Button disabled={roundLocked || rosterIds.has(cardIdentity(card)) || reservation.other.has(cardIdentity(card))} onClick={() => openDeal(card, "exchange")}>{reservation.other.has(cardIdentity(card)) ? "Em negociação" : "Propor troca"}</Button> }} /> : view === "proposals" ? <section className={styles.proposalList}>
          <div className={styles.sectionHeading}><h2>Suas propostas</h2><span>{proposals.filter(p => p.state === "pending").length} em andamento</span></div>
          {proposals.length === 0 ? <div className={styles.empty}><ArrowLeftRight size={32} /><h3>A próxima negociação começa com você.</h3><p>Escolha um card no Exchange e ofereça um jogador do seu elenco.</p><Button onClick={() => navigate("exchange")}>Explorar ClubOwner Exchange</Button></div> : proposals.map(p => {
            const a = catalogueById.get(p.outgoingId), b = catalogueById.get(p.incomingId); if (!a || !b) return null;
            const labels = { pending: "Aguardando resposta", accepted: "Concluída", rejected: "Recusada", cancelled: "Cancelada", countered: "Substituída por contraproposta" };
            return <article key={p.id} className={styles.proposalRow}><div className={styles.proposalPair}><OriginalCard card={a} width={84} /><ArrowLeftRight size={24} /><OriginalCard card={b} width={84} /></div><div><span className={styles.eyebrow}>{p.direction === "outgoing" ? "ENVIADA" : "RECEBIDA"} · CLUBOWNER UNITED · VIP</span><h3>{a.name} <ArrowRight size={16} /> {b.name}</h3><p><Clock3 size={14} />{labels[p.state]}</p><small>Sua taxa: {formatCredits(p.terms.fee)} · Compensação {p.terms.compensation >= 0 ? "a receber" : "a pagar"}: {formatCredits(Math.abs(p.terms.compensation))}</small></div><div className={styles.actions}><Button variant="secondary" onClick={() => setThreadId(p.id)}>Revisar proposta</Button>{p.state === "pending" && p.direction === "outgoing" ? <Button variant="ghost" onClick={() => applyAction({ type: "resolve", id: p.id, result: "cancelled" })}>Cancelar</Button> : null}</div></article>;
          })}
        </section> : <>
          <section className={styles.catalogue} aria-label="Cards disponíveis">
            <div className={styles.filters}><label className={styles.search}><Search size={17} /><Input aria-label="Buscar jogador" placeholder="Buscar jogador ou clube" value={search} onChange={e => { setPage(0); setSearch(e.target.value); }} /></label><label className={styles.select}>Posição<select aria-label="Filtrar por posição" value={position} onChange={e => { setPage(0); setPosition(e.target.value); }}><option value="ALL">Todas as posições</option>{POSITIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label><label className={styles.select}>Clube<select aria-label="Filtrar por clube" value={club} onChange={e => { setPage(0); setClub(e.target.value); }}><option value="ALL">Todos os clubes</option>{clubs.map(c => <option key={c}>{c}</option>)}</select></label><span className={styles.results}>{filtered.length} cards</span></div>
            <div className={canonicalMarketStyles.myClubMarketResults}>{filtered.slice(pageIndex * 36, (pageIndex + 1) * 36).map(card => <TouchlineMarketPlayerTile key={cardIdentity(card)} card={card} locale="pt-BR"><Button disabled={roundLocked || rosterIds.has(cardIdentity(card))} onClick={() => openDeal(card, "market")}>Selecionar</Button></TouchlineMarketPlayerTile>)}</div>
            {filtered.length === 0 ? <div className={styles.empty}><Search size={28} /><h3>Nenhum card encontrado.</h3><p>Altere o nome, a posição ou o clube.</p><Button variant="secondary" onClick={() => { setSearch(""); setClub("ALL"); setPosition("ALL"); }}>Limpar filtros</Button></div> : null}
            {filtered.length > 36 ? <nav aria-label="Páginas de jogadores" className={styles.pagination}><Button variant="secondary" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>Anterior</Button><span role="status">Página {pageIndex + 1} de {Math.ceil(filtered.length / 36)} · {filtered.length} cards</span><Button variant="secondary" disabled={(pageIndex + 1) * 36 >= filtered.length} onClick={() => setPage(pageIndex + 1)}>Próxima</Button></nav> : null}
          </section>
        </>}
        <footer className={styles.footer}><ShieldCheck size={15} />Valor fixo do card · taxas por operação<span>TOUCHLINE</span></footer>
      </main>
    </div>

    {deal ? <Dialog label={deal.sent ? "Proposta enviada" : deal.kind === "exchange" ? "Preparar proposta" : "Substituir jogador"} close={() => setDeal(null)}>
      {deal.kind === "exchange" ? <ClubOwnerNegotiationRoom plan={plan} compact /> : null}
      {market && returnEvent?.kind === "injury" ? <p className={styles.feeHint}>A substituição por lesão segue a taxa normal do seu plano.</p> : null}
      {deal.sent ? <div className={styles.sentState}><CheckCheck size={28} /><h3>Aguardando resposta</h3><p>Jogadores e créditos só mudam de dono após o aceite.</p><Button onClick={() => { setDeal(null); navigate("proposals"); }}>Acompanhar negociação</Button></div> : null}
      <div className={styles.dealLayout}>
        <div className={styles.dealCards}>
          <section><span className={styles.eyebrow}>VOCÊ ENTREGA</span>{outgoing ? <><OriginalCard card={outgoing} width={150} /><h3>{outgoing.name}</h3><Amount value={cardValue(outgoing)!} /></> : <div className={styles.cardPlaceholder}><ArrowLeftRight size={28} /><p>Escolha seu card abaixo</p></div>}</section><ArrowLeftRight className={styles.swapArrow} size={24} /><section><span className={styles.eyebrow}>VOCÊ RECEBE</span><OriginalCard card={deal.incoming} width={150} /><h3>{deal.incoming.name}</h3><Amount value={cardValue(deal.incoming)!} /></section>
        </div>
        <aside className={styles.dealSummary}><h3>Resumo da operação</h3>
          {outgoing && (market || exchange) ? <><dl><div><dt>Saldo atual</dt><dd>{formatCredits(balance)}</dd></div>{exchange ? <><div><dt>{exchange.compensation >= 0 ? "Compensação a receber" : "Compensação a pagar"}</dt><dd>{exchange.compensation >= 0 ? "+" : "−"}{formatCredits(Math.abs(exchange.compensation))}</dd></div><div><dt>Base da taxa · maior valor entre os cards</dt><dd>{formatCredits(exchange.feeBase)}</dd></div><div><dt>Sua taxa · {policy.name} {exchange.rate}%</dt><dd>−{formatCredits(exchange.fee)}</dd></div><div className={styles.counterparty}><dt>Taxa do outro ClubOwner · VIP {exchange.otherRate}%</dt><dd>{formatCredits(exchange.otherFee)}</dd></div><div><dt>Bônus de quem aceita</dt><dd>{formatCredits(exchange.otherBonus)}</dd></div></> : market ? <><div><dt>Valor do card devolvido</dt><dd>{formatCredits(cardValue(outgoing)!)}</dd></div><div><dt>Taxa TouchLine Market · {market.rate}%</dt><dd>−{formatCredits(market.fee)}</dd></div><div><dt>Você recebe</dt><dd>{formatCredits(market.refund)}</dd></div><div><dt>Contratação</dt><dd>−{formatCredits(cardValue(deal.incoming)!)}</dd></div></> : null}<div className={styles.finalBalance}><dt>Seu saldo após concluir</dt><dd data-final-balance={finalBalance}>{formatCredits(finalBalance!)}</dd></div></dl><p className={styles.feeHint}>{exchange ? "A taxa incide sobre o card de maior valor e é paga por quem propõe. Metade é creditada no saldo de quem aceita e metade sai de circulação. O bônus não altera o valor dos cards." : "Não há uma segunda taxa na contratação. Seu elenco continua com 35 jogadores."}</p></> : <p>Escolha o card que você oferece para calcular a diferença, a taxa e o saldo final.</p>}
          {!deal.sent && finalBalance !== null && finalBalance < reservation.credits ? <p role="alert" className={styles.insufficient}>Faltam {formatCredits(reservation.credits - finalBalance)} de saldo livre. Os créditos reservados em outras propostas não podem ser gastos.</p> : null}
          {exchange && ledger.otherBalance - exchange.compensation - exchange.otherFee + exchange.otherBonus < reservation.otherCredits ? <p role="alert" className={styles.insufficient}>O outro ClubOwner não tem saldo livre para esta proposta. Escolha outra combinação.</p> : null}
          {deal.kind === "exchange" && outgoing && reviewEvents.some(e => e.cardId === cardIdentity(outgoing) && e.kind === "ineligible") ? <p role="alert" className={styles.insufficient}>Este jogador não está elegível para troca.</p> : null}
          {!deal.sent && outgoing && reserved.has(cardIdentity(outgoing)) ? <p className={styles.insufficient}>Este card já está em uma proposta pendente. Cancele-a antes de preparar outra.</p> : null}
          {reservation.credits > 0 ? <p className={styles.feeHint}>Outras propostas reservam {formatCredits(reservation.credits)}. Esse valor não pode ser gasto nesta operação.</p> : null}
          {ledger.error ? <p role="alert" className={styles.insufficient}>{ledger.error}</p> : null}
          {!deal.sent ? <Button onClick={() => completeDeal()} disabled={!validDeal}>{deal.kind === "exchange" ? deal.replaces ? "Enviar contraproposta" : "Enviar proposta" : "Confirmar substituição"}<ArrowRight size={16} /></Button> : null}
        </aside>
      </div>
      {!deal.sent ? <section className={styles.chooseOffer}><h3>Escolha o card que você entrega</h3><p>Mesma posição para manter a composição do elenco.</p><div className={styles.offerOptions}>{candidates.map(c => <Button key={cardIdentity(c)} variant={deal.outgoingId === cardIdentity(c) ? "primary" : "secondary"} disabled={reserved.has(cardIdentity(c))} aria-pressed={deal.outgoingId === cardIdentity(c)} onClick={() => setDeal({ ...deal, outgoingId: cardIdentity(c) })}><span>{c.name}<small>{formatCredits(cardValue(c)!)}</small></span>{deal.outgoingId === cardIdentity(c) ? <Check size={16} /> : null}</Button>)}</div></section> : null}
      <div className={styles.comparison}><h3>Compare antes de decidir</h3><table><thead><tr><th>Informação</th><th>{outgoing?.shortName ?? "Seu card"}</th><th>{deal.incoming.shortName}</th></tr></thead><tbody><tr><th>Posição</th><td>{outgoing?.position ?? "—"}</td><td>{deal.incoming.position}</td></tr><tr><th>Clube</th><td>{outgoing?.clubName ?? "—"}</td><td>{deal.incoming.clubName}</td></tr><tr><th>Pontos na temporada</th><td>{outgoing?.seasonTouchlinePoints ?? "—"}</td><td>{deal.incoming.seasonTouchlinePoints ?? "—"}</td></tr><tr><th>Minutos · últimas 5 partidas</th><td>{outgoing ? participation[cardIdentity(outgoing)] ?? "—" : "—"}</td><td>{participation[cardIdentity(deal.incoming)] ?? "—"}</td></tr><tr><th>Condição confirmada</th><td>Sem informação</td><td>Sem informação</td></tr></tbody></table></div>
    </Dialog> : null}
    {panel === "notifications" ? <Dialog label="Notificações" narrow close={() => setPanel(null)}>
      <div className={styles.phoneStatus}><Smartphone size={23} /><div><strong>Avisos também no telefone</strong><p>Notificações no telefone não estão habilitadas.</p></div><span>Não habilitado</span></div>
      {injuredKeepers >= 2 ? <div className={styles.warning} role="alert"><CircleAlert size={22} /><div><b>Atenção ao gol</b><p>Dois goleiros indisponíveis. Revise as opções de reposição antes da próxima escalação.</p></div></div> : null}
      <div className={styles.notificationList}>
        {reviewEvents.map(event => { const card = catalogueById.get(event.cardId); if (!card) return null; return <article key={event.cardId}>
          {event.kind === "injury" ? <Image src="/touchlineArena/status-badges/injury-cross.png" alt="Lesão" width={36} height={36} unoptimized /> : <ArrowLeftRight size={23} />}
          <div><h3>{event.kind === "injury" ? "Lesão confirmada" : event.kind === "transfer" ? "Mudança de clube: você decide" : "Saída dos clubes permitidos"}</h3><p><b>{card.name}</b> · {event.kind === "injury" ? "O card continua no elenco até você escolher um substituto." : event.kind === "transfer" ? "Você pode manter o card. A substituição voluntária segue a taxa normal." : "Escolha outro jogador elegível para recompor seu elenco."}</p><div className={styles.actions}><Button variant="secondary" onClick={() => findReplacement(card)}>Escolher substituto</Button>{event.kind === "transfer" ? <Button variant="ghost" onClick={() => dispatch({ type: "events", events: reviewEvents.filter(item => item.cardId !== event.cardId) })}>Manter no elenco</Button> : null}</div></div>
        </article>; })}
        {proposals.slice(0, 10).map(p => <article key={p.id}><ArrowLeftRight size={23} /><div><h3>{p.state === "pending" ? p.direction === "incoming" ? "Proposta recebida" : "Proposta aguardando resposta" : p.state === "accepted" ? "Troca concluída" : p.state === "rejected" ? "Proposta recusada" : p.state === "countered" ? "Contraproposta preparada" : "Proposta cancelada"}</h3><p>{catalogueById.get(p.outgoingId)?.name} ⇄ {catalogueById.get(p.incomingId)?.name}</p><Button variant="secondary" onClick={() => { setPanel(null); navigate("proposals"); setThreadId(p.id); }}>Abrir negociação</Button></div></article>)}
        {!reviewEvents.length && !proposals.length ? <div className={styles.empty}><Bell size={30} /><h3>Você está em dia.</h3><p>Propostas, lesões confirmadas e mudanças de clube aparecerão aqui.</p></div> : null}
      </div><div className={styles.notificationGuide}><ShieldCheck size={18} /><p>Alertas importantes permanecem no site, mesmo quando o telefone não está habilitado.</p></div>
    </Dialog> : null}
    {panel === "listings" ? <Dialog label="Gerenciar vitrine · ClubOwner Exchange" close={() => setPanel(null)}>
      <p role="status">{listing.length}/{CLUBOWNER_SHOWCASE_LIMIT} na vitrine</p>
      <p>Em negociação: fora da rodada. Retirar o anúncio não cancela propostas pendentes.</p>
      <>
        <Input aria-label="Pesquisar no meu elenco" placeholder="Pesquisar jogador ou clube" value={listingSearch} onChange={e => { setListingSearch(e.target.value); setListingPage(0); }} />
        <div className={styles.listingPicker}>{listingCandidates.slice(listingPageIndex * 8, (listingPageIndex + 1) * 8).map(card => {
          const id = cardIdentity(card), listed = listing.includes(id);
          const blocked = !listed && (roundLocked || listing.length >= CLUBOWNER_SHOWCASE_LIMIT || reserved.has(id) || reviewEvents.some(e => e.cardId === id && e.kind === "ineligible"));
          return <div key={id}><OriginalCard card={card} width={68} /><span><strong>{card.name}</strong><small>{card.clubName} · {positionOf(card)}</small></span><Button variant="secondary" aria-pressed={listed} disabled={blocked} onClick={() => applyAction({ type: "listing", cardId: id, publish: !listed })}>{listed ? "Retirar anúncio" : "Colocar na vitrine"}</Button></div>;
        })}</div>
        {listingCandidates.length === 0 ? <p>Nenhum jogador encontrado.</p> : null}
        <nav aria-label="Páginas do elenco privado" className={styles.pagination}><Button variant="secondary" disabled={listingPageIndex === 0} onClick={() => setListingPage(listingPageIndex - 1)}>Anterior</Button><span>Página {listingPageIndex + 1} de {Math.max(1, Math.ceil(listingCandidates.length / 8))}</span><Button variant="secondary" disabled={(listingPageIndex + 1) * 8 >= listingCandidates.length} onClick={() => setListingPage(listingPageIndex + 1)}>Próxima</Button></nav>
      </>
      {ledger.error ? <p role="alert">{ledger.error}</p> : null}
    </Dialog> : null}
    {thread ? <Dialog label="Negociação" close={() => setThreadId(null)}><PreviewNegotiationThread key={thread.id} proposal={thread} ledger={ledger} onAction={applyAction} renderCard={id => { const card = catalogueById.get(id); return card ? <OriginalCard card={card} width={130} /> : null; }} onCounter={() => { const incoming = catalogueById.get(thread.incomingId); if (incoming) { setThreadId(null); setDeal({ kind: "exchange", incoming, outgoingId: thread.outgoingId, replaces: thread.id }); } }} /></Dialog> : null}
  </TouchlineLandscapeBoundary>;
}
