export type TouchlineLiveLineupRole = "goalkeeper" | "defender" | "midfielder" | "forward";

export type TouchlineLiveLineupClub = Readonly<{
  teamId: string;
  name: string;
  shortCode: string;
  logoUrl?: string | null;
  aliases?: readonly string[];
}>;

export type TouchlineLiveLineupPlayer = {
  id: string;
  providerId?: string | null;
  clubTeamId?: string | null;
  clubName: string;
  clubShortCode: string;
  clubLogoUrl?: string | null;
  name: string;
  role: TouchlineLiveLineupRole;
};

function normalizeClubIdentity(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(?:fc|football club)\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function touchlineLivePlayerIdentity(player: TouchlineLiveLineupPlayer) {
  const providerId = String(player.providerId ?? "").trim();
  if (providerId) return `provider:${providerId}`;
  return `id:${String(player.id).trim()}`;
}

export function normalizeTouchlineLiveSquad<T extends TouchlineLiveLineupPlayer>(
  players: readonly T[],
  club: TouchlineLiveLineupClub,
  responseTeamId: string | number | null | undefined,
) {
  if (String(responseTeamId ?? "").trim() !== club.teamId) return [] as T[];

  const expectedClubNames = new Set(
    [club.name, club.shortCode, ...(club.aliases ?? [])].map(normalizeClubIdentity),
  );
  const seen = new Set<string>();
  const normalized: T[] = [];

  for (const player of players) {
    if (String(player.clubTeamId ?? "").trim() !== club.teamId) continue;
    if (
      !expectedClubNames.has(normalizeClubIdentity(player.clubName))
      && normalizeClubIdentity(player.clubShortCode) !== normalizeClubIdentity(club.shortCode)
    ) continue;

    const identity = touchlineLivePlayerIdentity(player);
    if (seen.has(identity)) continue;
    seen.add(identity);
    normalized.push({
      ...player,
      clubTeamId: club.teamId,
      clubName: club.name,
      clubShortCode: club.shortCode,
      clubLogoUrl: club.logoUrl ?? player.clubLogoUrl ?? null,
    });
  }

  return normalized;
}

function roleSortWeight(role: TouchlineLiveLineupRole) {
  if (role === "goalkeeper") return 0;
  if (role === "defender") return 1;
  if (role === "midfielder") return 2;
  return 3;
}

export function buildTouchlineLiveEleven<T extends TouchlineLiveLineupPlayer>({
  club,
  fallback,
  forbiddenPlayerIds,
  primary,
  squad,
}: {
  club: TouchlineLiveLineupClub;
  fallback: readonly T[];
  forbiddenPlayerIds?: ReadonlySet<string>;
  primary?: readonly T[];
  squad: readonly T[];
}) {
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const blockedIds = forbiddenPlayerIds ?? new Set<string>();

  function add(player: T) {
    if (selected.length >= 11 || String(player.clubTeamId ?? "").trim() !== club.teamId) return;
    const identity = touchlineLivePlayerIdentity(player);
    if (blockedIds.has(identity) || selectedIds.has(identity)) return;
    selected.push(player);
    selectedIds.add(identity);
  }

  for (const player of primary ?? []) add(player);
  if (selected.length >= 11) return selected.slice(0, 11);

  const orderedSquad = [...squad].sort(
    (a, b) => roleSortWeight(a.role) - roleSortWeight(b.role) || a.name.localeCompare(b.name),
  );
  const targetRoleCounts: Record<TouchlineLiveLineupRole, number> = {
    goalkeeper: 1,
    defender: 4,
    midfielder: 3,
    forward: 3,
  };

  for (const role of ["goalkeeper", "defender", "midfielder", "forward"] as const) {
    let currentRoleCount = selected.filter((player) => player.role === role).length;
    for (const player of orderedSquad) {
      if (currentRoleCount >= targetRoleCounts[role] || selected.length >= 11) break;
      if (player.role !== role) continue;
      const before = selected.length;
      add(player);
      if (selected.length > before) currentRoleCount += 1;
    }
  }

  for (const player of orderedSquad) add(player);
  for (const player of fallback) add(player);

  return selected.slice(0, 11);
}
