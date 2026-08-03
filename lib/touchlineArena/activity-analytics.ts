export type TouchlineActivityArea =
  | "arena"
  | "market"
  | "training"
  | "ranking"
  | "club-owner"
  | "club"
  | "player"
  | "admin"
  | "other";

const ARENA_PANELS = new Set(["market", "training", "ranking"]);

export function touchlineActivityArea(pathname: string, panel?: string | null): TouchlineActivityArea | null {
  if (pathname === "/arena" || pathname.startsWith("/arena/")) {
    const routePanel = pathname.split("/")[2] || "";
    const activePanel = panel || routePanel;
    return ARENA_PANELS.has(activePanel) ? (activePanel as "market" | "training" | "ranking") : "arena";
  }
  if (pathname.startsWith("/club-owner")) return "club-owner";
  if (pathname.startsWith("/touchline-clubs")) return "club";
  if (pathname.startsWith("/touchline-players")) return "player";
  if (pathname.startsWith("/touchline-player-card-rankings") || pathname.startsWith("/touchline-tables")) return "ranking";
  if (pathname.startsWith("/admin") || pathname.startsWith("/football-search")) return "admin";
  if (pathname.startsWith("/notifications")) return "other";
  return null;
}
