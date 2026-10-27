import {requestClubCollection} from './club-collection-request.ts';
export type ExchangeCommand = Readonly<{action:'list'|'unlist';playerId:string}>
 | Readonly<{action:'propose';proposalId:string;otherAccountId:string;outgoingPlayerId:string;incomingPlayerId:string;expectedRevision:number;otherExpectedRevision:number}>
 | Readonly<{action:'accept'|'decline'|'cancel'|'expire';proposalId:string}>;
export type ExchangeCommandEnvelope=Readonly<{expectedAccountId:string;expectedSeasonId:string;command:ExchangeCommand}>;
export type ExchangeCommandResult=Readonly<{status:'confirmed';action:ExchangeCommand['action'];proposalStatus?:string;proposalId?:string}>
 | Readonly<{status:'not-sent'|'unconfirmed'|'context-changed'}> | Readonly<{status:'rejected';code:string}>;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const amount=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const named=(v:unknown):v is Record<string,unknown>=>object(v)&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=200;
/** Prepare once per intent. The caller retains the proposal ID across reconciliation. */
export function prepareExchangeCommand(value:unknown):ExchangeCommandEnvelope|null{
 if(!object(value)||!uuid(value.expectedAccountId)||!uuid(value.expectedSeasonId)||!object(value.command)
  ||Object.keys(value).some(k=>!['expectedAccountId','expectedSeasonId','command'].includes(k)))return null;
 const c=value.command,listing=c.action==='list'||c.action==='unlist',proposal=c.action==='propose';
 const resolve=['accept','decline','cancel','expire'].includes(String(c.action));
 const keys=listing?['action','playerId']:proposal?['action','proposalId','otherAccountId','outgoingPlayerId','incomingPlayerId','expectedRevision','otherExpectedRevision']:['action','proposalId'];
 if(!(listing||proposal||resolve)||Object.keys(c).some(k=>!keys.includes(k))||listing&&!uuid(c.playerId)||!listing&&!uuid(c.proposalId)
  ||proposal&&(!uuid(c.otherAccountId)||c.otherAccountId===value.expectedAccountId||!uuid(c.outgoingPlayerId)||!uuid(c.incomingPlayerId)
   ||c.outgoingPlayerId===c.incomingPlayerId||!amount(c.expectedRevision)||!amount(c.otherExpectedRevision)))return null;
 return Object.freeze({expectedAccountId:value.expectedAccountId,expectedSeasonId:value.expectedSeasonId,command:Object.freeze({...c}) as ExchangeCommand});
}
function validTerms(t:unknown,c:Extract<ExchangeCommand,{action:'propose'}>,accountId:string){
 if(!object(t)||!named(t.proposer)||!named(t.accepter)||!named(t.outgoing)||!named(t.incoming)||!object(t.quote)
  ||t.proposer.accountId!==accountId||t.accepter.accountId!==c.otherAccountId||t.outgoing.playerId!==c.outgoingPlayerId||t.incoming.playerId!==c.incomingPlayerId)return false;
 const q=t.quote,a=t.outgoing.valueTc,b=t.incoming.valueTc;
 return amount(a)&&a>0&&amount(b)&&b>0&&amount(q.feeTc)&&amount(q.bonusTc)&&amount(q.retiredTc)
  &&q.bonusTc===q.retiredTc&&BigInt(q.feeTc)===BigInt(q.bonusTc)+BigInt(q.retiredTc)
  &&typeof q.compensationTc==='number'&&Number.isSafeInteger(q.compensationTc)&&BigInt(q.compensationTc)===BigInt(a)-BigInt(b);
}
/** Exactly one POST, never retries. Unknown outcome needs status reconciliation;
 * it must not trigger an optimistic wallet/card change or a replacement ID. */
export async function submitExchangeCommand(value:ExchangeCommandEnvelope,options:{signal?:AbortSignal;isCurrent:()=>boolean},request=requestClubCollection):Promise<ExchangeCommandResult>{
 const prepared=prepareExchangeCommand(value);
 if(!prepared||options.signal?.aborted)return {status:'not-sent'};
 if(!options.isCurrent())return {status:'context-changed'};
 try{
  const {response,payload}=await request('/api/touchline-fantasy/exchange',{method:'POST',credentials:'same-origin',cache:'no-store',signal:options.signal,
   headers:{'Content-Type':'application/json'},body:JSON.stringify(prepared)},20_000);
  if(!options.isCurrent())return {status:'context-changed'};
  if(options.signal?.aborted)return {status:'unconfirmed'};
  if(!response.ok)return object(payload)&&payload.ok===false&&typeof payload.error==='string'&&/^(?:CLUB_[A-Z_]+|AUTH_REQUIRED|INVALID_REQUEST|INVALID_ORIGIN)$/.test(payload.error)
    &&[400,401,403,409].includes(response.status)?{status:'rejected',code:payload.error}:{status:'unconfirmed'};
  if(!object(payload)||payload.ok!==true||payload.accountId!==prepared.expectedAccountId||payload.seasonId!==prepared.expectedSeasonId)return {status:'unconfirmed'};
  const c=prepared.command;
  if(c.action==='list'||c.action==='unlist')return payload.playerId===c.playerId&&payload.listed===(c.action==='list')?{status:'confirmed',action:c.action}:{status:'unconfirmed'};
  if(typeof payload.replayed!=='boolean')return {status:'unconfirmed'};
  const expected=c.action==='accept'?'accepted':c.action==='decline'?'declined':c.action==='cancel'?'cancelled':'expired';
  if(c.action==='propose'){
   if(payload.proposalId!==c.proposalId||!['pending','accepted','declined','cancelled','expired'].includes(String(payload.status))||!validTerms(payload.terms,c,prepared.expectedAccountId))return {status:'unconfirmed'};
  }else if(payload.status!==expected)return {status:'unconfirmed'};
  if(c.action!=='propose'&&(payload.proposalId!==('proposalId' in c?c.proposalId:null)||payload.accountId!==prepared.expectedAccountId||payload.seasonId!==prepared.expectedSeasonId))return {status:'unconfirmed'};
  return {status:'confirmed',action:c.action,proposalId:'proposalId' in c?c.proposalId:undefined,proposalStatus:String(payload.status)};
 }catch{return {status:options.isCurrent()?'unconfirmed':'context-changed'};}
}
