import { publicOwnerId } from './clubowner-public-contract.ts';
import type { ExchangeOffer } from '../touchlineFantasy/exchange-discovery.ts';

export type PublicMarketOffer = ExchangeOffer & { revision: number; allowed: boolean; restriction: 'beta-pair' | null };
export type PublicMarketQuote = { feeTc: number; compensationTc: number; bonusTc: number };
export type PublicMarket = { publicId: string; seasonId: string; context: string; revision: number;
  offers: PublicMarketOffer[]; ownOffers: PublicMarketOffer[];
  quotes: { outgoingPlayerId: string; incomingPlayerId: string; quote: PublicMarketQuote }[];
  proposals: { proposalId: string; status: string }[] };
export type PublicMarketCommand = { proposalId: string; seasonId: string; context: string;
  outgoingPlayerId: string; incomingPlayerId: string; expectedRevision: number; otherExpectedRevision: number };
export const marketObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const amount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
export const marketStatus = (v: unknown): v is string => typeof v === 'string' && ['pending', 'accepted', 'declined', 'cancelled', 'expired'].includes(v);
function offer(v: unknown): PublicMarketOffer {
  if (!marketObject(v) || !publicOwnerId(v.playerId) || !publicOwnerId(v.clubId) || !text(v.name)
    || !text(v.primaryDetail) || !['GK','CB','RB','LB','DM','MID','RW','LW','CF'].includes(String(v.position))
    || !amount(v.valueTc) || !v.valueTc || !amount(v.revision) || typeof v.allowed !== 'boolean'
    || !(v.restriction === null || !v.allowed && v.restriction === 'beta-pair')) throw new Error('INVALID_PUBLIC_MARKET');
  return { playerId: v.playerId, clubId: v.clubId, name: v.name, primaryDetail: v.primaryDetail,
    position: String(v.position), valueTc: v.valueTc, revision: v.revision, allowed: v.allowed, restriction: v.restriction };
}
export function parsePublicMarketQuote(v: unknown): PublicMarketQuote {
  if (!marketObject(v) || !amount(v.feeTc) || !amount(v.bonusTc) || BigInt(v.bonusTc) * BigInt(2) !== BigInt(v.feeTc)
    || typeof v.compensationTc !== 'number' || !Number.isSafeInteger(v.compensationTc)) throw new Error('INVALID_PUBLIC_MARKET_QUOTE');
  return { feeTc: v.feeTc, bonusTc: v.bonusTc, compensationTc: v.compensationTc };
}
export function parsePublicMarket(v: unknown, publicId: string): PublicMarket {
  if (!marketObject(v) || v.publicId !== publicId || !publicOwnerId(v.publicId) || !publicOwnerId(v.seasonId)
    || typeof v.context !== 'string' || !/^[a-f0-9]{64}$/.test(v.context) || !amount(v.revision)
    || !Array.isArray(v.offers) || v.offers.length > 11 || !Array.isArray(v.ownOffers) || v.ownOffers.length > 11
    || !Array.isArray(v.quotes) || v.quotes.length > 121 || !Array.isArray(v.proposals) || v.proposals.length > 1000) throw new Error('INVALID_PUBLIC_MARKET');
  const offers = v.offers.map(offer), ownOffers = v.ownOffers.map(offer);
  if (new Set(offers.map(x => x.playerId)).size !== offers.length || new Set(ownOffers.map(x => x.playerId)).size !== ownOffers.length) throw new Error('INVALID_PUBLIC_MARKET');
  const keys = new Set<string>();
  const quotes = v.quotes.map(q => {
    if (!marketObject(q) || !publicOwnerId(q.outgoingPlayerId) || !publicOwnerId(q.incomingPlayerId)) throw new Error('INVALID_PUBLIC_MARKET');
    const a = ownOffers.find(x => x.playerId === q.outgoingPlayerId), b = offers.find(x => x.playerId === q.incomingPlayerId);
    const key = `${q.outgoingPlayerId}:${q.incomingPlayerId}`;
    if (!a || !b || !b.allowed || a.position !== b.position || a.playerId === b.playerId || keys.has(key)) throw new Error('INVALID_PUBLIC_MARKET');
    keys.add(key);
    const quote = parsePublicMarketQuote(q.quote);
    if (BigInt(a.valueTc) - BigInt(b.valueTc) !== BigInt(quote.compensationTc)) throw new Error('INVALID_PUBLIC_MARKET');
    return { outgoingPlayerId: q.outgoingPlayerId, incomingPlayerId: q.incomingPlayerId, quote };
  });
  const seen = new Set<string>();
  const proposals = v.proposals.map(p => {
    if (!marketObject(p) || !publicOwnerId(p.proposalId) || !marketStatus(p.status) || seen.has(p.proposalId)) throw new Error('INVALID_PUBLIC_MARKET');
    seen.add(p.proposalId); return { proposalId: p.proposalId, status: p.status };
  });
  return { publicId: v.publicId, seasonId: v.seasonId, context: v.context, revision: v.revision, offers, ownOffers, quotes, proposals };
}
export function parsePublicMarketCommand(v: unknown): PublicMarketCommand | null {
  if (!marketObject(v) || Object.keys(v).sort().join(',') !== 'context,expectedRevision,incomingPlayerId,otherExpectedRevision,outgoingPlayerId,proposalId,seasonId'
    || !publicOwnerId(v.proposalId) || !publicOwnerId(v.seasonId) || !publicOwnerId(v.outgoingPlayerId) || !publicOwnerId(v.incomingPlayerId)
    || v.outgoingPlayerId === v.incomingPlayerId || !amount(v.expectedRevision) || !amount(v.otherExpectedRevision)
    || typeof v.context !== 'string' || !/^[a-f0-9]{64}$/.test(v.context)) return null;
  return { proposalId: v.proposalId, seasonId: v.seasonId, context: v.context, outgoingPlayerId: v.outgoingPlayerId,
    incomingPlayerId: v.incomingPlayerId, expectedRevision: v.expectedRevision, otherExpectedRevision: v.otherExpectedRevision };
}
