"use client";
import {readExchangeCommandJournal,writeExchangeCommandJournal,clearExchangeCommandJournal} from '@/lib/touchlineFantasy/exchange-command-journal';
import {getExchangeNegotiationCopy,getExchangeProposalStatus,getExchangeBalancePreviewLabel,getExchangeRecoveryLabel,getExchangePlanLockLabel,getExchangePlanLockActions} from '@/lib/touchlineFantasy/exchange-negotiations-i18n';
import {projectExchangeReadiness} from '@/lib/touchlineFantasy/exchange-eligibility';
import {LockKeyhole} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {readExchangeDiscovery,type ExchangeDiscovery,type ExchangeOffer,type ExchangeProposal} from '@/lib/touchlineFantasy/exchange-discovery';
import {prepareExchangeCommand,submitExchangeCommand,type ExchangeCommand,type ExchangeCommandEnvelope} from '@/lib/touchlineFantasy/exchange-command-client';
import {quoteClubExchange} from '@/lib/touchlineFantasy/club-market-rules';
import type {ClubAcquisitionState} from '@/lib/touchlineFantasy/club-acquisition';
import type {ClubOwnerSquadCard} from '@/lib/touchlineArena/demo-data';
import TouchlineGameweekCard from '@/components/touchline/fantasy/TouchlineGameweekCard';
import controls from '../TouchlineGlobalNavigation.module.css';
import styles from './ClubOwnerExchangeHub.module.css';
import TouchlineCreditAmount from './TouchlineCreditAmount';
import {getExchangeHubCopy} from '@/lib/touchlineFantasy/exchange-hub-i18n';
// The session journal restores uncertain commands after reload without resubmission.
const uncertain=new Map<string,ExchangeCommandEnvelope>();

type Props={locale:string;draftLocalesEnabled?:boolean;state:ClubAcquisitionState|null;ready:boolean;accountId?:string;catalogue:readonly ClubOwnerSquadCard[];onCommitted?:()=>void;onExplorePlans?:()=>void};
function clearJournal(accountId:string,seasonId:string){try{clearExchangeCommandJournal(window.sessionStorage,accountId,seasonId);}catch{/* Keep persisted identity if storage becomes unavailable. */}}
type Confirmation={command:ExchangeCommand;incoming:ExchangeOffer;outgoing:ExchangeOffer;fee:number;bonus:number;difference:number};
export default function ExchangeNegotiations({locale,draftLocalesEnabled=false,state,ready,accountId,catalogue,onCommitted,onExplorePlans}:Props){
 const text=getExchangeNegotiationCopy(locale);
 const lockActions=getExchangePlanLockActions(locale);
 const key=JSON.stringify([accountId,state?.seasonId]);
 const scopeKey=JSON.stringify([accountId,state?.seasonId,state?.revision,ready]);
 const alive=useRef(true),sending=useRef(false),controllers=useRef(new Set<AbortController>());
 const [restored]=useState(()=>{if(typeof window==='undefined'||!accountId||!state)return null;try{const pending=readExchangeCommandJournal(window.sessionStorage,accountId,state.seasonId);if(pending)uncertain.set(key,pending);return pending;}catch{return null;}});
 void restored;
 const [load,setLoad]=useState(0),[remote,setRemote]=useState<{key:string;data:ExchangeDiscovery|null}|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const allowed=!!accountId&&projectExchangeReadiness(state,ready).status==='complete';
 const data=remote?.key===scopeKey?remote.data:null;
 const locked=busy||uncertain.has(key)||!data||!allowed;
 const preview=confirmation&&state&&Number.isSafeInteger(state.balanceEur)&&state.balanceEur>=0?BigInt(state.balanceEur)+BigInt(confirmation.difference)-(confirmation.command.action==='propose'?BigInt(confirmation.fee):-BigInt(confirmation.bonus)):null;
 const previewBalance=preview!==null&&preview>=BigInt(0)&&preview<=BigInt(Number.MAX_SAFE_INTEGER)?Number(preview):null;
 const amount=(n:number)=><TouchlineCreditAmount value={n} locale={locale} signed/>;
 const hubCopy=getExchangeHubCopy(locale,draftLocalesEnabled);
 useEffect(()=>{const requests=controllers.current;alive.current=true;return()=>{alive.current=false;for(const c of requests)c.abort();};},[]);
 useEffect(()=>{
  if(!allowed)return;
  const controller=new AbortController();const requests=controllers.current;requests.add(controller);
  void readExchangeDiscovery({ready:allowed,accountId,seasonId:state?.seasonId,collectionRevision:state?.revision},controller.signal).then(value=>{
   if(controller.signal.aborted||!alive.current)return;
   setRemote({key:scopeKey,data:value});
   const pending=uncertain.get(key);
   if(value&&pending){
    const c=pending.command;
    const reconciled=c.action==='list'?value.ownListedIds.includes(c.playerId):c.action==='unlist'?!value.ownListedIds.includes(c.playerId):value.proposals.some(p=>p.proposalId===('proposalId' in c?c.proposalId:null)&&(c.action==='propose'||p.status===(c.action==='accept'?'accepted':c.action==='decline'?'declined':c.action==='cancel'?'cancelled':'expired')));
    if(reconciled){clearJournal(value.accountId,value.seasonId);uncertain.delete(key);setMessage(text.done);onCommitted?.();}
   }
  });
  return()=>{controller.abort();requests.delete(controller);};
 },[allowed,accountId,state?.seasonId,state?.revision,scopeKey,key,load,text.done,onCommitted]);
 async function send(command:ExchangeCommand,recovery=false){
  if((recovery?busy||!data||!allowed:locked)||sending.current||!state||!accountId)return;
  const intent=recovery?uncertain.get(key):prepareExchangeCommand({expectedAccountId:accountId,expectedSeasonId:state.seasonId,command});if(!intent||intent.expectedAccountId!==accountId||intent.expectedSeasonId!==state.seasonId)return;
  try{if(!writeExchangeCommandJournal(window.sessionStorage,intent)){setMessage(text.failed);return;}}catch{setMessage(text.failed);return;}
  sending.current=true;setBusy(true);uncertain.set(key,intent);
  const controller=new AbortController();controllers.current.add(controller);
  const result=await submitExchangeCommand(intent,{signal:controller.signal,isCurrent:()=>alive.current});
  controllers.current.delete(controller);sending.current=false;
  if(!alive.current)return;
  setBusy(false);setConfirmation(null);
  if(result.status==='confirmed'){clearJournal(intent.expectedAccountId,intent.expectedSeasonId);uncertain.delete(key);setMessage(text.done);onCommitted?.();setLoad(v=>v+1);}
  else if(!recovery&&(result.status==='rejected'||result.status==='not-sent')){clearJournal(intent.expectedAccountId,intent.expectedSeasonId);uncertain.delete(key);setMessage(text.failed);setLoad(v=>v+1);}
  else{setMessage(text.unknown);onCommitted?.();setLoad(v=>v+1);}
 }
 const card=(offer:ExchangeOffer,label:string)=>{
  const matches=catalogue.filter(c=>c.canonicalPlayerId===offer.playerId&&c.editorialCard);const art=matches.length===1?matches[0]:null;
  return <section className={styles.receiptCard}><h4>{label}</h4><div className={styles.cardArtwork}>{art?<TouchlineGameweekCard card={art} locale={locale} compact fitContainer imageLoading="lazy"/>:null}</div><h5>{offer.name}</h5><strong>{amount(offer.valueTc)}</strong></section>;
 };
 function review(p:ExchangeProposal){if(!p.negotiationAllowed||locked)return;setConfirmation({command:{action:'accept',proposalId:p.proposalId},incoming:p.outgoing,outgoing:p.incoming,fee:0,bonus:p.quote.bonusTc,difference:-p.quote.compensationTc});}
 function propose(owner:string,revision:number,incoming:ExchangeOffer){
  const own=data?.listings.find(l=>l.owner.accountId===accountId&&l.player.playerId===selected);
  if(!own||!state||locked||!data?.listings.some(l=>l.owner.accountId===owner&&l.player.playerId===incoming.playerId&&l.negotiationAllowed))return;
  try{const q=quoteClubExchange(own.player.valueTc,incoming.valueTc,state.plan);setConfirmation({command:{action:'propose',proposalId:crypto.randomUUID(),otherAccountId:owner,outgoingPlayerId:own.player.playerId,incomingPlayerId:incoming.playerId,expectedRevision:state.revision,otherExpectedRevision:revision},incoming,outgoing:own.player,fee:q.fee,bonus:q.bonus,difference:q.compensation});}catch{setMessage(text.failed);}
 }
 // Do not infer a plan problem from unavailable or stale discovery data.
 const restrictedAction=(reason:unknown)=>reason==='beta-pair'
  ? state?.plan==='beta'&&onExplorePlans
   ? <button type="button" className={controls.link} title={getExchangePlanLockLabel(locale)} aria-haspopup="dialog" disabled={locked} onClick={event=>{if(!locked){event.currentTarget.focus({preventScroll:true});onExplorePlans();}}}><LockKeyhole size={16} aria-hidden="true"/>{lockActions.unlock}</button>
   : <button type="button" className={controls.link} title={getExchangePlanLockLabel(locale)} disabled><LockKeyhole size={16} aria-hidden="true"/>{lockActions.restricted}</button>
  : <button type="button" className={controls.link} disabled>{lockActions.unavailable}</button>;
 if(!allowed)return <p role="status">{text.error}</p>;
 return <div className={styles.negotiations}>
  <div className={styles.toolbar}>
   <div className={styles.wallet}><span>{hubCopy.availableBalance}</span><strong>{amount(state!.balanceEur)}</strong></div>
   <button type="button" className={controls.link} disabled={busy} onClick={()=>setLoad(v=>v+1)}>{text.refresh}</button>
  </div>
  <div role="status" className={styles.status}>{message|| (remote===null?text.loading:!data?text.error:'')}</div>
  {uncertain.has(key)?<div className={styles.recovery}><p>{text.unknown}</p><button type="button" className={controls.link} disabled={busy||!data} onClick={()=>{const pending=uncertain.get(key);if(pending)void send(pending.command,true);}}>{getExchangeRecoveryLabel(locale)}</button></div>:null}
  {confirmation?<section className={styles.review} aria-label={confirmation.command.action==='accept'?text.accept:text.propose}>
   <div className={styles.cardPair}>{card(confirmation.incoming,text.incoming)}{card(confirmation.outgoing,text.outgoing)}</div>
   <div className={styles.settlement}>
    <h3>{confirmation.command.action==='accept'?text.accept:text.propose}</h3>
    <dl className={styles.amounts}>
     <div><dt>{text.difference}</dt><dd>{amount(confirmation.difference)}</dd></div>
     <div><dt>{text.fee}</dt><dd>{amount(confirmation.fee)}</dd></div>
     <div><dt>{text.bonus}</dt><dd>{amount(confirmation.bonus)}</dd></div>
     <div className={styles.balanceTotal}><dt>{getExchangeBalancePreviewLabel(locale)}</dt><dd>{previewBalance===null?"—":amount(previewBalance)}</dd></div>
    </dl>
    <div className={styles.confirmActions}><button type="button" className={controls.link} disabled={locked||previewBalance===null} onClick={()=>void send(confirmation.command)}>{text.confirm}</button><button type="button" className={controls.link} disabled={busy} onClick={()=>setConfirmation(null)}>{text.back}</button></div>
   </div>
  </section>:data?<>
   <div className={styles.marketColumns}>
    <section className={`${styles.section} ${styles.ownListings}`}><header className={styles.sectionHeading}><h3>{text.mine}</h3><span>{data.ownListedIds.length}</span></header><ul className={styles.history}>{state!.players.filter(p=>p.area==='outside').map(p=>{
     const label=catalogue.find(c=>c.canonicalPlayerId===p.playerId)?.name??data.listings.find(l=>l.player.playerId===p.playerId)?.player.name;
     const listed=data.ownListedIds.includes(p.playerId),reserved=data.reservations.some(r=>r.playerId===p.playerId);
     return <li key={p.playerId}><div className={styles.listingIdentity}><strong>{label??'—'}</strong>{reserved?<small className={styles.badge}>{text.reserved}</small>:null}</div><button type="button" className={controls.link} disabled={locked||reserved||!label} onClick={()=>void send({action:listed?'unlist':'list',playerId:p.playerId})}>{listed?text.unlist:text.list}</button></li>;
    })}</ul></section>
    <section className={styles.section}><header className={styles.sectionHeading}><h3>{text.market}</h3><span>{data.listings.filter(l=>l.owner.accountId!==accountId).length}</span></header>
     <label className={styles.selectionLabel}>{text.choose}<select className={styles.negotiationSelect} value={selected} disabled={locked} onChange={e=>setSelected(e.target.value)}><option value="">—</option>{data.listings.filter(l=>l.owner.accountId===accountId&&!data.reservations.some(r=>r.playerId===l.player.playerId)).map(l=><option key={l.player.playerId} value={l.player.playerId}>{l.player.name}</option>)}</select></label>
     <ul className={styles.listingGrid}>{data.listings.filter(l=>l.owner.accountId!==accountId).map(l=><li key={`${l.owner.accountId}:${l.player.playerId}`}>
      <div className={styles.listingIdentity}><strong>{l.player.name}</strong><small>{l.owner.name}</small></div><div className={styles.listingValue}>{amount(l.player.valueTc)}</div>
      <div className={styles.listingAction}>{l.negotiationAllowed?<button type="button" className={controls.link} disabled={locked||!selected} onClick={()=>propose(l.owner.accountId,l.collectionRevision,l.player)}>{text.propose}</button>:restrictedAction(l.restrictionReason)}</div>
     </li>)}</ul>{!data.listings.some(l=>l.owner.accountId!==accountId)?<p className={styles.empty}>{text.empty}</p>:null}
    </section>
   </div>
   <section className={styles.section}><header className={styles.sectionHeading}><h3>{text.inbox}</h3><span>{data.proposals.length}</span></header><ul className={styles.proposalList}>{data.proposals.map(p=><li key={p.proposalId}>
    <div className={styles.proposalHeading}><span>{p.proposer.accountId===accountId?text.sent:text.received}</span><span className={styles.badge} data-proposal-status={p.status}>{getExchangeProposalStatus(locale,p.status)}</span></div>
    <div className={styles.proposalPlayers}><strong>{p.outgoing.name}</strong><span aria-hidden="true">↔</span><strong>{p.incoming.name}</strong></div>
    {p.status==='pending'?<div className={styles.actions}>{p.accepter.accountId===accountId?<>{p.negotiationAllowed?<button type="button" className={controls.link} disabled={locked} onClick={()=>review(p)}>{text.accept}</button>:restrictedAction(p.restrictionReason)}<button type="button" className={controls.link} disabled={locked} onClick={()=>void send({action:'decline',proposalId:p.proposalId})}>{text.decline}</button></>:<button type="button" className={controls.link} disabled={locked} onClick={()=>void send({action:'cancel',proposalId:p.proposalId})}>{text.cancel}</button>}</div>:null}
   </li>)}</ul>{!data.proposals.length?<p className={styles.empty}>{text.none}</p>:null}</section>
  </>:null}
 </div>;
}
