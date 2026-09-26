import { parsePlayerSocialProviderId, parsePlayerSocialSummary, type PlayerSocialKind } from "./player-social-contract.ts";
import { normalizeTouchLineProviderPlayerId } from "./player-links.ts";

export function normalizePlayerSocialSubject(value: string): string | null {
  return parsePlayerSocialProviderId(normalizeTouchLineProviderPlayerId(value));
}

export function playerSocialIdFromProfileHref(href?: string): string | null {
  if (!href || !href.startsWith("/touchline-players/")) return null;
  try { return normalizePlayerSocialSubject(new URL(href, "https://touchline.invalid").searchParams.get("playerId") ?? ""); }
  catch { return null; }
}

/** An explicit card identity must not conflict with an existing profile identity. */
export function resolvePlayerSocialSubject(explicitId?: string, profileHref?: string): string | null {
  const linked = playerSocialIdFromProfileHref(profileHref);
  if (explicitId === undefined) return linked;
  const explicit = normalizePlayerSocialSubject(explicitId);
  if (!explicit || (linked && linked !== explicit)) return null;
  return explicit;
}

export async function requestPlayerSocial(providerId: string, input: {
  signal: AbortSignal;
  mutation?: { kind: PlayerSocialKind; active: boolean };
  fetcher?: typeof fetch;
}) {
  if (!parsePlayerSocialProviderId(providerId)) throw new Error("INVALID_PLAYER");
  if (input.signal.aborted) throw new DOMException("Social request cancelled", "AbortError");
  const response = await (input.fetcher ?? fetch)(`/api/touchline/players/${providerId}/social`, {
    method: input.mutation ? "PUT" : "GET", cache: "no-store", credentials: "same-origin", signal: input.signal,
    ...(input.mutation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.mutation) } : {}),
  });
  if (response.status === 401) throw new Error("AUTHENTICATION_REQUIRED");
  const payload = await response.json().catch(() => null);
  // Cancellation may arrive after fetch settles or while the body is consumed.
  if (input.signal.aborted) throw new DOMException("Social request cancelled", "AbortError");
  const summary = parsePlayerSocialSummary(payload?.data);
  if (!response.ok || payload?.ok !== true || !summary || typeof payload.canReact !== "boolean") throw new Error("SOCIAL_UNAVAILABLE");
  return { summary, canReact: payload.canReact as boolean };
}
