type TouchlineClubOwnerIdentityUser = Readonly<{
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}>;

export const PUBLIC_CLUB_OWNER_SLUG = "luiz-lopez" as const;

export const PUBLIC_CLUB_OWNER_IDENTITY = Object.freeze({
  slug: PUBLIC_CLUB_OWNER_SLUG,
  name: "Luiz Lopez",
  avatarUrl: "/touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png",
  nationality: "🇧🇷 Brasil",
  city: "Malta",
  since: "2026",
  entityId: "club-owner:luiz-lopez",
  followerCount: 18_420,
});

function cleanMetadataText(value: unknown, maximumLength = 160) {
  return typeof value === "string"
    ? value.trim().slice(0, maximumLength)
    : "";
}

function profileAvatarUrl(metadata: Record<string, unknown>) {
  const value = cleanMetadataText(metadata.avatar_url)
    || cleanMetadataText(metadata.picture);

  if (value.startsWith("/") || value.startsWith("https://")) return value;
  return "/icons/touchline-512.png";
}

function registeredYear(createdAt?: string) {
  if (!createdAt) return "—";
  const year = new Date(createdAt).getUTCFullYear();
  return Number.isFinite(year) ? String(year) : "—";
}

export function normalizeTouchlineClubOwnerSlug(value?: string | null) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "";
}

export function touchlineClubOwnerSlugForUser(user?: TouchlineClubOwnerIdentityUser | null) {
  if (!user) return "";
  const metadata = user.user_metadata ?? {};
  return normalizeTouchlineClubOwnerSlug(
    cleanMetadataText(metadata.club_owner_slug)
      || cleanMetadataText(metadata.owner_slug)
      || cleanMetadataText(metadata.full_name)
      || cleanMetadataText(metadata.name)
      || cleanMetadataText(user.email?.split("@")[0]),
  );
}

export function touchlineIsKnownPublicClubOwnerSlug(slug?: string | null) {
  return normalizeTouchlineClubOwnerSlug(slug) === PUBLIC_CLUB_OWNER_SLUG;
}

export function resolveTouchlineClubOwnerPageIdentity(
  user?: TouchlineClubOwnerIdentityUser | null,
  requestedSlug?: string | null,
) {
  const normalizedRequestedSlug = normalizeTouchlineClubOwnerSlug(requestedSlug);

  if (user) {
    const userSlug = touchlineClubOwnerSlugForUser(user);
    if (!normalizedRequestedSlug || normalizedRequestedSlug === userSlug) {
      const metadata = user.user_metadata ?? {};
      const name = cleanMetadataText(metadata.full_name)
        || cleanMetadataText(metadata.name)
        || cleanMetadataText(user.email?.split("@")[0])
        || "TouchLine ClubOwner";
      const nationality = cleanMetadataText(metadata.nationality)
        || cleanMetadataText(metadata.country)
        || "—";
      const city = cleanMetadataText(metadata.city)
        || cleanMetadataText(metadata.location)
        || "—";

      return {
        slug: userSlug,
        name,
        avatarUrl: profileAvatarUrl(metadata),
        nationality,
        city,
        since: registeredYear(user.created_at),
        entityId: `club-owner:${user.id}`,
        followerCount: 0,
        isAuthenticatedClubOwner: true,
      } as const;
    }
  }

  if (normalizedRequestedSlug && normalizedRequestedSlug !== PUBLIC_CLUB_OWNER_SLUG) {
    return null;
  }

  if (!user) {
    return {
      ...PUBLIC_CLUB_OWNER_IDENTITY,
      isAuthenticatedClubOwner: false,
    } as const;
  }

  return {
    ...PUBLIC_CLUB_OWNER_IDENTITY,
    isAuthenticatedClubOwner: false,
  } as const;
}
