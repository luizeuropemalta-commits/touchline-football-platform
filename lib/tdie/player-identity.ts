export const TDIE_PLAYER_IDENTITY_VERSION = "tdie-player-v1";

export type TdiePlayerIdentityStatus = "generated" | "premium_fallback" | "pending";
export type TdiePlayerRenderMode = "generated_artwork" | "premium_fallback";

export type TdiePlayerIdentityAccent = {
  primary: string;
  secondary: string;
  glow: string;
  text: string;
  chip: string;
};

export type TdiePlayerIdentity = {
  version: string;
  status: TdiePlayerIdentityStatus;
  renderMode: TdiePlayerRenderMode;
  artworkUrl?: string | null;
  initials: string;
  displayName: string;
  cardTier: "bronze" | "silver" | "gold";
  accent: TdiePlayerIdentityAccent;
  shirtNumber?: string | null;
  kitHint?: string | null;
  positionLabel?: string | null;
  clubLabel?: string | null;
  sourceSignature: string;
  cacheKey: string;
  lastGeneratedAt?: string | null;
  staleAfter?: string | null;
};

export type TdiePlayerIdentityInput = {
  playerSource: string;
  playerSourceId: string;
  provider?: string | null;
  providerPlayerId?: string | null;
  name: string;
  clubName?: string | null;
  position?: string | null;
  nationality?: string | null;
  marketValue?: number | null;
  currency?: string | null;
  shirtNumber?: string | null;
  sourceReferenceUrl?: string | null;
  sourcePhotoUrl?: string | null;
  sourceUpdatedAt?: string | null;
};

const identityAccents: TdiePlayerIdentityAccent[] = [
  {
    primary: "from-cyan-400/24 via-blue-500/10 to-[#a3ff12]/16",
    secondary: "from-cyan-300/18 via-transparent to-[#a3ff12]/12",
    glow: "shadow-[0_0_46px_rgba(34,211,238,.16)]",
    text: "text-cyan-100",
    chip: "border-cyan-300/25 bg-cyan-300/[.08] text-cyan-100",
  },
  {
    primary: "from-amber-300/24 via-yellow-600/10 to-cyan-400/14",
    secondary: "from-amber-200/18 via-transparent to-cyan-300/12",
    glow: "shadow-[0_0_46px_rgba(251,191,36,.16)]",
    text: "text-amber-100",
    chip: "border-amber-300/30 bg-amber-300/[.09] text-amber-100",
  },
  {
    primary: "from-[#a3ff12]/20 via-emerald-500/10 to-cyan-300/14",
    secondary: "from-[#a3ff12]/18 via-transparent to-cyan-300/12",
    glow: "shadow-[0_0_46px_rgba(163,255,18,.14)]",
    text: "text-[#d8ff8f]",
    chip: "border-[#a3ff12]/28 bg-[#a3ff12]/[.08] text-[#d8ff8f]",
  },
  {
    primary: "from-violet-300/18 via-cyan-500/10 to-amber-300/16",
    secondary: "from-violet-200/14 via-transparent to-amber-200/12",
    glow: "shadow-[0_0_46px_rgba(167,139,250,.13)]",
    text: "text-violet-100",
    chip: "border-violet-300/25 bg-violet-300/[.08] text-violet-100",
  },
];

function normalizeText(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function playerInitials(name: string) {
  const parts = normalizeText(name).split(" ").filter(Boolean);
  if (!parts.length) return "TL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function resolvePlayerCardTier(marketValue?: number | null): TdiePlayerIdentity["cardTier"] {
  if (typeof marketValue === "number" && Number.isFinite(marketValue) && marketValue >= 50_000_000) return "gold";
  if (typeof marketValue === "number" && Number.isFinite(marketValue) && marketValue >= 5_000_000) return "silver";
  return "bronze";
}

export function createTdieSourceSignature(input: TdiePlayerIdentityInput) {
  return [
    TDIE_PLAYER_IDENTITY_VERSION,
    normalizeText(input.provider),
    normalizeText(input.providerPlayerId),
    normalizeText(input.name).toLowerCase(),
    normalizeText(input.clubName).toLowerCase(),
    normalizeText(input.position).toLowerCase(),
    normalizeText(input.nationality).toLowerCase(),
    input.marketValue ?? "",
    normalizeText(input.currency),
    normalizeText(input.shirtNumber),
    normalizeText(input.sourceReferenceUrl),
    normalizeText(input.sourcePhotoUrl),
    normalizeText(input.sourceUpdatedAt),
  ].join("|");
}

export function buildTdiePlayerIdentity(input: TdiePlayerIdentityInput): TdiePlayerIdentity {
  const sourceSignature = createTdieSourceSignature(input);
  const seed = `${input.playerSource}:${input.playerSourceId}:${normalizeText(input.name)}`;
  const accent = identityAccents[hashText(seed) % identityAccents.length];
  const now = new Date();
  const staleAfter = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);

  return {
    version: TDIE_PLAYER_IDENTITY_VERSION,
    status: "premium_fallback",
    renderMode: "premium_fallback",
    artworkUrl: null,
    initials: playerInitials(input.name),
    displayName: normalizeText(input.name) || "Touchline Player",
    cardTier: resolvePlayerCardTier(input.marketValue),
    accent,
    shirtNumber: normalizeText(input.shirtNumber) || null,
    kitHint: normalizeText(input.clubName) || null,
    positionLabel: normalizeText(input.position) || null,
    clubLabel: normalizeText(input.clubName) || null,
    sourceSignature,
    cacheKey: `${input.playerSource}:${input.playerSourceId}:${TDIE_PLAYER_IDENTITY_VERSION}`,
    lastGeneratedAt: now.toISOString(),
    staleAfter: staleAfter.toISOString(),
  };
}

export function isTdieIdentityFresh(identity: TdiePlayerIdentity | null | undefined, input: TdiePlayerIdentityInput) {
  if (!identity) return false;
  if (identity.version !== TDIE_PLAYER_IDENTITY_VERSION) return false;
  return identity.sourceSignature === createTdieSourceSignature(input);
}
