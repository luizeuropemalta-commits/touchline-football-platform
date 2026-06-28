import { getTouchlinePlayerTier, type TouchlinePlayerTier } from "@/lib/player-tier";
import { normalizeTouchlineAvatarSource, type TouchlineAvatarSource, type NormalizedTouchlineAvatar } from "./avatar-normalization";

export type TouchlineAvatarTier = TouchlinePlayerTier;

export type TouchlineEntityAvatarModel = NormalizedTouchlineAvatar & {
  tier: TouchlineAvatarTier;
  tierIcon: string;
  accent: string;
  accentRgb: string;
};

const tierIconByTier: Record<TouchlineAvatarTier, string> = {
  purple_diamond: "◆",
  blue_diamond: "◆",
  gold: "●",
  silver: "●",
  bronze: "●",
};

const tierColorByTier: Record<TouchlineAvatarTier, { accent: string; rgb: string }> = {
  purple_diamond: { accent: "#b85cff", rgb: "184,92,255" },
  blue_diamond: { accent: "#48d7ff", rgb: "72,215,255" },
  gold: { accent: "#f6c84c", rgb: "246,200,76" },
  silver: { accent: "#dfe7f2", rgb: "223,231,242" },
  bronze: { accent: "#d97824", rgb: "217,120,36" },
};

export function getTouchlineEntityTier(entity: { marketValue?: number | string | null }) {
  return getTouchlinePlayerTier(entity.marketValue ?? null);
}

export function getTouchlineTierIcon(tier: TouchlineAvatarTier) {
  return tierIconByTier[tier];
}

export function buildTouchlineEntityAvatar(input: TouchlineAvatarSource & { marketValue?: number | string | null; tier?: TouchlineAvatarTier | null }): TouchlineEntityAvatarModel {
  const normalized = normalizeTouchlineAvatarSource(input);
  const tier = input.tier ?? getTouchlineEntityTier({ marketValue: input.marketValue });
  const color = tierColorByTier[tier];

  return {
    ...normalized,
    tier,
    tierIcon: getTouchlineTierIcon(tier),
    accent: color.accent,
    accentRgb: color.rgb,
  };
}
