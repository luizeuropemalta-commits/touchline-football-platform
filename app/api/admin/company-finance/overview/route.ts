import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { parseCompanyOverview } from "@/lib/admin/company-finance-overview";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET() {
  try {
    const session = await createClient();
    if (!session) return reply({ error: "FORBIDDEN" }, 403);
    const { data: { user }, error } = await session.auth.getUser();
    if (error || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) return reply({ error: "FORBIDDEN" }, 403);
    const admin = createAdminClient();
    if (!admin) return reply({ error: "UNAVAILABLE" }, 503);
    const result = await admin.rpc("touchline_company_finance_overview");
    const overview = !result.error && parseCompanyOverview(result.data);
    return overview ? reply(overview) : reply({ error: "UNAVAILABLE" }, 503);
  } catch {
    return reply({ error: "UNAVAILABLE" }, 503);
  }
}
