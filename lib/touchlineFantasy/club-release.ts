import { inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { quoteClubReturn } from "./club-market-rules.ts";

export type ClubReleaseCommand = Readonly<{action:"release";playerId:string;expectedRevision:number;idempotencyKey:string}>;
export function isClubReleaseReceipt(input: unknown, command: Pick<ClubReleaseCommand, "playerId" | "idempotencyKey">): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const receipt = input as Record<string, unknown>;
  const paid = receipt.paid_credits, fee = receipt.fee_credits, refund = receipt.refund_credits;
  if (!Number.isSafeInteger(paid) || Number(paid) <= 0 || !Number.isSafeInteger(fee) || Number(fee) < 0
    || !Number.isSafeInteger(refund) || Number(refund) < 0) return false;
  return receipt.player_id === command.playerId && receipt.idempotency_key === command.idempotencyKey
    && BigInt(Number(fee)) === (BigInt(Number(paid)) * BigInt(10) + BigInt(50)) / BigInt(100)
    && BigInt(Number(refund)) + BigInt(Number(fee)) === BigInt(Number(paid));
}
export function parseClubReleaseCommand(input:unknown):ClubReleaseCommand|null {
  if(!input||typeof input!=="object"||Array.isArray(input))return null;
  const v=input as Record<string,unknown>;
  const keys=["action","playerId","expectedRevision","idempotencyKey"];
  if(Object.keys(v).length!==keys.length||Object.keys(v).some(key=>!keys.includes(key))
    ||v.action!=="release"||typeof v.playerId!=="string"||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v.playerId)
    ||!Number.isSafeInteger(v.expectedRevision)||Number(v.expectedRevision)<0
    ||typeof v.idempotencyKey!=="string"||!/^[a-zA-Z0-9_-]{8,120}$/.test(v.idempotencyKey))return null;
  return v as ClubReleaseCommand;
}

/** Confirmation display only. The database recomputes and commits from its locked contract. */
export function clubReleaseConfirmation(state:ClubAcquisitionState,playerId:string) {
  inspectClubAcquisition(state);
  const player=state.players.find(entry=>entry.playerId===playerId);
  if(!player)throw new Error("CLUB_PLAYER_NOT_OWNED");
  return {playerId,revision:state.revision,paidCredits:player.valueEur,...quoteClubReturn(player.valueEur,state.plan,"ordinary")};
}
