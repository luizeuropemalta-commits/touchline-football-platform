import { CLUB_ROSTER_CAPACITY } from "./club-roster.ts";

export type ClubValueQuote = Readonly<{
  id: string;
  canonicalPlayerId?: string | null;
  editorialCard?: { marketValueEur?: number; marketValueState?: string } | null;
}>;

/** Display only: current published quotes, never acquisition cost or wallet. */
export function clubValueSummary(
  state: { players: readonly { playerId: string }[] } | null,
  catalogue: readonly ClubValueQuote[],
) {
  if (!state || state.players.length > CLUB_ROSTER_CAPACITY.total) return null;
  const ids = state.players.map(player => player.playerId);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) return null;
  const quotes = new Map<string, ClubValueQuote>();
  const duplicates = new Set<string>();
  for (const quote of catalogue) {
    const id = quote.canonicalPlayerId ?? quote.id;
    if (quotes.has(id)) duplicates.add(id);
    quotes.set(id, quote);
  }
  let total = 0, missing = 0, provisional = 0;
  for (const id of ids) {
    const quote = quotes.get(id)?.editorialCard;
    if (duplicates.has(id) || !quote || !Number.isSafeInteger(quote.marketValueEur) || quote.marketValueEur! <= 0) {
      missing++; continue;
    }
    if (quote.marketValueState !== "verified") { provisional++; continue; }
    total += quote.marketValueEur!;
  }
  return { count: ids.length, missing, provisional,
    value: missing || provisional || !Number.isSafeInteger(total) ? null : total };
}
