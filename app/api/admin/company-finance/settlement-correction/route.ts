import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { readCompanyJson } from "@/lib/admin/company-finance-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "INVALID_ORIGIN" }, 403);
    const session = await createClient();
    if (!session) return reply({ error: "FORBIDDEN" }, 403);
    const { data: { user }, error } = await session.auth.getUser();
    if (error || !hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email) || !user) return reply({ error: "FORBIDDEN" }, 403);
    const body = await readCompanyJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "INVALID_INPUT" }, 400);
    const input = body as Record<string, unknown>;
    if (!uuid(input.requestId) || !uuid(input.settlementId) || input.confirmed !== true || typeof input.reason !== "string"
      || input.reason.trim().length < 20 || input.reason.length > 2000) return reply({ error: "INVALID_INPUT" }, 400);
    const admin = createAdminClient();
    if (!admin) return reply({ error: "UNAVAILABLE" }, 503);
    const result = await admin.rpc("touchline_company_cancel_settlement", { p_request_id: input.requestId, p_settlement_id: input.settlementId, p_reason: input.reason.trim(), p_actor_id: user.id });
    if (result.error) return reply({ error: "CORRECTION_NOT_CONFIRMED" }, ["40001", "23505", "22023"].includes(result.error.code ?? "") ? 409 : 503);
    if (result.data?.id !== input.requestId.toLowerCase() || result.data?.settlement_id !== input.settlementId.toLowerCase()) return reply({ error: "CORRECTION_NOT_CONFIRMED" }, 503);
    return reply({ record: result.data });
  } catch { return reply({ error: "UNAVAILABLE" }, 503); }
}
