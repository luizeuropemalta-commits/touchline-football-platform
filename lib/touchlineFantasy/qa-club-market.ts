import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/** QA-only authority. Missing RPC/error/non-QA host always fails closed. */
export async function readQaClubMarketOpening(admin: NonNullable<ReturnType<typeof createAdminClient>>, seasonId: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url !== "https://xgxbwqxjssxxuihuwmgy.supabase.co" || process.env.NODE_ENV === "production") return false;
  const { data, error } = await admin.rpc("touchline_qa_club_market_is_open", { p_season_id: seasonId });
  return !error && data === true;
}
