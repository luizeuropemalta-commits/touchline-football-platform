import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { ClubSeasonOrderStore, ClubSeasonStoredOrder } from "./club-season-checkout-service.ts";
import { CLUB_SEASON_TEST_ACCOUNT, clubSeasonChargeMinor, isClubSeasonPaidPlan } from "./club-season-test-catalogue.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = new Set(["pending", "paid", "expired", "review", "refunded"]);
function malformed(): never { throw new Error("SEASON_STORAGE_UNAVAILABLE"); }

/** Historical snapshots remain readable after expiry for webhook reconciliation.
 * Current-time validation belongs to the checkout/payment operations. */
export function mapClubSeasonStoredOrder(value: unknown): ClubSeasonStoredOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return malformed();
  const row = value as Record<string, unknown>;
  for (const key of ["id", "user_id", "season_id"]) if (typeof row[key] !== "string" || !UUID.test(row[key])) return malformed();
  if (!isClubSeasonPaidPlan(row.plan) || (row.previous_paid_plan !== null && !isClubSeasonPaidPlan(row.previous_paid_plan))
    || row.currency !== "eur" || row.provider_account !== CLUB_SEASON_TEST_ACCOUNT
    || typeof row.state !== "string" || !states.has(row.state)
    || (row.session_id !== null && (typeof row.session_id !== "string" || !/^cs_test_[A-Za-z0-9]+$/.test(row.session_id)))) return malformed();
  const times: number[] = [];
  for (const key of ["created_at", "first_attempt_at", "checkout_expires_at", "season_starts_at", "season_ends_at"]) {
    if (typeof row[key] !== "string" || !Number.isFinite(Date.parse(row[key]))) return malformed();
    times.push(Date.parse(row[key]));
  }
  const [created, attempt, expiry, start, end] = times;
  if (created !== attempt || created < start || expiry > end || end <= start || expiry % 1000 !== 0
    || expiry - created < 30 * 60_000 || expiry - created > 24 * 60 * 60_000) return malformed();
  const order: ClubSeasonStoredOrder = {
    id: row.id as string, userId: row.user_id as string, seasonId: row.season_id as string,
    plan: row.plan, ...(row.previous_paid_plan === null ? {} : { previousPaidPlan: row.previous_paid_plan }),
    state: row.state as ClubSeasonStoredOrder["state"], sessionId: row.session_id as string | null,
    amountMinor: row.amount_minor as number,
    createdAt: row.created_at as string, firstAttemptAt: row.first_attempt_at as string,
    checkoutExpiresAt: row.checkout_expires_at as string,
    seasonStartsAt: row.season_starts_at as string, seasonEndsAt: row.season_ends_at as string,
  };
  try { if (order.amountMinor !== clubSeasonChargeMinor(order)) return malformed(); } catch { return malformed(); }
  return order;
}

const exposedRpcErrors = new Set(["SEASON_ORDER_IN_PROGRESS", "SEASON_PAID_UPGRADE_REQUIRED", "SEASON_WINDOW_INVALID",
  "SEASON_SESSION_CONFLICT", "SEASON_ORDER_NOT_FOUND", "SEASON_ORDER_NOT_PENDING", "SEASON_PLAN_CONFLICT"]);
function storageError(message: string) {
  const code = message.match(/^SEASON_[A-Z_]+$/)?.[0];
  return new Error(code && exposedRpcErrors.has(code) ? code : "SEASON_STORAGE_UNAVAILABLE");
}
export function createClubSeasonOrderStore(admin: NonNullable<ReturnType<typeof createAdminClient>>): ClubSeasonOrderStore {
  return {
    async prepare(ownerId, plan) {
      const { data, error } = await admin.rpc("touchline_club_prepare_season_test_order", { p_user_id: ownerId, p_plan: plan });
      if (error) throw storageError(error.message);
      return mapClubSeasonStoredOrder(data);
    },
    async attach(ownerId, orderId, sessionId) {
      const { data, error } = await admin.rpc("touchline_club_attach_season_test_session", {
        p_user_id: ownerId, p_order_id: orderId, p_session_id: sessionId,
      });
      if (error) throw storageError(error.message);
      return mapClubSeasonStoredOrder(data);
    },
  };
}
