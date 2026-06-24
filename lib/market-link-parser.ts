export type ParsedTransfermarktType = "player" | "agent" | "club";

export type ParsedTransfermarktUrl = {
  transfermarktId: string;
  entityType: ParsedTransfermarktType;
  canonicalUrl: string;
  profileUrl: string;
  name: string;
  sourceDomain: string;
};

export const parsedTransfermarktTypes = new Set(["player", "agent", "club"]);

function canonicalize(target: URL) {
  target.hash = "";
  target.search = "";
  target.hostname = target.hostname.toLowerCase();
  target.pathname = target.pathname.replace(/\/+$/g, "");
  return target.toString();
}

function titleFromSlug(canonicalUrl: string) {
  try {
    const url = new URL(canonicalUrl);
    const blocked = new Set(["profil", "spieler", "berater", "beraterfirma", "verein"]);
    const slug = url.pathname
      .split("/")
      .filter(Boolean)
      .find((part) => !blocked.has(part.toLowerCase()) && !/^\d+$/.test(part));
    if (!slug) return null;
    return decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .slice(0, 180);
  } catch {
    return null;
  }
}

export function extractTransfermarktEntityId(value: string, type?: ParsedTransfermarktType | null) {
  const path = (() => {
    try {
      return new URL(value).pathname;
    } catch {
      return value;
    }
  })();

  const playerId = path.match(/\/spieler\/(\d+)/i)?.[1] ?? null;
  const agentId = path.match(/\/berater\/(\d+)/i)?.[1] ?? path.match(/\/beraterfirma\/(\d+)/i)?.[1] ?? null;
  const clubId = path.match(/\/verein\/(\d+)/i)?.[1] ?? null;

  if (type === "player") return playerId;
  if (type === "agent") return agentId;
  if (type === "club") return clubId;
  return playerId ?? agentId ?? clubId;
}

export function parseTransfermarktEntityUrl(value?: string | null, expectedType?: ParsedTransfermarktType | null): ParsedTransfermarktUrl | null {
  if (!value) return null;

  let target: URL;
  try {
    target = new URL(value.trim());
  } catch {
    return null;
  }

  if (target.protocol !== "https:") return null;
  if (!target.hostname.toLowerCase().includes("transfermarkt.")) return null;

  const canonicalUrl = canonicalize(target);
  const playerId = extractTransfermarktEntityId(canonicalUrl, "player");
  const agentId = extractTransfermarktEntityId(canonicalUrl, "agent");
  const clubId = extractTransfermarktEntityId(canonicalUrl, "club");

  const entityType: ParsedTransfermarktType | null = playerId ? "player" : agentId ? "agent" : clubId ? "club" : null;
  const transfermarktId = playerId ?? agentId ?? clubId;
  if (!entityType || !transfermarktId) return null;
  if (expectedType && expectedType !== entityType) return null;

  return {
    transfermarktId,
    entityType,
    canonicalUrl,
    profileUrl: canonicalUrl,
    name: titleFromSlug(canonicalUrl) ?? `Transfermarkt ${entityType} ${transfermarktId}`,
    sourceDomain: target.hostname.replace(/^www\./, ""),
  };
}

export function transfermarktDedupeKey(value: ParsedTransfermarktUrl) {
  return `${value.entityType}:${value.transfermarktId}`;
}
