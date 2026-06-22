import { BadgeEuro, Building2, Crown, Trophy, Users } from "lucide-react";

export type RankingItem = {
  rank: number;
  name: string;
  meta: string;
  value: string;
  movement: string;
  accent: "gold" | "cyan" | "lime" | "rose";
};

export type RankingBoard = {
  key: string;
  title: string;
  description: string;
  source: string;
  updateCadence: string;
  icon: typeof Trophy;
  items: RankingItem[];
};

export const rankingBoards: RankingBoard[] = [
  {
    key: "players",
    title: "Most Valuable Players",
    description: "Global player value leaderboard prepared for daily data-provider sync.",
    source: "Market-data provider ready",
    updateCadence: "Daily refresh target",
    icon: Crown,
    items: [
      { rank: 1, name: "Kylian Mbappé", meta: "Forward · France", value: "€180M", movement: "Stable", accent: "gold" },
      { rank: 2, name: "Jude Bellingham", meta: "Midfielder · England", value: "€180M", movement: "+1", accent: "cyan" },
      { rank: 3, name: "Erling Haaland", meta: "Striker · Norway", value: "€180M", movement: "-1", accent: "lime" },
      { rank: 4, name: "Vinícius Júnior", meta: "Winger · Brazil", value: "€170M", movement: "Hot", accent: "rose" },
    ],
  },
  {
    key: "clubs",
    title: "Richest Club Squads",
    description: "Club squad-value ranking for recruitment and market context.",
    source: "Licensed football valuation feed required",
    updateCadence: "Daily refresh target",
    icon: Building2,
    items: [
      { rank: 1, name: "Real Madrid", meta: "La Liga · Spain", value: "€1.30B", movement: "Stable", accent: "gold" },
      { rank: 2, name: "Manchester City", meta: "Premier League · England", value: "€1.26B", movement: "+1", accent: "cyan" },
      { rank: 3, name: "Arsenal", meta: "Premier League · England", value: "€1.13B", movement: "+2", accent: "lime" },
      { rank: 4, name: "Chelsea", meta: "Premier League · England", value: "€980M", movement: "Watch", accent: "rose" },
    ],
  },
  {
    key: "agents",
    title: "Agent Portfolio Value",
    description: "Agent leaderboard by represented-player market value and deal activity.",
    source: "Internal verified portfolio data + market feed",
    updateCadence: "Daily refresh target",
    icon: Users,
    items: [
      { rank: 1, name: "Elite Global Sports", meta: "112 represented players", value: "€1.84B", movement: "Icon", accent: "gold" },
      { rank: 2, name: "Northern Star Agency", meta: "86 represented players", value: "€1.32B", movement: "+3", accent: "cyan" },
      { rank: 3, name: "Atlantic Football Group", meta: "74 represented players", value: "€1.08B", movement: "Stable", accent: "lime" },
      { rank: 4, name: "AF Founder Office", meta: "Your future agency", value: "€146.8M", movement: "Rising", accent: "rose" },
    ],
  },
  {
    key: "transfers",
    title: "Transfer Heat Index",
    description: "Most active transfer conversations by demand, urgency and value movement.",
    source: "Touchline live negotiation intelligence",
    updateCadence: "Live internal refresh",
    icon: BadgeEuro,
    items: [
      { rank: 1, name: "Elite strikers", meta: "Premier League demand", value: "+24%", movement: "Hot", accent: "rose" },
      { rank: 2, name: "U21 midfielders", meta: "Bundesliga + La Liga", value: "+18%", movement: "+4", accent: "gold" },
      { rank: 3, name: "Left-footed centre-backs", meta: "Serie A demand", value: "+12%", movement: "Rising", accent: "cyan" },
      { rank: 4, name: "Right-backs", meta: "Ligue 1 scouting", value: "+9%", movement: "Scout", accent: "lime" },
    ],
  },
];

