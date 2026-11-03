"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, ArrowLeftRight } from 'lucide-react';
import { parsePublicMarket, parsePublicMarketCommand, parsePublicMarketQuote, marketStatus, type PublicMarket, type PublicMarketCommand, type PublicMarketQuote } from '@/lib/touchlineArena/clubowner-public-market-contract';
import type { PeopleLocale } from '@/lib/touchlineArena/clubowner-public-contract';
import TouchlineCreditAmount from '../market/TouchlineCreditAmount';
import controls from '../TouchlineGlobalNavigation.module.css';
import styles from './ClubOwnerPublicMarket.module.css';

const words = {
  'pt-BR': { title: 'Mercado de trocas', intro: 'Cards anunciados por este ClubOwner. O restante do elenco é privado.', loading: 'Consultando mercado…',
    empty: 'Nenhum card anunciado para troca.', error: 'Não foi possível confirmar o mercado. Atualize os dados.', refresh: 'Atualizar mercado',
    own: 'Seu card anunciado', choose: 'Escolha seu card', incoming: 'Card recebido', outgoing: 'Card oferecido', fee: 'Taxa de negociação', difference: 'Diferença em TC', bonus: 'Bônus para quem recebe a proposta',
    propose: 'Preparar proposta', send: 'Enviar proposta', sending: 'Enviando…', sent: 'Proposta confirmada no Exchange. A troca depende do aceite.',
    uncertain: 'O envio ainda não foi confirmado. Confira a mesma proposta antes de iniciar outra.', retry: 'Conferir o envio', manage: 'Abrir meu Exchange',
    blocked: 'Beta negocia somente com Beta.', unlock: 'Ver planos', noOwn: 'Anuncie um card da mesma posição no seu Exchange para propor uma troca.',
    complete: 'Complete seu elenco para negociar no Exchange.', stale: 'O mercado mudou. Atualize os dados antes de preparar outra proposta.',
    closed: 'Esta proposta não está disponível nas condições atuais da temporada ou da rodada.', storage: 'Não foi possível guardar a confirmação deste envio. Abra seu Exchange para continuar.',
    estimate: 'Valores da proposta. A confirmação final aparece no Exchange; nenhum card é transferido antes do aceite.', login: 'Entre em uma conta ClubOwner para consultar o mercado.',
    unavailable: 'O mercado de trocas está temporariamente indisponível.', limited: 'Aguarde um minuto antes de consultar novamente.', cancelled: 'Voltar aos cards' },
  'en-GB': { title: 'Transfer market', intro: 'Cards listed by this ClubOwner. The rest of the squad is private.', loading: 'Checking the market…',
    empty: 'No cards listed for exchange.', error: 'The market could not be confirmed. Refresh the data.', refresh: 'Refresh market',
    own: 'Your listed card', choose: 'Choose your card', incoming: 'Card received', outgoing: 'Card offered', fee: 'Negotiation fee', difference: 'Difference in TC', bonus: 'Bonus for the proposal recipient',
    propose: 'Prepare proposal', send: 'Send proposal', sending: 'Sending…', sent: 'Proposal confirmed in Exchange. The trade requires acceptance.',
    uncertain: 'The submission is not confirmed yet. Check this same proposal before starting another.', retry: 'Check submission', manage: 'Open my Exchange',
    blocked: 'Beta can negotiate only with Beta.', unlock: 'View plans', noOwn: 'List a card in the same position in your Exchange to propose a trade.',
    complete: 'Complete your squad to negotiate in Exchange.', stale: 'The market changed. Refresh the data before preparing another proposal.',
    closed: 'This proposal is unavailable under the current season or round conditions.', storage: 'The submission confirmation could not be saved. Open your Exchange to continue.',
    estimate: 'Proposal values. The final confirmation appears in Exchange; no card moves before acceptance.', login: 'Sign in to a ClubOwner account to view the market.',
    unavailable: 'The transfer market is temporarily unavailable.', limited: 'Wait one minute before checking again.', cancelled: 'Back to cards' },
};
class MarketRequestError extends Error { constructor(readonly status: number, code: string) { super(code); } }
export default function ClubOwnerPublicMarket({ publicId, locale }: { publicId: string; locale: PeopleLocale }) {
  const copy = words[locale], endpoint = `/api/touchline/clubowners/${publicId}/market`;
  const storageKey = (scope: { context: string; seasonId: string }) => `touchline.public-market.intent.v1:${publicId}:${scope.context}:${scope.seasonId}`;
  const [market, setMarket] = useState<PublicMarket | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [selected, setSelected] = useState(''), [outgoing, setOutgoing] = useState('');
  const [pending, setPending] = useState<PublicMarketCommand | null>(null), [sent, setSent] = useState<string | null>(null), [storageFailed, setStorageFailed] = useState(false);
  const [confirmedQuote, setConfirmedQuote] = useState<PublicMarketQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true), lock = useRef(false), epoch = useRef(0), controller = useRef<AbortController | null>(null);
  const ownHref = `/clubowner?lang=${locale}#clubowner-exchange`;
  function message(code: string) {
    if (code === 'AUTH_REQUIRED' || code === 'CLUB_ACCESS_REQUIRED') return copy.login;
    if (code === 'CLUB_COMPLETE_ROSTER_REQUIRED') return copy.complete;
    if (code === 'CLUB_BETA_EXCHANGE_ONLY') return copy.blocked;
    if (['CLUB_STALE_REVISION','CLUB_CONTEXT_CHANGED','CLUB_PLAYER_NOT_LISTED'].includes(code)) return copy.stale;
    if (['CLUB_SEASON_CLOSED','CLUB_PLAYER_ROUND_LOCKED','CLUB_MATCH_RELATED_PLAYER','CLUB_PLAYER_UNAVAILABLE','CLUB_PLAYER_RESERVED'].includes(code)) return copy.closed;
    if (code === 'CLUB_EXCHANGE_UNAVAILABLE' || code === 'PEOPLE_NOT_FOUND') return copy.unavailable;
    return code === 'RATE_LIMITED' ? copy.limited : copy.error;
  }
  async function request(body?: PublicMarketCommand) {
    const current = new AbortController(); controller.current = current;
    const timer = setTimeout(() => current.abort(), 25_000);
    try {
      const response = await fetch(endpoint, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: current.signal,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new MarketRequestError(response.status, typeof payload?.error === 'string' ? payload.error : 'UNAVAILABLE');
      return payload;
    } finally { clearTimeout(timer); if (controller.current === current) controller.current = null; }
  }
  async function refresh() {
    if (lock.current) return;
    const generation = epoch.current;
    lock.current = true; setLoading(true); setError(''); setSelected(''); setOutgoing(''); setSent(null); setConfirmedQuote(null); setStorageFailed(false);
    try {
      const next = parsePublicMarket((await request()).market, publicId);
      if (!alive.current || generation !== epoch.current) return;
      setMarket(next);
      const saved = sessionStorage.getItem(storageKey(next));
      if (saved) {
        const command = parsePublicMarketCommand(JSON.parse(saved));
        if (!command) throw new Error('INTENT_STORAGE');
        if (command.context !== next.context || command.seasonId !== next.seasonId) {
          // Retain the other session/season's evidence; never replay into this account.
          setStorageFailed(true); setPending(null); return;
        }
        const recorded = next.proposals.find(p => p.proposalId === command.proposalId);
        if (recorded) {
          sessionStorage.removeItem(storageKey(next)); setPending(null); setSent(recorded.status);
        } else { setPending(command); setSent(null); }
      } else setPending(null);
    } catch (e) { if (alive.current && generation === epoch.current) { setMarket(null); setError(e instanceof Error ? e.message : 'UNAVAILABLE'); } }
    finally { if (generation === epoch.current) { lock.current = false; if (alive.current) setLoading(false); } }
  }
  useEffect(() => {
    alive.current = true; const generation = ++epoch.current;
    queueMicrotask(() => { if (alive.current && epoch.current === generation) void refresh(); });
    return () => { alive.current = false; epoch.current = generation + 1; lock.current = false; controller.current?.abort(); };
    // Parent keys this component by public identity. No background polling/writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);
  const incoming = market?.offers.find(x => x.playerId === selected);
  const options = market?.ownOffers.filter(x => market.quotes.some(q => q.outgoingPlayerId === x.playerId && q.incomingPlayerId === selected)) ?? [];
  const quotation = market?.quotes.find(q => q.outgoingPlayerId === outgoing && q.incomingPlayerId === selected);
  async function send() {
    if (lock.current || storageFailed || !market) return;
    const generation = epoch.current;
    const command = pending ?? (incoming && quotation ? { proposalId: crypto.randomUUID(), seasonId: market.seasonId, context: market.context,
      outgoingPlayerId: outgoing, incomingPlayerId: incoming.playerId, expectedRevision: market.revision, otherExpectedRevision: incoming.revision } : null);
    if (!command || command.context !== market.context || command.seasonId !== market.seasonId) return;
    // Persist the idempotency identity before a write. Unknown outcomes survive refresh.
    try { sessionStorage.setItem(storageKey(command), JSON.stringify(command)); }
    catch { setStorageFailed(true); return; }
    lock.current = true; setPending(command); setBusy(true); setError('');
    try {
      const result = await request(command);
      if (result.proposalId !== command.proposalId || !marketStatus(result.status) || typeof result.replayed !== 'boolean') throw new Error('INVALID_RECEIPT');
      const confirmed = parsePublicMarketQuote(result.quote);
      if (!alive.current || generation !== epoch.current) return;
      sessionStorage.removeItem(storageKey(command)); setPending(null); setSent(result.status); setConfirmedQuote(confirmed); setSelected(''); setOutgoing('');
    } catch (e) { if (alive.current && generation === epoch.current) {
      // A first request with an explicit rejection made no proposal. An earlier
      // unknown attempt keeps its identity even if a later retry is rejected.
      if (!pending && e instanceof MarketRequestError && e.status >= 400 && e.status < 500) {
        try { sessionStorage.removeItem(storageKey(command)); setPending(null); } catch { setStorageFailed(true); }
      }
      setError(e instanceof Error ? e.message : 'UNAVAILABLE');
    } }
    finally { if (generation === epoch.current) { lock.current = false; if (alive.current) setBusy(false); } }
  }
  return <section className={styles.market} aria-labelledby="public-market-title" aria-busy={loading || busy}>
    <header><h2 id="public-market-title">{copy.title}</h2><p>{copy.intro}</p></header>
    <div className={styles.actions}><button type="button" className={controls.link} disabled={loading || busy} onClick={() => void refresh()}>{copy.refresh}</button>
      <Link className={controls.link} href={ownHref}>{copy.manage}</Link></div>
    {loading ? <p role="status">{copy.loading}</p> : null}
    {error ? <p role="alert">{message(error)}</p> : null}
    {storageFailed ? <p role="alert">{copy.storage}</p> : null}
    {sent ? <p role="status">{sent === 'pending' ? copy.sent : locale === 'pt-BR'
      ? ({ accepted: 'Troca concluída.', declined: 'Proposta recusada.', cancelled: 'Proposta cancelada.', expired: 'Proposta expirada.' } as Record<string,string>)[sent]
      : ({ accepted: 'Trade completed.', declined: 'Proposal declined.', cancelled: 'Proposal cancelled.', expired: 'Proposal expired.' } as Record<string,string>)[sent]}</p> : null}
    {sent && confirmedQuote ? <dl className={styles.terms} aria-label={locale === 'pt-BR' ? 'Valores confirmados da proposta' : 'Confirmed proposal values'}>
      <div><dt>{copy.fee}</dt><dd><TouchlineCreditAmount value={confirmedQuote.feeTc} locale={locale} /></dd></div>
      <div><dt>{copy.difference}</dt><dd><TouchlineCreditAmount value={confirmedQuote.compensationTc} signed locale={locale} /></dd></div>
      <div><dt>{copy.bonus}</dt><dd><TouchlineCreditAmount value={confirmedQuote.bonusTc} locale={locale} /></dd></div>
    </dl> : null}
    {pending ? <div className={styles.confirmation}><p role="status">{copy.uncertain}</p>
      <button type="button" className={controls.link} disabled={busy || loading || storageFailed || !market} onClick={() => void send()}>{busy ? copy.sending : copy.retry}</button></div> : null}
    {!loading && market && !pending && !storageFailed ? <>
      {market.offers.length === 0 ? <p>{copy.empty}</p> : <ul className={styles.offers}>{market.offers.map(card => <li key={card.playerId}>
        <div><span className={styles.position}>{card.position}</span><h3>{card.name}</h3><TouchlineCreditAmount value={card.valueTc} locale={locale} /></div>
        {card.allowed ? <button type="button" className={controls.link} disabled={busy} onClick={() => { setSelected(card.playerId); setOutgoing(''); setSent(null); setConfirmedQuote(null); }}><ArrowLeftRight aria-hidden="true" size={16} />{copy.propose}</button>
          : <p><LockKeyhole size={16} aria-hidden="true" /> {card.restriction === 'beta-pair' ? copy.blocked : copy.unavailable}</p>}
      </li>)}</ul>}
      {incoming ? <div className={styles.confirmation}>
        <h3>{copy.incoming}: {incoming.name}</h3>
        {options.length ? <label>{copy.own}<select value={outgoing} onChange={e => setOutgoing(e.target.value)} disabled={busy}>
          <option value="">{copy.choose}</option>{options.map(card => <option key={card.playerId} value={card.playerId}>{card.name}</option>)}</select></label> : <p>{copy.noOwn}</p>}
        {quotation ? <><dl className={styles.terms}>
          <div><dt>{copy.fee}</dt><dd><TouchlineCreditAmount value={quotation.quote.feeTc} locale={locale} /></dd></div>
          <div><dt>{copy.difference}</dt><dd><TouchlineCreditAmount value={quotation.quote.compensationTc} signed locale={locale} /></dd></div>
          <div><dt>{copy.bonus}</dt><dd><TouchlineCreditAmount value={quotation.quote.bonusTc} locale={locale} /></dd></div>
        </dl><p>{copy.estimate}</p><button type="button" className={controls.link} disabled={busy} onClick={() => void send()}>{busy ? copy.sending : copy.send}</button></> : null}
        <button type="button" className={controls.link} disabled={busy} onClick={() => { setSelected(''); setOutgoing(''); }}>{copy.cancelled}</button>
      </div> : null}
    </> : null}
  </section>;
}
