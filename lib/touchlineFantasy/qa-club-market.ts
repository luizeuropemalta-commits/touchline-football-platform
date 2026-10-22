import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/** QA-only authority. A Vercel Preview still runs with NODE_ENV=production. */
export function isQaClubMarketRuntime(environment: Readonly<Record<string, string | undefined>>): boolean {
  const qaUrl = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
  return environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "qa"
    && environment.TOUCHLINE_DEPLOYMENT_MODE === "qa-preview"
    && environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === "qa-preview"
    && environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF === "xgxbwqxjssxxuihuwmgy"
    && environment.SUPABASE_URL === qaUrl
    && environment.NEXT_PUBLIC_SUPABASE_URL === qaUrl;
}

/** Missing RPC/error/non-QA runtime always fails closed. */
export async function readQaClubMarketOpening(admin: NonNullable<ReturnType<typeof createAdminClient>>, seasonId: string): Promise<boolean> {
  if (!isQaClubMarketRuntime(process.env)) return false;
  const { data, error } = await admin.rpc("touchline_qa_club_market_is_open", { p_season_id: seasonId });
  return !error && data === true;
}
