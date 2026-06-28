"use client";

import type { CSSProperties } from "react";
import { buildTouchlineEntityAvatar, type TouchlineAvatarTier } from "@/lib/avatar/touchline-avatar";
import type { TouchlineEntityType } from "@/lib/avatar/avatar-normalization";
import { cn } from "@/lib/utils";

export type TouchlineEntityAvatarProps = {
  entityType: TouchlineEntityType;
  name: string;
  sourceImageUrl?: string | null;
  sourceImageProvider?: string | null;
  sourceImageLicenseStatus?: string | null;
  sourceImageFetchedAt?: string | null;
  touchlineAvatarUrl?: string | null;
  avatarRenderStatus?: "rendered" | "fallback" | "missing_source" | null;
  avatarRenderVersion?: string | null;
  avatarSourceHash?: string | null;
  avatarRenderType?: "touchline_branded_render" | "touchline_initials_fallback" | null;
  marketValue?: number | string | null;
  tier?: TouchlineAvatarTier | null;
  size?: "sm" | "md" | "lg" | "card";
  chrome?: "full" | "clean";
  showTierIcon?: boolean;
  className?: string;
};

export function TouchlineEntityAvatar({
  size = "md",
  chrome = "full",
  showTierIcon = true,
  className,
  ...props
}: TouchlineEntityAvatarProps) {
  const avatar = buildTouchlineEntityAvatar(props);
  const image = avatar.touchlineAvatarUrl ?? avatar.sourceImageUrl;
  const isLogo = avatar.entityType === "club" || avatar.entityType === "agency";
  const isCardSize = size === "card";
  const isCleanChrome = chrome === "clean" || isCardSize;
  const sizes = {
    sm: "size-11 rounded-xl",
    md: "size-16 rounded-2xl",
    lg: "size-24 rounded-[1.35rem]",
    card: "h-full w-full rounded-[1.5rem]",
  };
  const style = {
    "--avatar-accent": avatar.accent,
    "--avatar-rgb": avatar.accentRgb,
  } as CSSProperties;

  return (
    <span
      className={cn(
        "touchline-rendered-avatar relative isolate block shrink-0 overflow-hidden",
        isCleanChrome
          ? "border-0 bg-transparent shadow-none"
          : "border border-[rgba(var(--avatar-rgb),.38)] bg-[#02070b] shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_18px_44px_rgba(0,0,0,.42)]",
        sizes[size],
        className,
      )}
      style={style}
      data-avatar-render-type={avatar.avatarRenderType}
      data-avatar-render-status={avatar.avatarRenderStatus}
      data-source-image-provider={avatar.sourceImageProvider ?? "none"}
      aria-label={`${avatar.name} Touchline Rendered Avatar`}
      title="Touchline Rendered Avatar"
    >
      {!isCleanChrome ? <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--avatar-rgb),.38),transparent_38%),radial-gradient(circle_at_50%_95%,rgba(var(--avatar-rgb),.2),transparent_52%),linear-gradient(145deg,rgba(255,255,255,.08),transparent_45%)]" /> : null}
      {!isCleanChrome ? <span className="absolute inset-[7%] rounded-[inherit] border border-[rgba(var(--avatar-rgb),.28)] shadow-[inset_0_0_26px_rgba(var(--avatar-rgb),.12)]" /> : null}

      {image ? (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className={cn(
            "absolute z-10 transition",
            isLogo
              ? cn("object-contain", isCleanChrome ? "inset-[4%] h-[92%] w-[92%] drop-shadow-[0_8px_16px_rgba(0,0,0,.72)]" : "inset-[18%] h-[64%] w-[64%] drop-shadow-[0_12px_26px_rgba(0,0,0,.75)]")
              : "inset-0 h-full w-full object-cover object-top opacity-95 brightness-[.22] contrast-[1.65] grayscale saturate-0",
          )}
          style={
            isLogo
              ? undefined
              : {
                  WebkitMaskImage: "radial-gradient(ellipse at 50% 30%,#000 0 44%,rgba(0,0,0,.92) 62%,transparent 86%),linear-gradient(180deg,#000 0 72%,rgba(0,0,0,.74) 86%,transparent 100%)",
                  maskImage: "radial-gradient(ellipse at 50% 30%,#000 0 44%,rgba(0,0,0,.92) 62%,transparent 86%),linear-gradient(180deg,#000 0 72%,rgba(0,0,0,.74) 86%,transparent 100%)",
                }
          }
        />
      ) : (
        <span className="absolute inset-0 z-10 grid place-items-center">
          <span className="font-display text-[clamp(.9rem,4vw,1.65rem)] font-black uppercase italic text-white/82 drop-shadow-[0_0_16px_rgba(var(--avatar-rgb),.42)]">
            {avatar.initials}
          </span>
        </span>
      )}

      {!isLogo && !isCleanChrome ? (
        <>
          <span className="absolute left-1/2 top-[15%] z-20 h-[42%] w-[36%] -translate-x-1/2 rounded-[48%] bg-[radial-gradient(circle_at_50%_12%,rgba(255,240,190,.2),rgba(0,0,0,.72)_48%,rgba(0,0,0,.98)_78%)] opacity-35" />
          <span className="absolute inset-x-[21%] bottom-[10%] z-20 h-[42%] rounded-t-[48%] bg-[linear-gradient(180deg,rgba(255,238,185,.12),rgba(0,0,0,.76))] opacity-55" />
        </>
      ) : null}

      {!isCleanChrome ? <span className="absolute inset-0 z-30 bg-[linear-gradient(118deg,transparent_24%,rgba(255,255,255,.16)_42%,transparent_58%)] opacity-30" /> : null}
      {!isCleanChrome ? <span className="absolute inset-0 z-40 rounded-[inherit] ring-1 ring-white/10" /> : null}
      {size !== "card" && showTierIcon ? (
        <span className="absolute right-[10%] top-[10%] z-40 grid size-[18%] min-h-4 min-w-4 place-items-center rounded-full border border-[rgba(var(--avatar-rgb),.54)] bg-black/55 text-[.48rem] font-black text-[var(--avatar-accent)]">
          {avatar.tierIcon}
        </span>
      ) : null}
    </span>
  );
}
