import { createHash } from 'node:crypto';
import { publicOwnerId, samePeopleOrigin } from './clubowner-public-contract.ts';
import { marketObject, marketStatus, parsePublicMarket, parsePublicMarketCommand, parsePublicMarketQuote, type PublicMarketCommand } from './clubowner-public-market-contract.ts';
import type { ExchangeDiscovery } from '../touchlineFantasy/exchange-discovery.ts';
import { quoteClubExchange, type ClubPlan } from '../touchlineFantasy/club-market-rules.ts';
import { readClubCommand } from '../touchlineFantasy/club-request.ts';

type Snapshot = { seasonId: string; plan: ClubPlan; discovery: ExchangeDiscovery };
export type PublicMarketDependencies = {
  enabled: boolean;
  actor: () => Promise<{ accountId: string; allowed: boolean } | null>;
  target: (publicId: string, actorId: string) => Promise<string | null>;
  snapshot: (actorId: string) => Promise<Snapshot>;
  propose: (actorId: string, targetId: string, command: PublicMarketCommand) => Promise<unknown>;
  allow: (actorId: string, write: boolean) => boolean;
};
/** Opaque UI context only, never an authentication token or a substitute for RPC authorization. */
export const publicMarketContext = (actor: string, target: string) => createHash('sha256').update(`touchline-market-v1:${actor}:${target}`).digest('hex');
export function projectPublicMarket(publicId: string, actorId: string, targetId: string, snapshot: Snapshot) {
  const { discovery: d, seasonId, plan } = snapshot;
  if (d.accountId !== actorId || d.seasonId !== seasonId) throw new Error('CLUB_CONTEXT_CHANGED');
  const listed = new Set(d.ownListedIds), reserved = new Set(d.reservations.map(x => x.playerId));
  const project = (l: ExchangeDiscovery['listings'][number]) => ({ ...l.player, revision: l.collectionRevision,
    allowed: l.negotiationAllowed, restriction: l.restrictionReason });
  const offers = d.listings.filter(l => l.owner.accountId === targetId).map(project);
  const ownOffers = d.listings.filter(l => l.owner.accountId === actorId && listed.has(l.player.playerId) && !reserved.has(l.player.playerId)).map(project);
  const quotes = ownOffers.flatMap(a => offers.flatMap(b => {
    if (!b.allowed || a.playerId === b.playerId || a.position !== b.position) return [];
    const q = quoteClubExchange(a.valueTc, b.valueTc, plan);
    return [{ outgoingPlayerId: a.playerId, incomingPlayerId: b.playerId, quote: { feeTc: q.fee, bonusTc: q.bonus, compensationTc: q.compensation } }];
  }));
  const proposals = d.proposals.filter(p => p.proposer.accountId === actorId && p.accepter.accountId === targetId)
    .map(p => ({ proposalId: p.proposalId, status: p.status }));
  return parsePublicMarket({ publicId, seasonId, context: publicMarketContext(actorId, publicId), revision: d.collectionRevision,
    offers, ownOffers, quotes, proposals }, publicId);
}
const response = (body: unknown, status = 200) => Response.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
const allowedErrors = new Set(['CLUB_CONTEXT_CHANGED','CLUB_STALE_REVISION','CLUB_BETA_EXCHANGE_ONLY','CLUB_SEASON_CLOSED',
  'CLUB_PLAYER_ROUND_LOCKED','CLUB_MATCH_RELATED_PLAYER','CLUB_PLAYER_UNAVAILABLE','CLUB_PLAYER_RESERVED','CLUB_PLAYER_NOT_LISTED',
  'CLUB_ALREADY_OWNED','CLUB_POSITION_MISMATCH','CLUB_COMPLETE_ROSTER_REQUIRED','CLUB_ACCESS_REQUIRED','CLUB_IDEMPOTENCY_CONFLICT']);
export async function handlePublicMarket(request: Request, publicId: string, dependencies: PublicMarketDependencies) {
  const fail = (error: string, status: number) => response({ ok: false, error }, status);
  if (!dependencies.enabled) return fail('CLUB_EXCHANGE_UNAVAILABLE', 503);
  if (!publicOwnerId(publicId)) return fail('PEOPLE_NOT_FOUND', 404);
  const write = request.method === 'POST';
  if (!write && request.method !== 'GET') return fail('INVALID_METHOD', 405);
  const origin = request.headers.get('origin');
  if (write ? !samePeopleOrigin(request) : request.headers.get('sec-fetch-site') === 'cross-site'
    || origin !== null && origin !== new URL(request.url).origin) return fail('INVALID_ORIGIN', 403);
  try {
    const actor = await dependencies.actor();
    if (!actor) return fail('AUTH_REQUIRED', 401);
    if (!actor.allowed || !publicOwnerId(actor.accountId)) return fail('CLUB_ACCESS_REQUIRED', 403);
    if (!dependencies.allow(actor.accountId, write)) return fail('RATE_LIMITED', 429);
    const command = write ? parsePublicMarketCommand(await readClubCommand(request)) : null;
    if (write && !command) return fail('INVALID_REQUEST', 400);
    // Resolve opt-in afresh for every request, including idempotent replays.
    const targetId = await dependencies.target(publicId, actor.accountId);
    if (!targetId) return fail('PEOPLE_NOT_FOUND', 404);
    if (!publicOwnerId(targetId) || targetId === actor.accountId) return fail('CLUB_ACCESS_REQUIRED', 403);
    const snapshot = await dependencies.snapshot(actor.accountId);
    const market = projectPublicMarket(publicId, actor.accountId, targetId, snapshot);
    if (!command) return response({ ok: true, market });
    if (command.context !== market.context || command.seasonId !== market.seasonId) return fail('CLUB_CONTEXT_CHANGED', 409);
    const prior = snapshot.discovery.proposals.find(p => p.proposalId === command.proposalId);
    if (prior) {
      if (prior.proposer.accountId !== actor.accountId || prior.accepter.accountId !== targetId
        || prior.outgoing.playerId !== command.outgoingPlayerId || prior.incoming.playerId !== command.incomingPlayerId) return fail('CLUB_IDEMPOTENCY_CONFLICT', 409);
      // The atomic RPC validates the original revisions too. A prior proposal may
      // have reserved cards or completed; do not require a new listing to replay it.
    } else {
      const incoming = market.offers.find(p => p.playerId === command.incomingPlayerId);
      const outgoing = market.ownOffers.find(p => p.playerId === command.outgoingPlayerId);
      if (!incoming || !outgoing) return fail('CLUB_PLAYER_NOT_LISTED', 409);
      if (!incoming.allowed) return fail(incoming.restriction === 'beta-pair' ? 'CLUB_BETA_EXCHANGE_ONLY' : 'CLUB_ACCESS_REQUIRED', 409);
      if (market.revision !== command.expectedRevision || incoming.revision !== command.otherExpectedRevision) return fail('CLUB_STALE_REVISION', 409);
      if (!market.quotes.some(q => q.incomingPlayerId === incoming.playerId && q.outgoingPlayerId === outgoing.playerId)) return fail('CLUB_POSITION_MISMATCH', 409);
    }
    const result = await dependencies.propose(actor.accountId, targetId, command);
    if (!marketObject(result) || result.ok !== true || result.proposalId !== command.proposalId || !marketStatus(result.status)
      || typeof result.replayed !== 'boolean' || !marketObject(result.terms)) throw new Error('INVALID_PROPOSAL_RECEIPT');
    const terms = result.terms;
    if (!marketObject(terms.proposer) || terms.proposer.accountId !== actor.accountId || !marketObject(terms.accepter) || terms.accepter.accountId !== targetId
      || !marketObject(terms.outgoing) || terms.outgoing.playerId !== command.outgoingPlayerId
      || !marketObject(terms.incoming) || terms.incoming.playerId !== command.incomingPlayerId) throw new Error('INVALID_PROPOSAL_RECEIPT');
    const quote = parsePublicMarketQuote(result.terms.quote);
    // Explicit whitelist: never forward the bilateral terms or private wallets.
    return response({ ok: true, proposalId: command.proposalId, status: result.status, replayed: result.replayed, quote });
  } catch (error) {
    const code = error instanceof Error ? error.message.match(/\bCLUB_[A-Z_]+\b/)?.[0] : null;
    return code && allowedErrors.has(code) ? fail(code, 409) : fail('CLUB_STORAGE_UNAVAILABLE', 503);
  }
}
