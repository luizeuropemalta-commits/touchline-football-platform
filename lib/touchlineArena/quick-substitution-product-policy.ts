/**
 * Owner decision, 11 October 2026: XI edits are unlimited while the Market is
 * open, including re-entry after confirmation; no substitution after it closes.
 * The experimental LIVE protocol is retained for audit/history, not enabled.
 * Deliberately not environment-controlled: old configuration cannot revive it.
 * Market editing continues through the canonical Fantasy save-lineup command.
 */
export const TOUCHLINE_LIVE_QUICK_SUB_ENABLED: boolean = false;
