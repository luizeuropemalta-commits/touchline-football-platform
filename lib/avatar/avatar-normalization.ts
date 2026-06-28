export type TouchlineEntityType = "player" | "club" | "agent" | "agency";

export type TouchlineAvatarRenderType = "touchline_branded_render" | "touchline_initials_fallback";

export type TouchlineAvatarRenderStatus = "rendered" | "fallback" | "missing_source";

export type TouchlineAvatarSource = {
  entityType: TouchlineEntityType;
  name: string;
  sourceImageUrl?: string | null;
  sourceImageProvider?: string | null;
  sourceImageLicenseStatus?: string | null;
  sourceImageFetchedAt?: string | null;
  touchlineAvatarUrl?: string | null;
  avatarRenderStatus?: TouchlineAvatarRenderStatus | null;
  avatarRenderVersion?: string | null;
  avatarSourceHash?: string | null;
  avatarRenderType?: TouchlineAvatarRenderType | null;
};

export type NormalizedTouchlineAvatar = Required<
  Pick<TouchlineAvatarSource, "entityType" | "name">
> & {
  initials: string;
  sourceImageUrl: string | null;
  sourceImageProvider: string | null;
  sourceImageLicenseStatus: string;
  sourceImageFetchedAt: string | null;
  touchlineAvatarUrl: string | null;
  avatarRenderStatus: TouchlineAvatarRenderStatus;
  avatarRenderVersion: string;
  avatarSourceHash: string | null;
  avatarRenderType: TouchlineAvatarRenderType;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || /^(null|undefined|none|n\/a)$/i.test(trimmed)) return null;
  return trimmed;
}

export function getTouchlineAvatarInitials(name?: string | null) {
  const clean = cleanText(name) ?? "TL";
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function normalizeTouchlineAvatarSource(input: TouchlineAvatarSource): NormalizedTouchlineAvatar {
  const sourceImageUrl = cleanText(input.sourceImageUrl);
  const touchlineAvatarUrl = cleanText(input.touchlineAvatarUrl);
  const hasRenderedImage = Boolean(touchlineAvatarUrl || sourceImageUrl);

  return {
    entityType: input.entityType,
    name: cleanText(input.name) ?? "Touchline Entity",
    initials: getTouchlineAvatarInitials(input.name),
    sourceImageUrl,
    sourceImageProvider: cleanText(input.sourceImageProvider),
    sourceImageLicenseStatus: cleanText(input.sourceImageLicenseStatus) ?? "source_tracked",
    sourceImageFetchedAt: cleanText(input.sourceImageFetchedAt),
    touchlineAvatarUrl,
    avatarRenderStatus: input.avatarRenderStatus ?? (hasRenderedImage ? "rendered" : "fallback"),
    avatarRenderVersion: cleanText(input.avatarRenderVersion) ?? "runtime-css-v1",
    avatarSourceHash: cleanText(input.avatarSourceHash),
    avatarRenderType: input.avatarRenderType ?? (hasRenderedImage ? "touchline_branded_render" : "touchline_initials_fallback"),
  };
}
