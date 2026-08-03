import { touchlineClubOwnerBasePath, touchlineClubOwnerSubstitutionPath } from "./club-owner-routes.ts";

export type ArenaOnlineZoneKey = "live" | "bench" | "market" | "rankings" | "news" | "watch";

export type ArenaOnlineZone = {
  key: ArenaOnlineZoneKey;
  title: string;
  eyebrow: string;
  href: string;
  description: string;
  promise: string;
  details: string[];
};

export const ARENA_ONLINE_ZONES: ArenaOnlineZone[] = [
  {
    key: "live",
    title: "Live",
    eyebrow: "Match now",
    href: "/live",
    description: "Scores, events, statistics and card points updating in real time.",
    promise: "The user understands in seconds who scored points and why they should return to the Arena.",
    details: ["Goals, assists and cards", "Card points", "Fixture timeline"],
  },
  {
    key: "bench",
    title: "Substitutions",
    eyebrow: "Bench",
    href: touchlineClubOwnerSubstitutionPath(),
    description: "Fast menu to swap starters, open reserves and compare team impact.",
    promise: "Console-style flow: press Start, choose the bench card, confirm the swap.",
    details: ["Reserves", "Fast swap", "Starter status"],
  },
  {
    key: "market",
    title: "TouchLine Market Transfer",
    eyebrow: "Transfer",
    href: "/market-transfer",
    description: "Negotiations, offers, wishlist and card value movement inside the Arena.",
    promise: "Every Arena signal can become a clear opportunity to build, sell or hold cards.",
    details: ["Buy and sell", "Offers", "Value history"],
  },
  {
    key: "rankings",
    title: "TouchLine Player Cards Ranking",
    eyebrow: "Cards",
    href: "/touchline-tables",
    description: "Premium player-card ranking connected to the market, Club Hub and ClubOwner profile.",
    promise: "The user understands which cards are most valuable, which score most and which they want to buy.",
    details: ["Card ranking", "TouchLine Points", "Market value"],
  },
  {
    key: "news",
    title: "New Rumours",
    eyebrow: "Signals",
    href: touchlineClubOwnerBasePath(),
    description: "Real player news, injuries, rumours and direct card impact.",
    promise: "The user opens the Arena every day to see what changed in the squad.",
    details: ["Injuries", "Transfers", "Card impact"],
  },
  {
    key: "watch",
    title: "Watch Guide",
    eyebrow: "Broadcasters",
    href: "/live",
    description: "Official broadcasters linked to fixtures when the contracted data provides them.",
    promise: "No pirate streams: only official routes to follow the match.",
    details: ["Official TV", "Fixture", "Local time"],
  },
];

export function arenaOnlineZoneForSlug(slug: string) {
  return ARENA_ONLINE_ZONES.find((zone) => zone.key === slug);
}
