const responseHeaders = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers: responseHeaders });

export type ClubSeasonCheckoutStatus = {
  status: "pending" | "paid" | "review" | "expired";
  plan: "standard" | "master" | "vip";
  seasonEndsAt: string;
};

/** This endpoint reads the committed order. Return URL parameters never grant access. */
export async function handleClubSeasonCheckoutStatus(request: Request, dependencies: {
  configured(): boolean;
  authenticate(): Promise<string | null>;
  read(ownerId: string, sessionId: string): Promise<unknown>;
}): Promise<Response> {
  if (!dependencies.configured()) return fail("SEASON_CHECKOUT_UNAVAILABLE", 503);
  try {
    const ownerId = await dependencies.authenticate();
    if (!ownerId) return fail("AUTH_REQUIRED", 401);
    const params = new URL(request.url).searchParams;
    const sessionId = params.get("session_id");
    if (params.size !== 1 || !sessionId || sessionId.length > 255 || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) {
      return fail("INVALID_REQUEST", 400);
    }
    const value = await dependencies.read(ownerId, sessionId);
    if (!value) return fail("SEASON_ORDER_NOT_FOUND", 404);
    if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid order");
    const row = value as Record<string, unknown>;
    // Check identity even though the adapter also restricts the database query.
    if (row.user_id !== ownerId || row.session_id !== sessionId) return fail("SEASON_ORDER_NOT_FOUND", 404);
    if (!["pending", "paid", "review", "expired", "refunded"].includes(String(row.state))
      || !["standard", "master", "vip"].includes(String(row.plan))
      || typeof row.season_ends_at !== "string" || !Number.isFinite(Date.parse(row.season_ends_at))) {
      throw new Error("Invalid order");
    }
    const result: ClubSeasonCheckoutStatus = {
      status: row.state === "refunded" ? "review" : row.state as ClubSeasonCheckoutStatus["status"],
      plan: row.plan as ClubSeasonCheckoutStatus["plan"], seasonEndsAt: row.season_ends_at,
    };
    return Response.json({ ok: true, ...result }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof Error && error.message === "SEASON_CUSTOMER_ACCESS_REQUIRED") return fail(error.message, 403);
    return fail("SEASON_CHECKOUT_UNAVAILABLE", 503);
  }
}
