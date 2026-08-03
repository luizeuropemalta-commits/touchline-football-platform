import type { ClubOwnerSquadCard } from "./demo-data.ts";
import {
  parseClubOwnerRoster,
} from "./club-owner-roster.ts";
import type {
  AuthoritativeRosterErrorCode,
  AuthoritativeRosterReadResult,
} from "./authoritative-roster-server.ts";

export type TouchlineServerPageRoster =
  | Readonly<{
      state: "authenticated";
      cards: ClubOwnerSquadCard[];
      error: null;
    }>
  | Readonly<{
      state: "public-demo";
      cards: ClubOwnerSquadCard[];
      error: null;
    }>
  | Readonly<{
      state: "unavailable";
      cards: [];
      error: AuthoritativeRosterErrorCode | "TL_ROSTER_SERVER_UNAVAILABLE";
    }>;

/**
 * Keeps server-rendered account pages on the same trust boundary as the Arena:
 * an authenticated roster can only come from active contracts in Supabase.
 * Browser cookies are accepted exclusively for the public demo experience.
 */
export function resolveTouchlineServerPageRoster(input: Readonly<{
  authenticatedUserId?: string | null;
  authoritativeRoster?: AuthoritativeRosterReadResult | null;
  publicCookieValue?: string | null;
}>): TouchlineServerPageRoster {
  if (input.authenticatedUserId) {
    if (!input.authoritativeRoster?.ok) {
      return {
        state: "unavailable",
        cards: [],
        error: input.authoritativeRoster?.error ?? "TL_ROSTER_SERVER_UNAVAILABLE",
      };
    }

    return {
      state: "authenticated",
      cards: input.authoritativeRoster.snapshot.cards,
      error: null,
    };
  }

  return {
    state: "public-demo",
    cards: parseClubOwnerRoster(input.publicCookieValue, { fallback: "demo" }),
    error: null,
  };
}
