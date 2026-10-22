import { CLUB_ROSTER_SHOWCASE_LIMIT } from "../../../lib/touchlineFantasy/club-roster.ts";

/** Shared listing policy. The authenticated server must also enforce this atomically. */
export const CLUBOWNER_SHOWCASE_LIMIT = CLUB_ROSTER_SHOWCASE_LIMIT;
export const TOUCHLINE_TRANSFER_MARKET_NAME = "TouchLine Markt Transfer";
export const CLUBOWNER_EXCHANGE_NAME = "ClubOwner Exchange";
export type ExchangePlan = "beta" | "standard" | "master" | "vip";

export function changeShowcaseListing(input: {
  plan: ExchangePlan; listedIds: readonly string[]; ownedIds: readonly string[];
  reservedIds: ReadonlySet<string>; unavailableIds: ReadonlySet<string>;
  cardId: string; publish: boolean; locked: boolean;
}): string[] {
  const { listedIds, cardId } = input;
  if (new Set(listedIds).size !== listedIds.length || listedIds.length > CLUBOWNER_SHOWCASE_LIMIT)
    throw new Error("A vitrine contém anúncios inválidos. Recarregue os dados.");
  // Withdrawing publicity is always possible; it does not cancel a proposal.
  if (!input.publish) return listedIds.filter(id => id !== cardId);
  if (!["standard", "master", "vip"].includes(input.plan)) throw new Error("A vitrine está disponível nos planos pagos.");
  if (input.locked) throw new Error("A rodada está travada. Aguarde a reabertura para anunciar.");
  if (!input.ownedIds.includes(cardId)) throw new Error("Só é possível anunciar um jogador do próprio elenco.");
  if (input.reservedIds.has(cardId) || input.unavailableIds.has(cardId)) throw new Error("Este jogador está reservado ou indisponível.");
  if (listedIds.includes(cardId)) return [...listedIds];
  if (listedIds.length >= CLUBOWNER_SHOWCASE_LIMIT) throw new Error(`Sua vitrine já tem ${CLUBOWNER_SHOWCASE_LIMIT} jogadores. Retire um anúncio antes de adicionar outro.`);
  return [...listedIds, cardId];
}

/** Explicit listing IDs only: never fall back to showing the private roster. */
export function selectShowcaseCards<T>(cards: readonly T[], listedIds: readonly string[], identity: (card: T) => string): T[] {
  if (listedIds.length > CLUBOWNER_SHOWCASE_LIMIT || new Set(listedIds).size !== listedIds.length) return [];
  const byId = new Map(cards.map(card => [identity(card), card]));
  return listedIds.flatMap(id => { const card = byId.get(id); return card ? [card] : []; });
}
