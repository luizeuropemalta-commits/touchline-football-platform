const TOUCHLINE_CANONICAL_PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Builds the owner-only Card Engine deep link for one canonical player.
 * Provider ids and display names are deliberately rejected: the protected
 * editor must open the exact TouchLine record or expose no shortcut at all.
 */
export function touchlineCardEnginePlayerHref(
  canonicalPlayerId: string | null | undefined,
  locale?: string | null,
) {
  const playerId = canonicalPlayerId?.trim().toLowerCase() ?? "";
  if (!TOUCHLINE_CANONICAL_PLAYER_ID.test(playerId)) return null;

  const params = new URLSearchParams({ playerId });
  if (locale) params.set("lang", locale);
  return `/admin/manual-card-editorial?${params.toString()}#manual-card-editor`;
}
