export type PlayerSocialKind = "follow" | "like";
export type PlayerSocialSummary = {
  followerCount: number;
  likeCount: number;
  following: boolean;
  liked: boolean;
};

export function parsePlayerSocialProviderId(value: unknown): string | null {
  return typeof value === "string" && /^[1-9]\d{0,14}$/.test(value) ? value : null;
}

export function parsePlayerSocialMutation(value: unknown): { kind: PlayerSocialKind; active: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "kind" && key !== "active")) return null;
  if ((input.kind !== "follow" && input.kind !== "like") || typeof input.active !== "boolean") return null;
  return { kind: input.kind, active: input.active };
}

export function parsePlayerSocialSummary(value: unknown): PlayerSocialSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.followerCount) || (input.followerCount as number) < 0
    || !Number.isSafeInteger(input.likeCount) || (input.likeCount as number) < 0
    || typeof input.following !== "boolean" || typeof input.liked !== "boolean") return null;
  return { followerCount: input.followerCount as number, likeCount: input.likeCount as number,
    following: input.following, liked: input.liked };
}

export function isPlayerSocialSameOrigin(request: Request): boolean {
  try {
    return new URL(request.headers.get("origin") ?? "").origin === new URL(request.url).origin
      && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}
