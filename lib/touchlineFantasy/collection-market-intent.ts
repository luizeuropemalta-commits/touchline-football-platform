import type { ClubAcquisitionState } from "./club-acquisition.ts";
import type { ClubRosterArea } from "./club-roster.ts";
import type { ExchangePosition } from "./exchange-eligibility.ts";
import type { TouchlineFormationGeometry } from "../touchlineArena/formation-geometry.ts";
import { collectionSlotPlan } from "./collection-slot-plan.ts";
import { clubPlayerPosition } from "./club-position.ts";
import { primaryPositionFitsTacticalSlot } from "./club-primary-position-policy.ts";
import type { ClubPrimaryPositionIndex } from "./club-primary-position-index.ts";

export type CollectionMarketIntent=Readonly<{area:ClubRosterArea;slot:number;position:ExchangePosition;revision:number;seasonId:string;formationCode:string;accountId:string}>;
export function createCollectionMarketIntent(state:ClubAcquisitionState,geometry:TouchlineFormationGeometry,accountId:string,destination:{area:ClubRosterArea;slot:number},primaryDetails?:ClubPrimaryPositionIndex):CollectionMarketIntent|null {
  const position=collectionSlotPlan(geometry,state.players,primaryDetails)?.[destination.area]?.[destination.slot];
  if(!accountId||!position||state.formationCode!==geometry.formationCode||state.players.some(p=>p.area===destination.area&&p.slot===destination.slot))return null;
  return {...destination,position,revision:state.revision,seasonId:state.seasonId,formationCode:geometry.formationCode,accountId};
}
export function collectionMarketIntentCurrent(intent:CollectionMarketIntent,state:ClubAcquisitionState|null,geometry:TouchlineFormationGeometry|null|undefined,accountId:string,primaryDetails?:ClubPrimaryPositionIndex){
  if(!state||!geometry||intent.accountId!==accountId||intent.seasonId!==state.seasonId||intent.revision!==state.revision||intent.formationCode!==state.formationCode)return false;
  const current=createCollectionMarketIntent(state,geometry,accountId,intent,primaryDetails);
  return current?.position===intent.position;
}
export function collectionMarketPlayerFits(intent:CollectionMarketIntent,state:ClubAcquisitionState,geometry:TouchlineFormationGeometry,playerId:string,primaryDetail:string|null|undefined,primaryDetails?:ClubPrimaryPositionIndex){
  const position=clubPlayerPosition(primaryDetail);
  if(position!==intent.position||!primaryDetail||state.players.some(p=>p.playerId===playerId))return false;
  if(intent.area==="starters"&&!primaryPositionFitsTacticalSlot(primaryDetail,geometry.formationCode,geometry.slots[intent.slot]?.id))return false;
  return Boolean(collectionSlotPlan(geometry,[...state.players,{playerId,area:intent.area,slot:intent.slot,position,primaryDetail}],primaryDetails));
}
/** A late success is allowed to update the hook's authoritative state, never a newer visual intent. */
export function collectionMarketPurchaseConfirmed(intent:CollectionMarketIntent,currentIntent:CollectionMarketIntent|null,state:ClubAcquisitionState|null,playerId:string,accountId:string){
  return currentIntent===intent&&intent.accountId===accountId&&Boolean(state&&state.seasonId===intent.seasonId&&state.formationCode===intent.formationCode&&state.revision>intent.revision&&state.players.some(p=>p.playerId===playerId&&p.area===intent.area&&p.slot===intent.slot));
}
