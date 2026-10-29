import { buildClubSeasonCheckoutRequest, type ClubSeasonCheckoutOrder } from "./club-season-checkout-request.ts";
import { isClubSeasonPaidPlan, type ClubSeasonPaidPlan } from "./club-season-test-catalogue.ts";
import { readClubCommand } from "../touchlineFantasy/club-request.ts";
import { hasTouchLineArenaAccess } from "../touchlineArena/auth-access.ts";

type ClubSeasonCheckoutUser = Readonly<{
  id: string; email?: string | null; email_confirmed_at?: string;
  is_anonymous?: boolean; app_metadata?: Record<string, unknown> | null;
}>;

/** Called only with auth.getUser() evidence and the server owner allowlist.
 * Payment never provisions application identity or bypasses the admin boundary. */
export function authorizeClubSeasonCheckoutCustomer(user: ClubSeasonCheckoutUser | null, owners: readonly string[]): string | null {
  if (!user) return null;
  if (!user.id || user.is_anonymous || !user.email || !user.email_confirmed_at
    || !hasTouchLineArenaAccess(user) || owners.length === 0
    || owners.some(email => email.trim().toLowerCase() === user.email!.trim().toLowerCase())) {
    throw new Error("SEASON_CUSTOMER_ACCESS_REQUIRED");
  }
  return user.id;
}

export type ClubSeasonStoredOrder = ClubSeasonCheckoutOrder & {
  state: "pending" | "paid" | "expired" | "review" | "refunded";
  sessionId: string | null;
  amountMinor: number;
};
export type ClubSeasonOrderStore = {
  prepare(ownerId: string, plan: ClubSeasonPaidPlan): Promise<ClubSeasonStoredOrder>;
  attach(ownerId: string, orderId: string, sessionId: string): Promise<ClubSeasonStoredOrder>;
};
export type ClubSeasonCheckoutResult = { orderId: string; sessionId: string; url: string; testMode: true };

export function parseClubSeasonCheckoutInput(value: unknown): { plan: ClubSeasonPaidPlan; expectedAmountMinor: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || !Object.hasOwn(input, "plan") || !isClubSeasonPaidPlan(input.plan)
    || !Object.hasOwn(input, "expectedAmountMinor") || typeof input.expectedAmountMinor !== "number"
    || !Number.isSafeInteger(input.expectedAmountMinor) || input.expectedAmountMinor <= 0) return null;
  return { plan: input.plan, expectedAmountMinor: input.expectedAmountMinor };
}

/** Authenticated owner is supplied by the route; client expected amount is only
 * an assertion against the server quote, never price authority. No user/season
 * is accepted. A failed/unknown provider call keeps the persisted order pending. */
export async function beginClubSeasonCheckout(input: { ownerId: string; plan: ClubSeasonPaidPlan; expectedAmountMinor: number }, dependencies: {
  store: ClubSeasonOrderStore;
  createCheckout(order: ClubSeasonCheckoutOrder): Promise<{ sessionId: string; url: string }>;
}, now = Date.now()): Promise<ClubSeasonCheckoutResult> {
  const order = await dependencies.store.prepare(input.ownerId, input.plan);
  if (order.userId !== input.ownerId || order.plan !== input.plan) throw new Error("SEASON_ORDER_CONTEXT_CHANGED");
  if (order.amountMinor !== input.expectedAmountMinor) throw new Error("SEASON_QUOTE_CHANGED");
  if (order.state !== "pending") throw new Error("SEASON_ORDER_REQUIRES_REVIEW");
  // Validate the persisted request before contacting the provider. Never replace
  // an expired or uncertain order automatically with another purchase.
  buildClubSeasonCheckoutRequest(order, now);
  const checkout = await dependencies.createCheckout(order);
  let url: URL;
  try { url = new URL(checkout.url); } catch { throw new Error("SEASON_CHECKOUT_UNAVAILABLE"); }
  if (!/^cs_test_[A-Za-z0-9]+$/.test(checkout.sessionId) || url.origin !== "https://checkout.stripe.com"
    || url.username || url.password || (order.sessionId !== null && checkout.sessionId !== order.sessionId)) {
    throw new Error("SEASON_CHECKOUT_UNAVAILABLE");
  }
  const attached = await dependencies.store.attach(input.ownerId, order.id, checkout.sessionId);
  if (attached.id !== order.id || attached.userId !== input.ownerId || attached.seasonId !== order.seasonId
    || attached.plan !== order.plan || attached.previousPaidPlan !== order.previousPaidPlan
    || attached.amountMinor !== order.amountMinor || attached.sessionId !== checkout.sessionId
    || (attached.state !== "pending" && attached.state !== "paid")) {
    throw new Error("SEASON_ORDER_CONTEXT_CHANGED");
  }
  return { orderId: order.id, sessionId: checkout.sessionId, url: checkout.url, testMode: true };
}

const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
const conflicts = new Set(["SEASON_ORDER_IN_PROGRESS", "SEASON_PAID_UPGRADE_REQUIRED", "SEASON_WINDOW_INVALID",
  "SEASON_ORDER_REQUIRES_REVIEW", "SEASON_QUOTE_CHANGED", "SEASON_ORDER_CONTEXT_CHANGED", "SEASON_SESSION_CONFLICT", "INVALID_CHECKOUT_WINDOW",
  "INVALID_SEASON_ORDER", "SEASON_PLAN_CONFLICT"]);

/** Dependency boundary also permits request-level tests without real credentials. */
export async function handleClubSeasonCheckout(request: Request, dependencies: {
  configured(): boolean;
  authenticate(): Promise<string | null>;
  begin(ownerId: string, plan: ClubSeasonPaidPlan, expectedAmountMinor: number): Promise<ClubSeasonCheckoutResult>;
}): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure("INVALID_ORIGIN", 403);
  if (!dependencies.configured()) return failure("SEASON_CHECKOUT_UNAVAILABLE", 503);
  try {
    const ownerId = await dependencies.authenticate();
    if (!ownerId) return failure("AUTH_REQUIRED", 401);
    const input = parseClubSeasonCheckoutInput(await readClubCommand(request, 256));
    if (!input) return failure("INVALID_REQUEST", 400);
    const result = await dependencies.begin(ownerId, input.plan, input.expectedAmountMinor);
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === "SEASON_CUSTOMER_ACCESS_REQUIRED") {
      return failure("SEASON_CUSTOMER_ACCESS_REQUIRED", 403);
    }
    const code = error instanceof Error && conflicts.has(error.message) ? error.message : null;
    return failure(code ?? "SEASON_CHECKOUT_UNAVAILABLE", code ? 409 : 503);
  }
}
