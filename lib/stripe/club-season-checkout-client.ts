export type ClubSeasonCheckoutPlan = "standard" | "master" | "vip";
export type ClubSeasonCheckoutOffers = Partial<Record<ClubSeasonCheckoutPlan, { amountMinor: number }>>;

/** The server independently calculates the charge and owns the order. The
 * displayed quote is sent back only as a stale-price assertion, never authority. */
export function checkoutDisplayAmount(offers: ClubSeasonCheckoutOffers | undefined, plan: string): number | null {
  if (plan !== "standard" && plan !== "master" && plan !== "vip") return null;
  const amount = offers?.[plan]?.amountMinor;
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export async function requestClubSeasonCheckout(plan: ClubSeasonCheckoutPlan, expectedAmountMinor: number, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<string> {
  if (!Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor <= 0) throw new Error("CHECKOUT_UNAVAILABLE");
  const response = await fetcher("/api/touchline-fantasy/season-checkout", {
    method: "POST", credentials: "same-origin", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, expectedAmountMinor }),
  });
  if (!response.ok) throw new Error("CHECKOUT_UNAVAILABLE");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true
    || !("url" in result) || typeof result.url !== "string"
    || !("sessionId" in result) || typeof result.sessionId !== "string"
    || !/^cs_test_[A-Za-z0-9]+$/.test(result.sessionId)) throw new Error("CHECKOUT_UNAVAILABLE");
  let url: URL;
  try { url = new URL(result.url); } catch { throw new Error("CHECKOUT_UNAVAILABLE"); }
  if (url.origin !== "https://checkout.stripe.com" || url.username || url.password) throw new Error("CHECKOUT_UNAVAILABLE");
  return url.href;
}
