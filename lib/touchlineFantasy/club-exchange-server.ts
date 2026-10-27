import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { parseExchangeDiscovery } from "./exchange-discovery";
import { projectExchangeLedger } from "./exchange-ledger-projection";
export const clubExchangeEnabled = () => process.env.TOUCHLINE_CLUB_COLLECTION_ENABLED === "true"
  && process.env.TOUCHLINE_CLUB_EXCHANGE_ENABLED === "true";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
/** Validate transport shape and scope before projecting immutable SQL facts. */
export function parseExchangeLedgerEnvelope(value: unknown, accountId: string, seasonId: string) {
  if (!object(value) || value.accountId !== accountId || value.seasonId !== seasonId
    || !Number.isSafeInteger(value.collectionRevision) || (value.collectionRevision as number) < 0
    || value.coverage !== "complete" && value.coverage !== "partial" || !Array.isArray(value.receipts)
    || value.seasonNegotiationIncomeTc !== null && (!Number.isSafeInteger(value.seasonNegotiationIncomeTc) || (value.seasonNegotiationIncomeTc as number) < 0)) return null;
  return projectExchangeLedger({accountId, seasonId, collectionRevision: value.collectionRevision as number,
    coverage: value.coverage, seasonNegotiationIncomeTc: value.seasonNegotiationIncomeTc as number | null, receipts: value.receipts});
}
export async function readClubExchangeHistory(admin: NonNullable<ReturnType<typeof createAdminClient>>, accountId: string, seasonId: string) {
  const {data,error}=await admin.rpc("touchline_club_exchange_history",{p_actor:accountId,p_season:seasonId});
  if(error) throw new Error("CLUB_STORAGE_UNAVAILABLE");
  const history=parseExchangeLedgerEnvelope(data,accountId,seasonId);
  if(!history) throw new Error("CLUB_STORAGE_UNAVAILABLE");
  return history;
}

export async function readClubExchangeDiscovery(admin: NonNullable<ReturnType<typeof createAdminClient>>, accountId: string, seasonId: string) {
  const {data,error}=await admin.rpc("touchline_club_exchange_discovery",{p_actor:accountId,p_season:seasonId});
  if(error) throw new Error("CLUB_STORAGE_UNAVAILABLE");
  const discovery=object(data) && Number.isSafeInteger(data.collectionRevision)
    ? parseExchangeDiscovery(data,{ready:true,accountId,seasonId,collectionRevision:data.collectionRevision as number}) : null;
  if(!discovery) throw new Error("CLUB_STORAGE_UNAVAILABLE");
  return discovery;
}
