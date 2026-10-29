import assert from "node:assert/strict";
import test from "node:test";
import { handleClubSeasonCheckoutStatus } from "../lib/stripe/club-season-checkout-status.ts";

const row = { user_id: "owner", session_id: "cs_test_synthetic", state: "pending", plan: "standard", season_ends_at: "2027-06-01T00:00:00Z" };
const request = (query = "session_id=cs_test_synthetic") => new Request(`https://qa.example.test/api/touchline-fantasy/season-checkout/status?${query}`);
test("return status is private, owner scoped and reads only committed state", async () => {
  for (const state of ["pending", "paid", "review", "expired", "refunded"]) {
    const response = await handleClubSeasonCheckoutStatus(request(), {
      configured: () => true, authenticate: async () => "owner",
      read: async (owner, session) => {
        assert.equal(owner, row.user_id); assert.equal(session, row.session_id);
        return { ...row, state, secret: "private evidence", amount_minor: 4990 };
      },
    });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { ok: true, status: state === "refunded" ? "review" : state, plan: "standard", seasonEndsAt: row.season_ends_at });
  }
});
test("disabled gate, missing/forbidden identity and malformed queries never reach privileged storage", async () => {
  const base = { configured: () => true, authenticate: async () => "owner", read: async () => assert.fail("unexpected read") };
  assert.equal((await handleClubSeasonCheckoutStatus(request(), { ...base, configured: () => false, authenticate: async () => assert.fail("auth when disabled") })).status, 503);
  assert.equal((await handleClubSeasonCheckoutStatus(request(), { ...base, authenticate: async () => null })).status, 401);
  assert.equal((await handleClubSeasonCheckoutStatus(request(), { ...base, authenticate: async () => { throw new Error("SEASON_CUSTOMER_ACCESS_REQUIRED"); } })).status, 403);
  for (const query of ["", "session_id=cs_live_x", "session_id=cs_test_x&user_id=forged", "session_id=cs_test_x&session_id=cs_test_y", "session_id=bad", `session_id=cs_test_${"x".repeat(256)}`]) {
    assert.equal((await handleClubSeasonCheckoutStatus(request(query), base)).status, 400);
  }
});
test("unknown and cross-account orders are indistinguishable; database errors never become paid", async () => {
  const base = { configured: () => true, authenticate: async () => "owner" };
  for (const value of [null, { ...row, user_id: "another" }, { ...row, session_id: "cs_test_other" }]) {
    const response = await handleClubSeasonCheckoutStatus(request(), { ...base, read: async () => value });
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { ok: false, error: "SEASON_ORDER_NOT_FOUND" });
  }
  for (const value of [{ ...row, state: "active" }, { ...row, plan: "pro" }, { ...row, season_ends_at: "bad" }]) {
    assert.equal((await handleClubSeasonCheckoutStatus(request(), { ...base, read: async () => value })).status, 503);
  }
  const response = await handleClubSeasonCheckoutStatus(request(), { ...base, read: async () => { throw new Error("PRIVATE_DATABASE_SECRET"); } });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_SECRET/);
});
