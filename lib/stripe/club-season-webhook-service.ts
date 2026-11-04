import { clubSeasonTestPayment, type ClubSeasonTestOrder } from './club-season-test-catalogue.ts';
import { matchesClubSeasonPaymentEvidence, validClubSeasonSession, type ClubSeasonPaymentEvidence,
  type ClubSeasonOrderPayment } from './club-season-payment-contract.ts';
export type SeasonWebhookSubject = { orderId: string; sessionId: string; ownerId: string;
  seasonId: string; plan: string; previousPaidPlan?: string;
  kind: 'payment'|'expired'|'risk'; riskType?: 'charge.refunded'|'charge.dispute.created';
  evidence?: ClubSeasonPaymentEvidence;
  providerContext?: Pick<ClubSeasonOrderPayment, 'mode'|'accountId'|'profileId'|'catalogueVersion'> };
export type SeasonWebhookOrder = ClubSeasonTestOrder & { state: string; payment?: ClubSeasonOrderPayment };
export type SeasonWebhookStore = {
  read(orderId: string): Promise<SeasonWebhookOrder|null>;
  fulfill(orderId: string,eventId: string,evidence: ClubSeasonPaymentEvidence): Promise<unknown>;
  review(orderId: string,eventId: string,eventType: string,sessionId: string): Promise<unknown>;
  expire(orderId: string,eventId: string,sessionId: string): Promise<unknown>;
};
/** subject comes only from authenticated provider re-fetch, never HTTP JSON. */
export async function processClubSeasonWebhook(eventId:string, subject:SeasonWebhookSubject|null,
  store:SeasonWebhookStore, now=Date.now()) {
  if (!subject) return {received:true,ignored:true};
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) throw new Error('INVALID_PROVIDER_EVENT');
  const order=await store.read(subject.orderId);
  if (!order) throw new Error('SEASON_ORDER_NOT_FOUND');
  if (order.userId!==subject.ownerId || order.seasonId!==subject.seasonId || order.plan!==subject.plan
    || order.previousPaidPlan!==subject.previousPaidPlan
    || (order.sessionId && order.sessionId!==subject.sessionId)) throw new Error('SEASON_EVENT_MISMATCH');
  const payment = order.payment ?? clubSeasonTestPayment(order.plan);
  const context = subject.providerContext;
  if (!validClubSeasonSession(subject.sessionId, payment.mode)
    || (context ? context.mode !== payment.mode || context.accountId !== payment.accountId
      || context.profileId !== payment.profileId || context.catalogueVersion !== payment.catalogueVersion
      : payment.mode !== 'test')) throw new Error('SEASON_EVENT_MISMATCH');
  // Context is checked for paid/risk/expired alike, before terminal replay.
  if(subject.kind==='risk') {
    if(!subject.riskType) throw new Error('SEASON_EVENT_MISMATCH');
    await store.review(order.id,eventId,subject.riskType,subject.sessionId);
  } else if(subject.kind==='expired') {
    await store.expire(order.id,eventId,subject.sessionId);
  } else {
    // A paid/reviewed/refunded order must never gain credits again, even when
    // a delayed completion notification arrives after a risk notification.
    if (order.state==='paid' || order.state==='review' || order.state==='refunded') return {received:true,duplicate:true};
    const end=Date.parse(order.seasonEndsAt);
    const evidenceTime=Number.isFinite(end)&&now>=end?end-1:now;
    if (!subject.evidence || !matchesClubSeasonPaymentEvidence({...order,payment,sessionId:subject.sessionId},subject.evidence,evidenceTime)) {
      throw new Error('SEASON_PAYMENT_UNCONFIRMED');
    }
    if(now>=end) await store.review(order.id,eventId,'season.payment_late',subject.sessionId);
    else await store.fulfill(order.id,eventId,subject.evidence);
  }
  return {received:true};
}

/** Preserve the exact signed bytes while bounding allocation and read time. */
export async function readSeasonWebhookBody(request:Request,maxBytes=262144):Promise<string> {
  const reader=request.body?.getReader();
  if(!reader) throw new Error('INVALID_BODY');
  const parts:Uint8Array[]=[];let used=0,expired=false;
  const cancel=()=>{expired=true;void reader.cancel().catch(()=>undefined);};
  const timer=setTimeout(cancel,3000);request.signal.addEventListener('abort',cancel,{once:true});
  try {
    while(!expired) {
      const {value,done}=await reader.read();
      if(expired || request.signal.aborted) throw new Error('INVALID_BODY');
      if(done) {
        const bytes=new Uint8Array(used);let offset=0;
        for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
        return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      }
      used+=value.byteLength;if(used>maxBytes){cancel();throw new Error('INVALID_BODY');}
      parts.push(value);
    }
    throw new Error('INVALID_BODY');
  } finally {clearTimeout(timer);request.signal.removeEventListener('abort',cancel);reader.releaseLock();}
}
