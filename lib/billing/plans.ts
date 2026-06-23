export type BillingInterval = "month" | "year";
export type PlanAudience = "agent" | "club" | "academy";
export type PlanKey =
  | "starter_agent"
  | "pro_agent"
  | "elite_agency"
  | "club_basic"
  | "club_pro"
  | "club_elite"
  | "academy"
  | "founder";

export type FeatureKey =
  | "basic_dashboard"
  | "basic_player_vault"
  | "advanced_player_vault"
  | "basic_scouting"
  | "advanced_scouting"
  | "club_network"
  | "transfer_market"
  | "ai_assistant"
  | "contract_tools"
  | "invoice_tools"
  | "investor_hub"
  | "advanced_analytics"
  | "agent_league"
  | "premium_ranking"
  | "team_members"
  | "player_search"
  | "advanced_player_search"
  | "shortlists"
  | "unlimited_shortlists"
  | "agent_communication"
  | "player_comparison"
  | "market_alerts"
  | "club_deal_room"
  | "priority_visibility"
  | "talent_upload"
  | "scout_connections"
  | "club_visibility"
  | "academy_network"
  | "development_profiles"
  | "priority_support";

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  audience: PlanAudience;
  monthly: number | null;
  yearly: number;
  description: string;
  featured?: boolean;
  founder?: boolean;
  features: string[];
  entitlements: FeatureKey[];
  limits: {
    players?: number;
    clubConnections?: number;
    scoutingReports?: number;
    teamMembers?: number;
    shortlists?: number;
  };
}

export const plans: PlanDefinition[] = [
  {
    key: "starter_agent",
    name: "Starter Agent",
    audience: "agent",
    monthly: 29,
    yearly: 290,
    description: "The essential career operating system for independent agents.",
    features: ["Up to 10 players", "5 club connections", "Basic scouting", "Player Vault", "Command Center"],
    entitlements: ["basic_dashboard", "basic_player_vault", "basic_scouting"],
    limits: { players: 10, clubConnections: 5, scoutingReports: 10, teamMembers: 1 },
  },
  {
    key: "pro_agent",
    name: "Pro Agent",
    audience: "agent",
    monthly: 79,
    yearly: 790,
    description: "Advanced intelligence and market access for growing agencies.",
    featured: true,
    features: ["Up to 50 players", "Touchline AI", "Advanced scouting", "Club Network", "Transfer Market", "Contracts & invoicing"],
    entitlements: ["basic_dashboard", "basic_player_vault", "advanced_player_vault", "basic_scouting", "advanced_scouting", "club_network", "transfer_market", "ai_assistant", "contract_tools", "invoice_tools"],
    limits: { players: 50, clubConnections: 100, scoutingReports: 250, teamMembers: 3 },
  },
  {
    key: "elite_agency",
    name: "Elite Agency",
    audience: "agent",
    monthly: 199,
    yearly: 1990,
    description: "The complete global football business platform for elite teams.",
    features: ["Unlimited players", "Investor Hub", "Advanced analytics", "Premium ranking", "Global Agent League", "10 team members", "Priority support"],
    entitlements: ["basic_dashboard", "basic_player_vault", "advanced_player_vault", "basic_scouting", "advanced_scouting", "club_network", "transfer_market", "ai_assistant", "contract_tools", "invoice_tools", "investor_hub", "advanced_analytics", "agent_league", "premium_ranking", "team_members", "priority_support"],
    limits: { teamMembers: 10 },
  },
  {
    key: "club_basic",
    name: "Club Basic",
    audience: "club",
    monthly: 299,
    yearly: 2990,
    description: "A verified recruitment workspace for focused player discovery.",
    features: ["Player search", "5 shortlists", "Direct agent requests", "Player video access"],
    entitlements: ["basic_dashboard", "player_search", "shortlists", "agent_communication", "basic_player_vault"],
    limits: { shortlists: 5, teamMembers: 3 },
  },
  {
    key: "club_pro",
    name: "Club Pro",
    audience: "club",
    monthly: 699,
    yearly: 6990,
    description: "Deep recruitment intelligence for ambitious sporting departments.",
    featured: true,
    features: ["Advanced player search", "Direct agent communication", "Scouting tools", "Player comparison", "Market alerts", "25 shortlists"],
    entitlements: ["basic_dashboard", "player_search", "advanced_player_search", "shortlists", "agent_communication", "basic_player_vault", "advanced_player_vault", "basic_scouting", "advanced_scouting", "player_comparison", "market_alerts", "club_network"],
    limits: { shortlists: 25, teamMembers: 10 },
  },
  {
    key: "club_elite",
    name: "Club Elite",
    audience: "club",
    monthly: 1499,
    yearly: 14990,
    description: "Premium market command for global recruitment organizations.",
    features: ["Premium market access", "Advanced analytics", "Unlimited shortlists", "Priority visibility", "Club deal room", "Unlimited team"],
    entitlements: ["basic_dashboard", "player_search", "advanced_player_search", "shortlists", "unlimited_shortlists", "agent_communication", "basic_player_vault", "advanced_player_vault", "basic_scouting", "advanced_scouting", "player_comparison", "market_alerts", "club_network", "transfer_market", "advanced_analytics", "club_deal_room", "priority_visibility", "team_members", "priority_support"],
    limits: {},
  },
  {
    key: "academy",
    name: "Academy",
    audience: "academy",
    monthly: 99,
    yearly: 990,
    description: "A global pathway connecting academy talent with football opportunity.",
    features: ["Talent upload", "Scout connections", "Club visibility", "Academy Talent Network", "Development profiles"],
    entitlements: ["basic_dashboard", "talent_upload", "scout_connections", "club_visibility", "academy_network", "development_profiles", "basic_scouting"],
    limits: { players: 150, teamMembers: 5 },
  },
  {
    key: "founder",
    name: "Founder Plan",
    audience: "agent",
    monthly: null,
    yearly: 199,
    description: "Pro Agent access with lifetime locked pricing for the first 100 agents.",
    founder: true,
    features: ["All Pro Agent features", "Lifetime locked price", "Founder badge", "Early product influence", "Limited to 100 agents"],
    entitlements: ["basic_dashboard", "basic_player_vault", "advanced_player_vault", "basic_scouting", "advanced_scouting", "club_network", "transfer_market", "ai_assistant", "contract_tools", "invoice_tools"],
    limits: { players: 50, clubConnections: 100, scoutingReports: 250, teamMembers: 3 },
  },
];

export const planMap = Object.fromEntries(plans.map((plan) => [plan.key, plan])) as Record<PlanKey, PlanDefinition>;

const allEntitlements: FeatureKey[] = [
  "basic_dashboard",
  "basic_player_vault",
  "advanced_player_vault",
  "basic_scouting",
  "advanced_scouting",
  "club_network",
  "transfer_market",
  "ai_assistant",
  "contract_tools",
  "invoice_tools",
  "investor_hub",
  "advanced_analytics",
  "agent_league",
  "premium_ranking",
  "team_members",
  "player_search",
  "advanced_player_search",
  "shortlists",
  "unlimited_shortlists",
  "agent_communication",
  "player_comparison",
  "market_alerts",
  "club_deal_room",
  "priority_visibility",
  "talent_upload",
  "scout_connections",
  "club_visibility",
  "academy_network",
  "development_profiles",
  "priority_support",
];

export function isPlanKey(value: string): value is PlanKey {
  return value in planMap;
}

export function canAccess(planKey: PlanKey | null | undefined, feature: FeatureKey) {
  if (planKey === "elite_agency") return allEntitlements.includes(feature);
  return Boolean(planKey && planMap[planKey].entitlements.includes(feature));
}

export const featureLabels: Record<FeatureKey, string> = {
  basic_dashboard: "Command Center",
  basic_player_vault: "Player Vault",
  advanced_player_vault: "Advanced Player Vault",
  basic_scouting: "Scouting",
  advanced_scouting: "Advanced Scouting",
  club_network: "Club Network",
  transfer_market: "Transfer Market",
  ai_assistant: "Touchline AI",
  contract_tools: "Contract Tools",
  invoice_tools: "Invoice Tools",
  investor_hub: "Investor Hub",
  advanced_analytics: "Advanced Analytics",
  agent_league: "Global Agent League",
  premium_ranking: "Premium Ranking Visibility",
  team_members: "Multiple Team Members",
  player_search: "Player Search",
  advanced_player_search: "Advanced Player Search",
  shortlists: "Club Shortlists",
  unlimited_shortlists: "Unlimited Shortlists",
  agent_communication: "Direct Agent Communication",
  player_comparison: "Player Comparison",
  market_alerts: "Market Alerts",
  club_deal_room: "Club Deal Room",
  priority_visibility: "Priority Visibility",
  talent_upload: "Talent Upload",
  scout_connections: "Scout Connections",
  club_visibility: "Club Visibility",
  academy_network: "Academy Talent Network",
  development_profiles: "Player Development Profiles",
  priority_support: "Priority Support",
};

export const pathFeatures: Array<[string, FeatureKey]> = [
  ["/investors", "investor_hub"],
  ["/competition", "agent_league"],
  ["/rankings", "premium_ranking"],
  ["/ai", "ai_assistant"],
  ["/deals", "transfer_market"],
  ["/clubs", "club_network"],
  ["/agencies", "team_members"],
  ["/contracts", "contract_tools"],
  ["/documents", "advanced_player_vault"],
  ["/reports", "advanced_analytics"],
  ["/invoices", "invoice_tools"],
  ["/academies", "academy_network"],
];

export function featureForPath(pathname: string) {
  return pathFeatures.find(([path]) => pathname.startsWith(path))?.[1] ?? null;
}
