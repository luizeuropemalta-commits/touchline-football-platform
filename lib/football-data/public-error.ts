/**
 * Public responses from football-data routes must not forward provider error
 * messages. They can contain upstream URLs, entitlement wording, or other
 * implementation detail that is useful in protected logs but not to a visitor.
 */
export type PublicFootballDataFailure = Readonly<{
  ok: false;
  error: "Football data is temporarily unavailable." | "Requested football data is not available.";
  code: "TL_FOOTBALL_DATA_UNAVAILABLE" | "TL_FOOTBALL_DATA_NOT_FOUND";
}>;

export function publicFootballDataFailure(
  providerCode: "not_configured" | "unsupported" | "provider_error" | "not_found" | "invalid_request" | "rate_limited",
): PublicFootballDataFailure {
  if (providerCode === "not_found") {
    return {
      ok: false,
      error: "Requested football data is not available.",
      code: "TL_FOOTBALL_DATA_NOT_FOUND",
    };
  }

  return {
    ok: false,
    error: "Football data is temporarily unavailable.",
    code: "TL_FOOTBALL_DATA_UNAVAILABLE",
  };
}
