import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { CLUB_PLANS, checkedCredits, assertCredits, quoteClubReturn, quoteClubExchange,
  type ClubReturnReason } from "../../../lib/touchlineFantasy/club-market-rules.ts";

/** Visual-study policy only. Not an entitlement, wallet or transaction service. */
export const PREVIEW_PLANS = {
  beta: { name: "Beta", ...CLUB_PLANS.beta, clubs: 6 },
  standard: { name: "Standard", ...CLUB_PLANS.standard, clubs: 20 },
  master: { name: "Master", ...CLUB_PLANS.master, clubs: 20 },
  vip: { name: "VIP", ...CLUB_PLANS.vip, clubs: 20 },
} as const;
export type PreviewPlan = keyof typeof PREVIEW_PLANS;
export const POSITIONS = [
  { key: "GK", label: "Goleiros", short: "GO", count: 3 },
  { key: "CB", label: "Zagueiros", short: "ZAG", count: 6 },
  { key: "RB", label: "Laterais direitos", short: "LD", count: 3 },
  { key: "LB", label: "Laterais esquerdos", short: "LE", count: 3 },
  { key: "DM", label: "Volantes", short: "VOL", count: 5 },
  { key: "MID", label: "Meias", short: "MEI", count: 5 },
  { key: "RW", label: "Pontas direitos", short: "PD", count: 3 },
  { key: "LW", label: "Pontas esquerdos", short: "PE", count: 3 },
  { key: "CF", label: "Centroavantes", short: "CA", count: 4 },
] as const;
export type PreviewPosition = (typeof POSITIONS)[number]["key"];
export function cardIdentity(card: ClubOwnerSquadCard) { return card.canonicalPlayerId || card.id; }
export function cardValue(card: ClubOwnerSquadCard) {
  const value = card.editorialCard?.marketValueEur;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function positionOf(card: ClubOwnerSquadCard): PreviewPosition | null {
  const p = card.position.toLowerCase().replaceAll("-", " ");
  if (/goalkeeper|^gk$/.test(p)) return "GK";
  if (/centre back|center back/.test(p)) return "CB";
  if (/right back/.test(p)) return "RB";
  if (/left back/.test(p)) return "LB";
  if (/defensive mid/.test(p)) return "DM";
  if (/right wing|right attacker/.test(p)) return "RW";
  if (/left wing|left attacker/.test(p)) return "LW";
  if (/centre forward|center forward|striker/.test(p)) return "CF";
  if (/midfield/.test(p)) return "MID";
  return null;
}
export function allowedForPlan(card: ClubOwnerSquadCard, plan: PreviewPlan) {
  return plan !== "beta" || /^(Hull City|Coventry City|Ipswich Town|AFC Bournemouth|Bournemouth|Sunderland|Everton)$/.test(card.clubName);
}
export function assembleRoster(catalogue: readonly ClubOwnerSquadCard[], plan: PreviewPlan, preferred: readonly string[] = []) {
  const unique = new Map(catalogue.map(card => [cardIdentity(card), card]));
  const pool = [...unique.values()].filter(c => allowedForPlan(c, plan) && cardValue(c) !== null);
  const eligible = new Map(pool.map(c => [cardIdentity(c), c]));
  const selection = [...new Set(preferred)].map(id => eligible.get(id)).filter((c): c is ClubOwnerSquadCard => c !== undefined);
  if (selection.length === 35 && POSITIONS.every(p => selection.filter(c => positionOf(c) === p.key).length === p.count)
    && selection.reduce((n, c) => n + cardValue(c)!, 5_000_000) <= PREVIEW_PLANS[plan].budget) return selection;
  const cheapest = POSITIONS.flatMap(p => pool.filter(c => positionOf(c) === p.key)
    .sort((a,b) => cardValue(a)! - cardValue(b)! || cardIdentity(a).localeCompare(cardIdentity(b))).slice(0, p.count));
  return cheapest.length === 35 && cheapest.reduce((n, c) => n + cardValue(c)!, 5_000_000) <= PREVIEW_PLANS[plan].budget ? cheapest : [];
}
/** Local fixture composition only: select existing cards, never invent or recolour a tier. */
export function assembleDisplayRoster(catalogue: readonly ClubOwnerSquadCard[]) {
  const roster = assembleRoster(catalogue, "vip");
  if (roster.length !== 35) return roster;
  const tiers = ["diamond-gold", "clear-diamond", "emerald-green", "radiant-gold", "amethyst-purple", "sapphire-blue", "ruby-red"];
  const protectedIds = new Set<string>();
  let spent = roster.reduce((sum, card) => sum + cardValue(card)!, 5_000_000);
  for (const tier of tiers) {
    const existing = roster.find(card => card.editorialCard?.tierKey === tier);
    if (existing) { protectedIds.add(cardIdentity(existing)); continue; }
    const candidates = catalogue.filter(card => card.editorialCard?.tierKey === tier && cardValue(card) !== null)
      .sort((a, b) => cardValue(b)! - cardValue(a)! || cardIdentity(a).localeCompare(cardIdentity(b)));
    for (const card of candidates) {
      const index = roster.findIndex(current => positionOf(current) === positionOf(card) && !protectedIds.has(cardIdentity(current)));
      if (index < 0 || spent - cardValue(roster[index])! + cardValue(card)! > PREVIEW_PLANS.vip.budget - 100_000_000) continue;
      spent += cardValue(card)! - cardValue(roster[index])!;
      roster[index] = card;
      protectedIds.add(cardIdentity(card));
      break;
    }
  }
  return roster;
}

/** Explicit initial fixture listings; subsequent exits never auto-fill an advertisement. */
export function initialShowcaseIds(roster: readonly ClubOwnerSquadCard[]) {
  const ordered = [...roster].sort((a, b) => (cardValue(b) ?? 0) - (cardValue(a) ?? 0) || cardIdentity(a).localeCompare(cardIdentity(b)));
  const byTier = new Map<string, ClubOwnerSquadCard>();
  for (const card of ordered) if (card.editorialCard?.tierKey && !byTier.has(card.editorialCard.tierKey)) byTier.set(card.editorialCard.tierKey, card);
  return [...new Set([...byTier.values(), ...ordered].map(cardIdentity))].slice(0, 10);
}

export function marketQuote(balance: number, outgoing: number, incoming: number, plan: PreviewPlan,
  reason: ClubReturnReason = "ordinary", confirmedLeagueExit = false) {
  assertCredits(balance, outgoing, incoming);
  const quote = quoteClubReturn(outgoing, plan, reason, confirmedLeagueExit);
  return { ...quote, balance, final: checkedCredits(BigInt(balance) + BigInt(quote.refund) - BigInt(incoming)) };
}
export function exchangeQuote(balance: number, outgoing: number, incoming: number, plan: PreviewPlan,
  otherPlan: Exclude<PreviewPlan, "beta">, direction: "outgoing" | "incoming" = "outgoing") {
  assertCredits(balance, outgoing, incoming);
  if (!["standard", "master", "vip"].includes(otherPlan)) throw new RangeError("Counterparty must have an eligible plan");
  if (plan === "beta") return null;
  const ownProposes = direction === "outgoing";
  const q = quoteClubExchange(ownProposes ? outgoing : incoming, ownProposes ? incoming : outgoing, ownProposes ? plan : otherPlan);
  const fee = ownProposes ? q.fee : 0, otherFee = ownProposes ? 0 : q.fee;
  const bonus = ownProposes ? 0 : q.bonus, otherBonus = ownProposes ? q.bonus : 0;
  const compensation = checkedCredits(BigInt(outgoing) - BigInt(incoming));
  return { rate: ownProposes ? q.rate : 0, fee, otherRate: ownProposes ? 0 : q.rate,
    otherFee, bonus, otherBonus, retired: q.retired, compensation, balance,
    final: checkedCredits(BigInt(balance) + BigInt(compensation) - BigInt(fee) + BigInt(bonus)) };
}
export function formatCredits(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value / 1_000_000)} M TC`;
}
