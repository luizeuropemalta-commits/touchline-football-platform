export type NormalizedPlayer = {
  id: string;
  tmPlayerId?: string | null;
  name: string;
  displayName: string;
  photoUrl?: string | null;
  avatarUrl?: string | null;
  nationality?: string | null;
  position?: string | null;
  club?: string | null;
  marketValue?: number | null;
  marketValueText?: string | null;
  currency?: string | null;
  contractUntil?: string | null;
  agentName?: string | null;
  syncStatus?: string | null;
  source?: string | null;
  href?: string | null;
};

export function normalizeSearchText(value?: string | number | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function compactSearchText(value?: string | number | null) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

export function playerInitials(name?: string | null) {
  const parts = normalizeSearchText(name)
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return "TL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function playerSearchScore(player: Pick<NormalizedPlayer, "name" | "displayName" | "club" | "position" | "nationality" | "marketValue">, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;

  const haystack = normalizeSearchText([
    player.displayName,
    player.name,
    player.club,
    player.position,
    player.nationality,
  ].filter(Boolean).join(" "));
  const compactHaystack = compactSearchText(haystack);
  const compactQuery = compactSearchText(normalizedQuery);
  const name = normalizeSearchText(player.displayName || player.name);

  let score = 0;
  if (name === normalizedQuery) score += 1000;
  if (name.startsWith(normalizedQuery)) score += 700;
  if (name.includes(normalizedQuery)) score += 420;
  if (haystack.includes(normalizedQuery)) score += 240;
  if (compactHaystack.includes(compactQuery)) score += 180;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  score += terms.filter((term) => haystack.includes(term)).length * 90;
  score += terms.filter((term) => compactHaystack.includes(term)).length * 35;

  const marketValue = typeof player.marketValue === "number" && Number.isFinite(player.marketValue) ? player.marketValue : 0;
  score += Math.min(90, Math.round(marketValue / 1_000_000));

  return score;
}

export function rankPlayersForQuery<T extends NormalizedPlayer>(players: T[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return players;

  return players
    .map((player) => ({ player, score: playerSearchScore(player, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.player.marketValue ?? 0) - (a.player.marketValue ?? 0))
    .map((entry) => entry.player);
}

export function normalizePlayer(input: {
  id?: string | null;
  tmPlayerId?: string | null;
  transfermarktPlayerId?: string | null;
  sourceId?: string | null;
  name?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  avatarUrl?: string | null;
  nationality?: string | null;
  position?: string | null;
  club?: string | null;
  currentClub?: string | null;
  marketValue?: number | null;
  marketValueText?: string | null;
  currency?: string | null;
  contractUntil?: string | null;
  contractEndDate?: string | null;
  agentName?: string | null;
  agencyName?: string | null;
  syncStatus?: string | null;
  source?: string | null;
  sourceProvider?: string | null;
  href?: string | null;
}): NormalizedPlayer {
  const fullName = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  const name = input.displayName || input.name || fullName || "Unnamed player";
  const tmPlayerId = input.tmPlayerId ?? input.transfermarktPlayerId ?? input.sourceId ?? null;
  const source = input.source ?? input.sourceProvider ?? (tmPlayerId ? "transfermarkt" : "touchline");

  return {
    id: input.id || tmPlayerId || name,
    tmPlayerId,
    name,
    displayName: name,
    photoUrl: input.photoUrl ?? null,
    avatarUrl: input.avatarUrl ?? input.photoUrl ?? null,
    nationality: input.nationality ?? null,
    position: input.position ?? null,
    club: input.club ?? input.currentClub ?? null,
    marketValue: input.marketValue ?? null,
    marketValueText: input.marketValueText ?? null,
    currency: input.currency ?? "EUR",
    contractUntil: input.contractUntil ?? input.contractEndDate ?? null,
    agentName: input.agentName ?? input.agencyName ?? null,
    syncStatus: input.syncStatus ?? (source ? "Synced" : "Data pending"),
    source,
    href: input.href ?? null,
  };
}
