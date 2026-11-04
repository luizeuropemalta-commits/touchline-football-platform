import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClubSeasonPaymentConfiguration } from "@/lib/stripe/club-season-configuration.server";
import { verifyClubSeasonWebhook, readClubSeasonWebhookSubject } from "@/lib/stripe/club-season-provider.server";
import { mapClubSeasonStoredOrder, mapClubSeasonPaymentStoredOrder } from "@/lib/stripe/club-season-order-store.server";
import { readSeasonWebhookBody, processClubSeasonWebhook } from "@/lib/stripe/club-season-webhook-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const resolved = resolveClubSeasonPaymentConfiguration("reconcile");
  if (!resolved.ok) return NextResponse.json({ error: "SEASON_CHECKOUT_UNAVAILABLE" }, { status: 503, headers });
  let event;
  try { event = await verifyClubSeasonWebhook(await readSeasonWebhookBody(request), request.headers.get("stripe-signature") ?? ""); }
  catch { return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400, headers }); }
  try {
    const admin = createAdminClient();
    if (!admin) throw new Error("STORAGE_UNAVAILABLE");
    const subject = await readClubSeasonWebhookSubject(event);
    const testMode = resolved.config.mode === "test";
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error("STORAGE_UNAVAILABLE");
      return data;
    };
    const contextArgs = () => {
      const context = subject?.providerContext;
      if (!context || context.mode !== resolved.config.mode || context.accountId !== resolved.config.accountId) throw new Error("SEASON_EVENT_MISMATCH");
      return { p_mode: context.mode, p_account_id: context.accountId,
        p_profile_id: context.profileId, p_catalogue_version: context.catalogueVersion };
    };
    const result = await processClubSeasonWebhook(event.id, subject, {
      async read(orderId) {
        const { data, error } = await admin.from("touchline_club_season_test_orders").select("*").eq("id", orderId).maybeSingle();
        if (error) throw new Error("STORAGE_UNAVAILABLE");
        if (!data) return null;
        const order = testMode ? mapClubSeasonStoredOrder(data) : mapClubSeasonPaymentStoredOrder(data);
        if (!testMode && (order.payment?.mode !== resolved.config.mode || order.payment.accountId !== resolved.config.accountId)) {
          throw new Error("SEASON_EVENT_MISMATCH");
        }
        return { ...order, sessionId: order.sessionId ?? "" };
      },
      fulfill: (id, eventId, evidence) => rpc(testMode ? "touchline_club_fulfill_season_test_order" : "touchline_club_fulfill_season_order",
        { p_order_id: id, p_event_id: eventId, p_evidence: evidence }),
      review: (id, eventId, type, session) => rpc(testMode ? "touchline_club_review_season_test_order" : "touchline_club_review_season_order",
        { p_order_id: id, p_event_id: eventId, p_event_type: type, p_session_id: session, ...(testMode ? {} : contextArgs()) }),
      expire: (id, eventId, session) => rpc(testMode ? "touchline_club_expire_season_test_order" : "touchline_club_expire_season_order",
        { p_order_id: id, p_event_id: eventId, p_session_id: session, ...(testMode ? {} : contextArgs()) }),
    });
    return NextResponse.json(result, { headers });
  } catch { return NextResponse.json({ error: "SEASON_WEBHOOK_RETRY_REQUIRED" }, { status: 503, headers }); }
}
