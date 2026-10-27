import {requestClubCollection} from './club-collection-request.ts';
import type {ExchangeHistoryScope} from './exchange-history-client.ts';
export type ExchangeOffer={playerId:string;name:string;valueTc:number;position:string;clubId:string;primaryDetail:string};
export type ExchangeParty={accountId:string;name:string};
export type ExchangeProposal={proposalId:string;status:'pending'|'accepted'|'declined'|'cancelled'|'expired';expiresAt:string;proposer:ExchangeParty;accepter:ExchangeParty;outgoing:ExchangeOffer;incoming:ExchangeOffer;quote:{feeTc:number;bonusTc:number;retiredTc:number;compensationTc:number}};
export type ExchangeDiscovery={version:1;accountId:string;seasonId:string;collectionRevision:number;ownListedIds:string[];reservations:{playerId:string;proposalId:string}[];listings:{owner:ExchangeParty;collectionRevision:number;player:ExchangeOffer}[];proposals:ExchangeProposal[]};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const amount=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const name=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
function party(v:unknown):ExchangeParty|null{return obj(v)&&uuid(v.accountId)&&name(v.name)?{accountId:v.accountId,name:v.name}:null;}
function offer(v:unknown):ExchangeOffer|null{return obj(v)&&uuid(v.playerId)&&uuid(v.clubId)&&name(v.name)&&amount(v.valueTc)&&v.valueTc>0&&['GK','CB','RB','LB','DM','MID','RW','LW','CF'].includes(String(v.position))&&name(v.primaryDetail)?{playerId:v.playerId,name:v.name,valueTc:v.valueTc,position:String(v.position),clubId:v.clubId,primaryDetail:v.primaryDetail}:null;}
export function parseExchangeDiscovery(value:unknown,scope:ExchangeHistoryScope):ExchangeDiscovery|null{
 if(!scope.ready||!uuid(scope.accountId)||!uuid(scope.seasonId)||!obj(value)||value.version!==1||value.accountId!==scope.accountId||value.seasonId!==scope.seasonId||value.collectionRevision!==scope.collectionRevision||!amount(value.collectionRevision)
 ||!Array.isArray(value.ownListedIds)||!Array.isArray(value.reservations)||!Array.isArray(value.listings)||!Array.isArray(value.proposals))return null;
 if(!value.ownListedIds.every(uuid)||new Set(value.ownListedIds).size!==value.ownListedIds.length)return null;
 const listings:ExchangeDiscovery['listings']=[],reservations:ExchangeDiscovery['reservations']=[],proposals:ExchangeProposal[]=[];
 const seenListings=new Set<string>(),seenReservations=new Set<string>(),seenProposals=new Set<string>();
 for(const r of value.reservations){if(!obj(r)||!uuid(r.playerId)||!uuid(r.proposalId)||seenReservations.has(r.playerId))return null;seenReservations.add(r.playerId);reservations.push({playerId:r.playerId,proposalId:r.proposalId});}
 for(const l of value.listings){if(!obj(l)||!amount(l.collectionRevision))return null;const owner=party(l.owner),player=offer(l.player);if(!owner||!player)return null;const key=`${owner.accountId}:${player.playerId}`;if(seenListings.has(key))return null;seenListings.add(key);listings.push({owner,player,collectionRevision:l.collectionRevision});}
 for(const p of value.proposals){
  if(!obj(p)||!uuid(p.proposalId)||seenProposals.has(p.proposalId)||!['pending','accepted','declined','cancelled','expired'].includes(String(p.status))||typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt))||!obj(p.quote))return null;
  const proposer=party(p.proposer),accepter=party(p.accepter),outgoing=offer(p.outgoing),incoming=offer(p.incoming),q=p.quote;
  if(!proposer||!accepter||proposer.accountId===accepter.accountId||![proposer.accountId,accepter.accountId].includes(scope.accountId)||!outgoing||!incoming||outgoing.playerId===incoming.playerId
   ||!amount(q.feeTc)||!amount(q.bonusTc)||!amount(q.retiredTc)||q.bonusTc!==q.retiredTc||BigInt(q.feeTc)!==BigInt(q.bonusTc)+BigInt(q.retiredTc)
   ||typeof q.compensationTc!=='number'||!Number.isSafeInteger(q.compensationTc)||BigInt(q.compensationTc)!==BigInt(outgoing.valueTc)-BigInt(incoming.valueTc))return null;
  seenProposals.add(p.proposalId);proposals.push({proposalId:p.proposalId,status:p.status as ExchangeProposal['status'],expiresAt:p.expiresAt,proposer,accepter,outgoing,incoming,quote:{feeTc:q.feeTc,bonusTc:q.bonusTc,retiredTc:q.retiredTc,compensationTc:q.compensationTc}});
 }
 return {version:1,accountId:scope.accountId,seasonId:scope.seasonId,collectionRevision:value.collectionRevision,ownListedIds:[...value.ownListedIds],reservations,listings,proposals};
}
export async function readExchangeDiscovery(scope:ExchangeHistoryScope,signal?:AbortSignal){
 if(!scope.ready||!uuid(scope.accountId)||!uuid(scope.seasonId)||!amount(scope.collectionRevision)||signal?.aborted)return null;
 try{const {response,payload}=await requestClubCollection(`/api/touchline-fantasy/exchange?expectedSeasonId=${scope.seasonId}`,{method:'GET',credentials:'same-origin',cache:'no-store',signal,headers:{'X-Touchline-Account':scope.accountId}});
 return !signal?.aborted&&response.ok&&payload?.ok===true?parseExchangeDiscovery(payload.discovery,scope):null;}catch{return null;}
}
